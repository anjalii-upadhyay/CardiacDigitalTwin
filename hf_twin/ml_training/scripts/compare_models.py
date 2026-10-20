"""
Step 3.4: pre-registered model comparison (all reported, none dropped).

Models: ridge, elastic net, SVR, random forest, extra trees, gradient boosting, Gaussian process,
nearest neighbours, and a fixed ensemble (average of SVR, Gaussian process, random forest).
Input sets: "v1" (rhythm, vibration v1, breathing, posture, temperature + record) and
"v1+v2" (adds the richer vibration features).
Same honest testing as run_experiments: patients held out (10 groups), settings tuned inside,
3 different patient splits averaged, success rule = beat the naive guess with the 95% interval above zero.

Outputs: artifacts/model_comparison.json, artifacts/model_comparison_oof_<target>.csv
Run from the repo root:
    python_backend/venv/Scripts/python.exe -m hf_twin.ml_training.scripts.compare_models [target ...]
"""

import csv
import json
import sys
import time

import numpy as np

from hf_twin.ml_training import config, dataset, evaluate, features, models

SEEDS = (42, 7, 2026)
INPUT_SETS = {
    "v1": features.SIGNAL_FEATURES + features.RECORD_FEATURES,
    "v1+v2": features.SIGNAL_FEATURES + features.VIBRATION_V2_FEATURES + features.RECORD_FEATURES,
}


def score(name, y, pred, naive, groups, decomp, per_seed=None, seconds=None):
    s = evaluate.summary(y, pred)
    if per_seed is not None:
        s["mae_per_split"] = [float(np.mean(np.abs(p - y))) for p in per_seed]
    s["vs_naive"] = evaluate.bootstrap_mae_gain(y, pred, naive, groups)
    s["auroc_decompensated"] = evaluate.auroc(pred, decomp)
    if seconds is not None:
        s["seconds"] = seconds
    g = s["vs_naive"]
    print(f"    {name:<20} MAE {s['mae']:.2f} r {s['pearson_r']:+.2f} R2 {s['r2']:+.2f} | gain "
          f"{g['mae_gain_mmHg_or_mL']:+.2f} [{g['ci95_low']:+.2f}, {g['ci95_high']:+.2f}]"
          f"{'  MEETS RULE' if g['meets_success_rule'] else ''} | AUROC {s['auroc_decompensated']:.2f}", flush=True)
    return s


def run(target):
    rows = [r for r in dataset.load_table() if r["clean_set"] and r["signal_ok"] and r["phase"] == "baseline"
            and np.isfinite(r[target])]
    y = np.array([r[target] for r in rows])
    g = np.array([r["patient_id"] for r in rows])
    decomp = np.array([r["pdecomp"] for r in rows])
    naive = np.mean([evaluate.out_of_fold_predictions(np.zeros((len(y), 1)), y, g, "naive_mean", seed=s)[0]
                     for s in SEEDS], axis=0)
    out = {"n": len(rows), "n_patients": len(set(g)), "naive": evaluate.summary(y, naive), "input_sets": {}}
    oof = {"rec_id": [r["rec_id"] for r in rows], "measured": y.tolist(), "naive": naive.tolist()}
    print(f"{target}: {len(rows)} recordings, {len(set(g))} patients, naive MAE {out['naive']['mae']:.2f}", flush=True)
    for set_name, cols in INPUT_SETS.items():
        print(f"  inputs {set_name} ({len(cols)}):", flush=True)
        X = np.array([[r[c] for c in cols] for r in rows], dtype=float)
        res, preds = {}, {}
        for m in models.COMPARISON_MODELS:
            t0 = time.time()
            per_seed = [evaluate.out_of_fold_predictions(X, y, g, m, seed=s)[0] for s in SEEDS]
            preds[m] = np.mean(per_seed, axis=0)
            res[m] = score(m, y, preds[m], naive, g, decomp, per_seed, round(time.time() - t0))
            oof[f"{set_name}__{m}"] = preds[m].tolist()
        ens = np.mean([preds[m] for m in models.ENSEMBLE], axis=0)
        res["ensemble_svr_gp_rf"] = score("ensemble_svr_gp_rf", y, ens, naive, g, decomp)
        oof[f"{set_name}__ensemble_svr_gp_rf"] = ens.tolist()
        out["input_sets"][set_name] = res
    return out, oof


def main():
    targets = sys.argv[1:] or ["wedge_mmHg"]
    path = config.ARTIFACTS_DIR / "model_comparison.json"
    all_res = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    for t in targets:
        res, oof = run(t)
        all_res[t] = res
        with open(config.ARTIFACTS_DIR / f"model_comparison_oof_{t}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(list(oof))
            w.writerows(zip(*oof.values()))
    path.write_text(json.dumps(all_res, indent=2), encoding="utf-8")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
