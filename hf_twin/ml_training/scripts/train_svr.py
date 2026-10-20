"""
Step 3.2: train and test the congestion model (SVR) against the naive guess and ridge regression.

For each target (wedge, right-atrial, lung-artery pressure, stroke volume) and each input set
(record only / signals only / signals + record), it produces out-of-fold predictions (leave one patient out,
settings tuned inside), error numbers, the success-rule check, and how well the predicted wedge separates
decompensated from compensated recordings. Then it fits the final SVRs on all clean recordings.

Outputs (artifacts/): metrics.json, oof_predictions.csv, trained/svr_<target>.joblib
Run from the repo root:
    python_backend/venv/Scripts/python.exe -m hf_twin.ml_training.scripts.train_svr
"""

import csv
import json

import joblib
import numpy as np
from sklearn.model_selection import GridSearchCV, GroupKFold

from hf_twin.ml_training import config, dataset, evaluate, features, models

INPUT_SETS = {
    "record_only": features.RECORD_FEATURES,
    "signals_only": features.SIGNAL_FEATURES,
    "signals_plus_record": features.SIGNAL_FEATURES + features.RECORD_FEATURES,
}


def main():
    rows = [r for r in dataset.load_table() if r["clean_set"] and r["signal_ok"] and r["phase"] == "baseline"]
    groups = np.array([r["patient_id"] for r in rows])
    decomp = np.array([float(r.get("pdecomp", np.nan)) for r in rows])
    print(f"training rows: {len(rows)} recordings from {len(set(groups))} patients")

    metrics, oof_rows = {}, {r["rec_id"]: {"rec_id": r["rec_id"], "patient_id": r["patient_id"]} for r in rows}
    for target in config.TARGETS:
        y = np.array([r[target] for r in rows], dtype=float)
        metrics[target] = {}
        # naive guess: the training patients' average, ignoring all inputs
        naive_pred, _ = evaluate.out_of_fold_predictions(np.zeros((len(y), 1)), y, groups, "naive_mean")
        metrics[target]["naive_mean"] = evaluate.summary(y, naive_pred)
        for r, p in zip(rows, naive_pred):
            oof_rows[r["rec_id"]][f"{target}__naive_mean"] = round(float(p), 2)
            oof_rows[r["rec_id"]][f"{target}__measured"] = r[target]
        for set_name, cols in INPUT_SETS.items():
            X = np.array([[r[c] for c in cols] for r in rows], dtype=float)
            metrics[target][set_name] = {}
            for m in ("ridge", "svr"):
                pred, _ = evaluate.out_of_fold_predictions(X, y, groups, m)
                s = evaluate.summary(y, pred)
                s["vs_naive"] = evaluate.bootstrap_mae_gain(y, pred, naive_pred, groups)
                if target == "wedge_mmHg" and m == "svr":
                    s["auroc_decompensated"] = evaluate.auroc(pred, decomp)
                metrics[target][set_name][m] = s
                for r, p in zip(rows, pred):
                    oof_rows[r["rec_id"]][f"{target}__{set_name}__{m}"] = round(float(p), 2)
        if target == "wedge_mmHg":
            metrics[target]["measured_wedge_auroc_decompensated"] = evaluate.auroc(y, decomp)

    # final models: tune once more on all clean recordings and save
    trained_dir = config.ARTIFACTS_DIR / "trained"
    trained_dir.mkdir(parents=True, exist_ok=True)
    cols = INPUT_SETS["signals_plus_record"]
    X = np.array([[r[c] for c in cols] for r in rows], dtype=float)
    for target in config.TARGETS:
        y = np.array([r[target] for r in rows], dtype=float)
        pipe, grid = models.make("svr", float(np.std(y)))
        search = GridSearchCV(pipe, grid, cv=GroupKFold(n_splits=5), scoring="neg_mean_absolute_error", n_jobs=-1)
        search.fit(X, y, groups=groups)
        joblib.dump({"pipeline": search.best_estimator_, "features": list(cols), "target": target,
                     "best_params": search.best_params_, "n_train": len(rows)}, trained_dir / f"svr_{target}.joblib")
        metrics[target]["final_svr_params"] = search.best_params_

    (config.ARTIFACTS_DIR / "metrics.json").write_text(json.dumps(metrics, indent=2, default=str), encoding="utf-8")
    with open(config.ARTIFACTS_DIR / "oof_predictions.csv", "w", newline="", encoding="utf-8") as f:
        fields = sorted({k for v in oof_rows.values() for k in v}, key=lambda k: (k not in ("rec_id", "patient_id"), k))
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(oof_rows.values())

    # short report
    print(f"\n{'target':<20}{'inputs':<22}{'model':<8}{'MAE':>8}{'r':>7}{'R2':>7}   gain vs naive [95% CI]")
    for target in config.TARGETS:
        n = metrics[target]["naive_mean"]
        print(f"{target:<20}{'(none)':<22}{'naive':<8}{n['mae']:>8.2f}{'':>7}{n['r2']:>7.2f}")
        for set_name in INPUT_SETS:
            for m, s in metrics[target][set_name].items():
                g = s["vs_naive"]
                print(f"{target:<20}{set_name:<22}{m:<8}{s['mae']:>8.2f}{s['pearson_r']:>7.2f}{s['r2']:>7.2f}   "
                      f"{g['mae_gain_mmHg_or_mL']:+.2f} [{g['ci95_low']:+.2f}, {g['ci95_high']:+.2f}]"
                      f"{'  MEETS RULE' if g['meets_success_rule'] else ''}")
    w = metrics["wedge_mmHg"]
    print(f"\nwedge SVR (signals + record) separates decompensated vs not: AUROC "
          f"{w['signals_plus_record']['svr']['auroc_decompensated']:.2f} "
          f"(ceiling, measured wedge itself: {w['measured_wedge_auroc_decompensated']:.2f})")


if __name__ == "__main__":
    main()
