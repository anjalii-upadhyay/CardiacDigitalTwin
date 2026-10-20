"""
Step 3.7: the personal-anchor ("known starting reading") test. Pre-registered 2026-10-20 ~11:00.

Patients with a clean slice before AND after the vasodilator (16). For each patient, every model is trained without
that patient (leave one patient out). Target: the after-medicine wedge pressure. Four ways to predict it:

  M0 population   model estimate on the after slice (no anchor; today's approach)
  M1 anchor+avg   real before value + the average change of the OTHER patients (sticker not used)
  M2 anchor+patch real before value + (model estimate after - model estimate before), model trained on baseline rows
  M3 anchor+patch as M2, but the model is also trained on the other patients' after-medicine rows

Model: SVR on signals v1 + record (the current best), settings tuned inside the training patients.
Reports typical error, error range, and congestion calls (> 18 mmHg, CSI 2018) against the real after value.

Outputs: artifacts/anchor_test.json, artifacts/anchor_test.csv
Run from the repo root:
    python_backend/venv/Scripts/python.exe -m hf_twin.ml_training.scripts.test_anchor
"""

import csv
import json

import numpy as np
from sklearn.model_selection import GridSearchCV, GroupKFold

from hf_twin.ml_training import config, dataset, evaluate, features, models

COLS = features.SIGNAL_FEATURES + features.RECORD_FEATURES
TARGET = "wedge_mmHg"
CUTOFF = 18.0


def fit_svr(rows):
    X = np.array([[r[c] for c in COLS] for r in rows], dtype=float)
    y = np.array([r[TARGET] for r in rows])
    g = np.array([r["patient_id"] for r in rows])
    pipe, grid = models.make("svr", float(np.std(y)))
    search = GridSearchCV(pipe, grid, cv=GroupKFold(n_splits=min(5, len(set(g)))),
                          scoring="neg_mean_absolute_error", n_jobs=-1)
    search.fit(X, y, groups=g)
    return search.best_estimator_


def predict(model, row):
    return float(model.predict(np.array([[row[c] for c in COLS]], dtype=float))[0])


def main():
    table = [r for r in dataset.load_table() if r["clean_set"] and r["signal_ok"] and np.isfinite(r[TARGET])]
    base = [r for r in table if r["phase"] == "baseline"]
    after = {r["rec_id"]: r for r in table if r["phase"] == "after_medicine"}
    pairs = [(b, after[b["rec_id"]]) for b in base if b["rec_id"] in after]
    print(f"patients with before + after: {len(pairs)}")

    out_rows = []
    for b, a in pairs:
        pid = b["patient_id"]
        train_base = [r for r in base if r["patient_id"] != pid]
        train_after = [r for r in after.values() if r["patient_id"] != pid]
        others = [(bb, aa) for bb, aa in pairs if bb["patient_id"] != pid]
        avg_change = float(np.mean([aa[TARGET] - bb[TARGET] for bb, aa in others]))

        m_base = fit_svr(train_base)
        m_both = fit_svr(train_base + train_after)
        pb, pa = predict(m_base, b), predict(m_base, a)
        qb, qa = predict(m_both, b), predict(m_both, a)
        out_rows.append({
            "rec_id": b["rec_id"], "before_real": b[TARGET], "after_real": a[TARGET],
            "M0_population": pa,
            "M1_anchor_avg_change": b[TARGET] + avg_change,
            "M2_anchor_patch_change": b[TARGET] + (pa - pb),
            "M3_anchor_patch_change_trained_on_changes": b[TARGET] + (qa - qb),
            "model_change_M2": pa - pb, "model_change_M3": qa - qb,
        })
        print(f"  {b['rec_id']}: before {b[TARGET]:.0f} after {a[TARGET]:.0f} | M0 {pa:.1f} | "
              f"M1 {b[TARGET] + avg_change:.1f} | M2 {b[TARGET] + pa - pb:.1f} | M3 {b[TARGET] + qa - qb:.1f}", flush=True)

    y = np.array([r["after_real"] for r in out_rows])
    real_change = np.array([r["after_real"] - r["before_real"] for r in out_rows])
    groups = np.array([r["rec_id"].split("-")[0] for r in out_rows])
    res = {"n": len(out_rows), "methods": {}}
    naive = np.array([r["M1_anchor_avg_change"] for r in out_rows])
    print(f"\n{'method':<44}{'typ. error':>11}{'80% range':>20}{'calls right':>13}")
    for m in ("M0_population", "M1_anchor_avg_change", "M2_anchor_patch_change", "M3_anchor_patch_change_trained_on_changes"):
        p = np.array([r[m] for r in out_rows])
        err = y - p
        s = evaluate.summary(y, p)
        lo, hi = np.quantile(err, [0.1, 0.9])
        calls = int(np.sum((p > CUTOFF) == (y > CUTOFF)))
        s.update({"error_range_80": [float(lo), float(hi)], "congestion_calls_correct": calls})
        if m != "M1_anchor_avg_change":
            s["vs_anchor_avg_change"] = evaluate.bootstrap_mae_gain(y, p, naive, groups)
        res["methods"][m] = s
        print(f"{m:<44}{s['mae']:>11.2f}{f'{lo:+.1f} to {hi:+.1f}':>20}{f'{calls}/{len(y)}':>13}")
    for k in ("M2", "M3"):
        mc = np.array([r[f"model_change_{k}"] for r in out_rows])
        res[f"change_tracking_r_{k}"] = float(np.corrcoef(mc, real_change)[0, 1])
    print(f"\ndoes the patch track the change? correlation of model change vs real change: "
          f"M2 {res['change_tracking_r_M2']:+.2f}, M3 {res['change_tracking_r_M3']:+.2f} "
          f"(real change mean {real_change.mean():+.1f}, range {real_change.min():+.0f} to {real_change.max():+.0f})")
    (config.ARTIFACTS_DIR / "anchor_test.json").write_text(json.dumps(res, indent=2), encoding="utf-8")
    with open(config.ARTIFACTS_DIR / "anchor_test.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out_rows[0]))
        w.writeheader()
        w.writerows(out_rows)


if __name__ == "__main__":
    main()
