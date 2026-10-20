"""
Step 3.5: the "change" model (what the dataset's authors studied).

For patients measured before and after a vasodilator, predict how much the wedge pressure changes from how the
sticker signals change. Each patient is compared with themselves, so differences between people cancel out.

Pairs: baseline slice and after-medicine slice of the same recording (clean set, signal OK).
Inputs: change in each signal feature (after minus before). Target: change in wedge pressure (mmHg).
Testing: leave one patient out. Baselines: naive (average change of the other patients).

Outputs: artifacts/change_model.json, artifacts/change_model_oof.csv
Run from the repo root:
    python_backend/venv/Scripts/python.exe -m hf_twin.ml_training.scripts.change_model
"""

import csv
import json

import numpy as np
from sklearn.model_selection import LeaveOneGroupOut

from hf_twin.ml_training import config, dataset, evaluate, features, models

INPUT_SETS = {
    "signals_v1": features.SIGNAL_FEATURES,
    "signals_v1+v2": features.SIGNAL_FEATURES + features.VIBRATION_V2_FEATURES,
}
TARGET = "wedge_mmHg"


def loo_predict(X, y, groups, model_name):
    pred = np.full(len(y), np.nan)
    for train, test in LeaveOneGroupOut().split(X, y, groups):
        pipe, grid = models.make(model_name, float(np.std(y[train])))
        if grid:   # tiny data: use the middle of the grid instead of tuning on a handful of rows
            pipe.set_params(**{k: v[len(v) // 2] for k, v in grid.items()})
        pipe.fit(X[train], y[train])
        pred[test] = pipe.predict(X[test])
    return pred


def main():
    table = [r for r in dataset.load_table() if r["clean_set"] and r["signal_ok"]]
    base = {r["rec_id"]: r for r in table if r["phase"] == "baseline"}
    pairs = [(base[r["rec_id"]], r) for r in table if r["phase"] == "after_medicine" and r["rec_id"] in base
             and np.isfinite(r[TARGET]) and np.isfinite(base[r["rec_id"]][TARGET])]
    if len(pairs) < 5:
        print(f"only {len(pairs)} usable pairs; need the after-medicine slices first")
        return
    groups = np.array([b["patient_id"] for b, _ in pairs])
    dy = np.array([a[TARGET] - b[TARGET] for b, a in pairs])
    print(f"pairs: {len(pairs)} | wedge change after medicine: mean {dy.mean():+.1f} mmHg, "
          f"range {dy.min():+.0f} to {dy.max():+.0f}")
    naive = loo_predict(np.zeros((len(dy), 1)), dy, groups, "naive_mean")
    out = {"n_pairs": len(pairs), "measured_change_mean": float(dy.mean()), "naive": evaluate.summary(dy, naive),
           "input_sets": {}}
    oof = {"rec_id": [b["rec_id"] for b, _ in pairs], "measured_change": dy.tolist(), "naive": naive.tolist()}
    print(f"  naive (average change)  MAE {out['naive']['mae']:.2f}")
    for set_name, cols in INPUT_SETS.items():
        dX = np.array([[a[c] - b[c] for c in cols] for b, a in pairs], dtype=float)
        out["input_sets"][set_name] = {}
        for m in ("ridge", "svr", "gaussian_process"):
            p = loo_predict(dX, dy, groups, m)
            s = evaluate.summary(dy, p)
            s["vs_naive"] = evaluate.bootstrap_mae_gain(dy, p, naive, groups)
            s["direction_agreement"] = float(np.mean(np.sign(p - np.mean(dy)) == np.sign(dy - np.mean(dy))))
            out["input_sets"][set_name][m] = s
            oof[f"{set_name}__{m}"] = p.tolist()
            g = s["vs_naive"]
            print(f"  {set_name:<14} {m:<17} MAE {s['mae']:.2f} r {s['pearson_r']:+.2f} | gain "
                  f"{g['mae_gain_mmHg_or_mL']:+.2f} [{g['ci95_low']:+.2f}, {g['ci95_high']:+.2f}]"
                  f"{'  MEETS RULE' if g['meets_success_rule'] else ''}")
    (config.ARTIFACTS_DIR / "change_model.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    with open(config.ARTIFACTS_DIR / "change_model_oof.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(list(oof))
        w.writerows(zip(*oof.values()))
    print("wrote change_model.json")


if __name__ == "__main__":
    main()
