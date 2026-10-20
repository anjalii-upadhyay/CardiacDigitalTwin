"""
Step 3.8: freeze the final prediction model and write the per-patient file for the dashboard.

Model (decided, journey D18/R3): SVR on signals v1 + record, wedge pressure, 63 clean recordings from 59 patients.

1. Re-create the blind estimates: every recording predicted by a model that never saw its patient
   (10 patient groups, settings tuned inside, 3 splits averaged; same as run_experiments V0).
2. Chance of congestion and error ranges per patient, learned WITHOUT that patient (leave one patient out).
3. Train the final model on all 63 recordings and save it with its calibration.
4. Write artifacts/final/patient_estimates.json (for the dashboard) and model_card.json.

Run from the repo root:
    python_backend/venv/Scripts/python.exe -m hf_twin.ml_training.scripts.freeze_model
"""

import datetime
import json

import joblib
import numpy as np
from sklearn.model_selection import GridSearchCV, GroupKFold

from hf_twin.ml_training import calibration, config, data_io, dataset, evaluate, features, models
from hf_twin.recommendation import congestion_state as cs

SEEDS = (42, 7, 2026)
COLS = features.SIGNAL_FEATURES + features.RECORD_FEATURES
FINAL_DIR = config.ARTIFACTS_DIR / "final"
MODEL_VERSION = "wedge_svr_v1_2026-10-20"

UI_TEXT = {
    "percentage_info": "When it says 70%, about 7 in 10 such patients really were congested.",
    "estimate_info": ("Estimated by a model that never saw this patient. Typical error about 5 mmHg; the range shown "
                      "contains 80% of past errors."),
    "congestion_definition": "Congested = catheter wedge pressure above 18 mmHg (Cardiological Society of India, 2018).",
    "perfusion_info": "Taken from catheter measurements in the patient record, never from the model.",
}


def main():
    FINAL_DIR.mkdir(parents=True, exist_ok=True)
    table = [r for r in dataset.load_table() if r["clean_set"] and r["signal_ok"] and r["phase"] == "baseline"
             and np.isfinite(r["wedge_mmHg"])]
    by_id = {r.rec_id: r for r in data_io.load_recordings()}
    y = np.array([r["wedge_mmHg"] for r in table])
    g = np.array([r["patient_id"] for r in table])
    X = np.array([[r[c] for c in COLS] for r in table], dtype=float)
    print(f"{len(table)} recordings, {len(set(g))} patients")

    # 1. blind estimates
    est = np.mean([evaluate.out_of_fold_predictions(X, y, g, "svr", seed=s)[0] for s in SEEDS], axis=0)
    base = evaluate.summary(y, est)
    print(f"blind estimates: typical error {base['mae']:.2f} mmHg, r {base['pearson_r']:.2f}")

    # 2. per-patient chance and ranges (leave one patient out)
    lopo = calibration.leave_one_patient_out(est, y, g)
    p = np.array([c["p_congested"] for c in lopo])
    auroc = evaluate.auroc(p, (y > calibration.CUTOFF_MMHG).astype(float))
    rel = calibration.reliability_table(p, y)
    brier_model = calibration.brier(p, y)
    base_rate = float(np.mean(y > calibration.CUTOFF_MMHG))
    brier_base = base_rate * (1 - base_rate)
    print(f"chance of congestion: AUROC {auroc:.2f} | Brier {brier_model:.3f} (always-base-rate {brier_base:.3f})")
    for r in rel:
        print(f"   predicted {r['band']:>8}: n={r['n']:>2}  avg predicted {r['mean_predicted']*100:4.0f}%  "
              f"really congested {r['share_really_congested']*100:4.0f}%")

    # 3. final model on all recordings
    pipe, grid = models.make("svr", float(np.std(y)))
    search = GridSearchCV(pipe, grid, cv=GroupKFold(n_splits=5), scoring="neg_mean_absolute_error", n_jobs=-1)
    search.fit(X, y, groups=g)
    slope, intercept = calibration.fit_platt(est, y)
    band80, band90 = calibration.error_band(est, y, 0.8), calibration.error_band(est, y, 0.9)
    bundle = {
        "version": MODEL_VERSION, "pipeline": search.best_estimator_, "features": list(COLS), "target": "wedge_mmHg",
        "best_params": search.best_params_, "n_train": len(table), "n_patients": len(set(g)),
        "calibration": {"slope": slope, "intercept": intercept, "cutoff_mmHg": calibration.CUTOFF_MMHG,
                        "built_from": "blind (out-of-fold) estimates of the 63 training recordings"},
        "error_band_80": band80, "error_band_90": band90,
        "created": datetime.datetime.now().isoformat(timespec="seconds"),
    }
    joblib.dump(bundle, FINAL_DIR / "wedge_svr_v1.joblib")
    print(f"final model saved: {search.best_params_}, 80% band {band80[0]:+.1f}..{band80[1]:+.1f} mmHg")

    # 4. per-patient file
    patients = []
    for r, e, c in zip(table, est, lopo):
        rec = by_id[r["rec_id"]]
        row_csv = rec.rhc_row
        ci_txt = row_csv.get("TDCIL/min/m^2")
        try:
            ci_meas = float(ci_txt)
        except (TypeError, ValueError):
            ci_meas = None
        co_ml = data_io.catheter_value(rec.label, "Avg. COmL/min")
        perf = cs.perfusion_state(co_ml / 1000.0 if co_ml else None, rec.label.get("height"), rec.label.get("weight"),
                                  ci_meas)
        lo80, hi80 = c["range80"]
        category = ("congested" if lo80 > cs.WEDGE_CONGESTION_MMHG
                    else "not_congested" if hi80 <= cs.WEDGE_CONGESTION_MMHG else "uncertain")
        patients.append({
            "id": r["rec_id"], "patient": r["patient_id"],
            "age": rec.label.get("age"), "sex": rec.label.get("gender"),
            "height_cm": rec.label.get("height"), "weight_kg": rec.label.get("weight"),
            "estimate": {
                "wedge_mmHg": round(float(e), 1),
                "range80_mmHg": [round(lo80, 1), round(hi80, 1)],
                "range90_mmHg": [round(c["range90"][0], 1), round(c["range90"][1], 1)],
                "chance_congested": round(c["p_congested"], 3),
                "category_strict": category,                       # range fully above/below 18, else "uncertain" (P18 open)
                "lean": "congested" if c["p_congested"] >= 0.5 else "not_congested",
                "blind": True,
            },
            "measured": {"wedge_mmHg": r["wedge_mmHg"], "right_atrial_mmHg": r["right_atrial_mmHg"],
                         "pa_mean_mmHg": r["pa_mean_mmHg"], "stroke_volume_mL": r["stroke_volume_mL"],
                         "cardiac_output_l_min": round(co_ml / 1000.0, 2) if co_ml else None},
            "congested_by_catheter": bool(r["wedge_mmHg"] > cs.WEDGE_CONGESTION_MMHG),
            "perfusion": perf,
        })
    patients.sort(key=lambda d: -d["estimate"]["wedge_mmHg"])

    card = {
        "version": MODEL_VERSION, "created": bundle["created"],
        "model": "Support vector regression (RBF) on 15 patch-signal features + 5 record facts",
        "trained_on": f"{len(table)} recordings from {len(set(g))} patients (SCG-RHC, clean set)",
        "inputs": list(COLS), "settings": search.best_params_,
        "blind_test": {"typical_error_mmHg": base["mae"], "pearson_r": base["pearson_r"], "r2": base["r2"],
                       "naive_guess_error_mmHg": float(np.mean(np.abs(y - np.mean(y)))),
                       "error_range_80_mmHg": list(band80), "error_range_90_mmHg": list(band90),
                       "how": "10 patient groups, settings tuned inside, 3 splits averaged"},
        "chance_of_congestion": {"how": "one-variable logistic curve (Platt) of (wedge > 18) on the blind estimate, "
                                        "built without the patient it is shown for", "auroc": auroc,
                                 "brier": brier_model, "brier_if_always_base_rate": brier_base,
                                 "base_rate_congested": base_rate, "reliability": rel},
        "cutoffs": {"congestion_wedge_mmHg": cs.WEDGE_CONGESTION_MMHG, "low_perfusion_ci": cs.CARDIAC_INDEX_LOW,
                    "source": cs.CUTOFF_SOURCE},
        "limits": ["59 patients, one measurement each, lying down in a catheter lab",
                   "not precise for a single patient (80% range about -8 to +9 mmHg)",
                   "stroke volume, cardiac output and right/lung-artery pressure are NOT predicted (no better than guessing)"],
    }
    out = {"meta": {"model": card["version"], "n": len(patients), "ui_text": UI_TEXT, "cutoffs": card["cutoffs"],
                    "note": "Every estimate, range and chance comes from models that never saw that patient."},
           "patients": patients}
    (FINAL_DIR / "patient_estimates.json").write_text(json.dumps(out, indent=1), encoding="utf-8")
    (FINAL_DIR / "model_card.json").write_text(json.dumps(card, indent=1), encoding="utf-8")

    cats = {k: sum(1 for p_ in patients if p_["estimate"]["category_strict"] == k) for k in ("congested", "not_congested", "uncertain")}
    perf_c = {k: sum(1 for p_ in patients if p_["perfusion"]["state"] == k) for k in ("low", "normal", "unknown")}
    print(f"strict categories: {cats} | perfusion: {perf_c}")
    print(f"lean: {sum(1 for p_ in patients if p_['estimate']['lean']=='congested')} congested / "
          f"{sum(1 for p_ in patients if p_['estimate']['lean']=='not_congested')} not | "
          f"lean agrees with catheter: {sum(1 for p_ in patients if (p_['estimate']['lean']=='congested') == p_['congested_by_catheter'])}/{len(patients)}")
    print(f"wrote {FINAL_DIR}")


if __name__ == "__main__":
    main()
