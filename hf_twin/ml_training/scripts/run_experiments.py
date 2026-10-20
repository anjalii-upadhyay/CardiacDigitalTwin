"""
Step 3.3: pre-registered improvement experiments (fixed before seeing any results, all reported).

  V0  current model: v1 features + record, SVR
  V1  + richer vibration features (all motion axes, beat shape)
  V2  V1 + the SVR picks its own inputs inside each training fold
  V3  V2 + after-medicine slices used as extra training rows (scored on baseline rows only)

Every variant is scored on the same clean baseline recordings, with patients held out, repeated with
3 different patient splits. The final score uses the average of the 3 out-of-fold predictions.
Success rule (unchanged): beat the naive guess with the 95% interval excluding zero.

Outputs: artifacts/experiments.json, artifacts/experiments_oof.csv
Run from the repo root:
    python_backend/venv/Scripts/python.exe -m hf_twin.ml_training.scripts.run_experiments [target ...]
"""

import csv
import json
import sys
import time

import numpy as np

from hf_twin.ml_training import config, dataset, evaluate, features

SEEDS = (42, 7, 2026)
V1_COLS = features.SIGNAL_FEATURES + features.RECORD_FEATURES
V2_COLS = features.SIGNAL_FEATURES + features.VIBRATION_V2_FEATURES + features.RECORD_FEATURES
VARIANTS = {
    "V0_current": (V1_COLS, "svr", False),
    "V1_rich_vibration": (V2_COLS, "svr", False),
    "V2_rich_plus_selection": (V2_COLS, "svr_select", False),
    "V3_plus_after_medicine": (V2_COLS, "svr_select", True),
}


def run(target):
    table = [r for r in dataset.load_table() if r["clean_set"] and r["signal_ok"]]
    base = [r for r in table if r["phase"] == "baseline" and np.isfinite(r[target])]
    extra = [r for r in table if r["phase"] == "after_medicine" and np.isfinite(r[target])]
    y_base = np.array([r[target] for r in base])
    g_base = np.array([r["patient_id"] for r in base])
    decomp = np.array([r["pdecomp"] for r in base])

    naive = np.mean([evaluate.out_of_fold_predictions(np.zeros((len(base), 1)), y_base, g_base, "naive_mean", seed=s)[0]
                     for s in SEEDS], axis=0)
    result = {"n_baseline": len(base), "n_patients": len(set(g_base)), "n_after_medicine_rows": len(extra),
              "naive": evaluate.summary(y_base, naive), "variants": {}}
    oof = {"rec_id": [r["rec_id"] for r in base], "measured": y_base.tolist(), "naive": naive.tolist()}
    for name, (cols, model, use_extra) in VARIANTS.items():
        t0 = time.time()
        rows = base + (extra if use_extra else [])
        X = np.array([[r[c] for c in cols] for r in rows], dtype=float)
        y = np.array([r[target] for r in rows])
        g = np.array([r["patient_id"] for r in rows])
        mask = np.array([r["phase"] == "baseline" for r in rows])
        per_seed = [evaluate.out_of_fold_predictions(X, y, g, model, seed=s, test_mask=mask)[0][: len(base)]
                    for s in SEEDS]
        pred = np.mean(per_seed, axis=0)
        s = evaluate.summary(y_base, pred)
        s["mae_per_split"] = [float(np.mean(np.abs(p - y_base))) for p in per_seed]
        s["vs_naive"] = evaluate.bootstrap_mae_gain(y_base, pred, naive, g_base)
        s["auroc_decompensated"] = evaluate.auroc(pred, decomp)
        s["n_inputs"] = len(cols)
        s["seconds"] = round(time.time() - t0)
        result["variants"][name] = s
        oof[name] = pred.tolist()
        g_ = s["vs_naive"]
        print(f"  {name:<26} MAE {s['mae']:.2f} (splits {', '.join(f'{m:.2f}' for m in s['mae_per_split'])}) "
              f"r {s['pearson_r']:.2f} | gain {g_['mae_gain_mmHg_or_mL']:+.2f} [{g_['ci95_low']:+.2f}, {g_['ci95_high']:+.2f}]"
              f"{'  MEETS RULE' if g_['meets_success_rule'] else ''} | AUROC {s['auroc_decompensated']:.2f} | {s['seconds']}s",
              flush=True)
    if target == "wedge_mmHg":
        result["measured_wedge_auroc_decompensated"] = evaluate.auroc(y_base, decomp)
    return result, oof


def main():
    targets = sys.argv[1:] or ["wedge_mmHg"]
    out_path = config.ARTIFACTS_DIR / "experiments.json"
    all_results = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else {}
    for target in targets:
        print(f"{target}:", flush=True)
        res, oof = run(target)
        print(f"  naive guess MAE {res['naive']['mae']:.2f} | baseline rows {res['n_baseline']} from "
              f"{res['n_patients']} patients | after-medicine rows {res['n_after_medicine_rows']}")
        all_results[target] = res
        with open(config.ARTIFACTS_DIR / f"experiments_oof_{target}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(list(oof))
            w.writerows(zip(*oof.values()))
    out_path.write_text(json.dumps(all_results, indent=2), encoding="utf-8")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
