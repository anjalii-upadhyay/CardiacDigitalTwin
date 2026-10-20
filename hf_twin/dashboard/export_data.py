"""
Export everything the doctor dashboard shows into one static file: public/data/patients.json.

One row per clean-set recording (63). Estimates, error ranges, chance of congestion, categories and perfusion are
NOT recomputed here: they are read from the frozen model's output (artifacts/final/patient_estimates.json and
model_card.json, made by hf_twin.ml_training.scripts.freeze_model; journey R7), so the dashboard and the model can
never disagree and the React app contains no clinical thresholds. This script adds what the model files do not carry:
the patient record text, plain-language history tags, patch features, signal clips with real beat times, and the
real before/after vasodilator values.

Run from the repo root:
    python_backend/venv/Scripts/python.exe -m hf_twin.dashboard.export_data
"""

import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.signal import butter, filtfilt
from sklearn.metrics import roc_auc_score

from hf_twin.ml_training import calibration, config, data_io, dataset, quality

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "public" / "data" / "patients.json"
A = config.ARTIFACTS_DIR
FINAL = A / "final"
MODEL_COLUMN = "V0_current"              # experiments.json variant that the frozen model reproduces exactly
CLIP_START_S, CLIP_LEN_S, CLIP_FS = 10, 8, 100

FEATURES = ["hr_bpm", "rmssd_ms", "sdnn_ms", "irregular_share", "scg_amp_mg", "scg_t1_ms", "scg_t2_minus_t1_ms",
            "breath_rate_per_min", "breath_depth_mg", "tilt_deg", "skin_temp_c", "bmi"]
MODEL_LABELS = {"svr": "Support vector regression", "extra_trees": "Extra trees", "gaussian_process": "Gaussian process",
                "ensemble_svr_gp_rf": "Ensemble (SVR + GP + RF)", "gradient_boosting": "Gradient boosting",
                "knn": "Nearest neighbours", "elasticnet": "Elastic net", "random_forest": "Random forest",
                "ridge": "Ridge regression"}
DRUGS = {"S/P Nipride Challenge": "nitroprusside", "S/P Nitro": "nitroglycerin"}

# Plain-language tags parsed from the real free-text history (regex, label)
HISTORY_TAGS = [
    (r"\bHFrEF\b", "Weak pumping (HFrEF)"), (r"\bHFpEF\b", "Stiff heart (HFpEF)"),
    (r"(?<![N])\bICM\b", "Ischaemic cause"), (r"\bNICM\b", "Non-ischaemic cause"),
    (r"\bCAD\b", "Coronary artery disease"), (r"\bHTN\b", "High blood pressure"), (r"\bDM2?\b", "Diabetes"),
    (r"\bCKD", "Chronic kidney disease"), (r"\b(p?AF|afib)\b", "Atrial fibrillation"), (r"\baflutter\b", "Atrial flutter"),
    (r"\bVT\b", "Ventricular tachycardia"), (r"\bCRT-D\b", "Pacing defibrillator (CRT-D)"), (r"\bICD\b", "Defibrillator (ICD)"),
    (r"\bOSA\b", "Sleep apnoea"), (r"\bpHTN\b", "Lung high blood pressure"), (r"\bCardioMEMS\b", "Implanted pressure sensor"),
]


def num(v, nd=2):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if not np.isfinite(f) else round(f, nd)


def tags(history: str) -> list[str]:
    return [label for pattern, label in HISTORY_TAGS if re.search(pattern, history)]


def _bandpass(x, lo, hi, fs=config.FS):
    b, a = butter(2, [lo / (fs / 2), hi / (fs / 2)], btype="band")
    return filtfilt(b, a, x)


def _clip(x):
    """8 s at 100 Hz, scaled to -127..127 (shape only; amplitude is not shown in physical units)."""
    seg = x[CLIP_START_S * config.FS:(CLIP_START_S + CLIP_LEN_S) * config.FS][::config.FS // CLIP_FS]
    s = np.percentile(np.abs(seg), 99.5) or 1.0
    return [int(v) for v in np.clip(np.round(seg / s * 120), -127, 127)]


def signals(rec):
    channels = data_io.read_header(rec.rec_id)
    sig = data_io.load_window(rec.window_path, channels)
    ecg = sig[:, data_io.channel_index(channels, config.PATCH_ECG)]
    scg = sig[:, data_io.channel_index(channels, "patch_ACC_dv")]
    beats = quality.detect_r_peaks(ecg) / config.FS
    return {"ecg": _clip(_bandpass(ecg, 0.5, 40)), "scg": _clip(_bandpass(scg, 1, 40)),
            "clip_start_s": CLIP_START_S, "clip_fs": CLIP_FS, "slice_s": round(len(ecg) / config.FS, 2),
            "beats_s": [round(float(t), 3) for t in beats]}


def after_vasodilator():
    out = {}
    with open(config.RHC_VALUES_CSV, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r["RHC Phase"] in DRUGS and num(r["PCWM"]) is not None:
                out[r["Study ID"].replace(".", "-")] = {"wedge": num(r["PCWM"], 1), "drug": DRUGS[r["RHC Phase"]]}
    return out


def build() -> dict:
    final = json.loads((FINAL / "patient_estimates.json").read_text(encoding="utf-8"))
    card = json.loads((FINAL / "model_card.json").read_text(encoding="utf-8"))
    est = {p["id"]: p for p in final["patients"]}
    table = {r["rec_id"]: r for r in dataset.load_table() if r["phase"] == "baseline"}
    recs = {r.rec_id: r for r in data_io.load_recordings()}
    after = after_vasodilator()
    cut = final["meta"]["cutoffs"]
    curves = calibration.chance_curves(final["patients"], A / "experiments_oof_wedge_mmHg.csv", MODEL_COLUMN)

    patients = []
    for rid, e in est.items():
        t, rec, lab = table[rid], recs[rid], recs[rid].label
        s, m = e["estimate"], e["measured"]
        history = (lab.get("history of patient") or "").strip()
        patients.append({
            "id": rid, "patient": e["patient"], "visit": int(rid.split("RHC")[1]),
            "record": {"age": lab.get("age"), "sex": lab.get("gender"), "height_cm": num(lab.get("height"), 1),
                       "weight_kg": num(lab.get("weight"), 1), "bmi": num(t.get("bmi"), 1),
                       "sbp": lab.get("sbp") if (lab.get("sbp") or 0) > 0 else None,
                       "dbp": lab.get("dbp") if (lab.get("dbp") or 0) > 0 else None,
                       "nyha": lab.get("NYHAC"), "outpatient": lab.get("outpatient"),
                       "history": history, "history_tags": tags(history)},
            "estimate": {"wedge": s["wedge_mmHg"], "error_vs_catheter": round(s["wedge_mmHg"] - m["wedge_mmHg"], 1)},
            "congestion": {"state": s["category_strict"], "lean": s["lean"], "chance": s["chance_congested"],
                           "estimate_mmHg": s["wedge_mmHg"], "range_mmHg": s["range80_mmHg"], "range_coverage": 0.8,
                           "range90_mmHg": s["range90_mmHg"], "cutoff_mmHg": cut["congestion_wedge_mmHg"],
                           "curve": curves[rid]},
            "perfusion": e["perfusion"],
            "measured": {"wedge": m["wedge_mmHg"], "ra": m["right_atrial_mmHg"], "pa": m["pa_mean_mmHg"],
                         "sv": num(m["stroke_volume_mL"], 1), "co": m["cardiac_output_l_min"]},
            "decompensated": num(t["pdecomp"], 0),
            "after_vasodilator": after.get(rid),
            "features": {k: num(t[k]) for k in FEATURES},
            "signals": signals(rec),
        })

    exp = json.loads((A / "experiments.json").read_text(encoding="utf-8"))["wedge_mmHg"]
    v0 = exp["variants"][MODEL_COLUMN]
    comp = json.loads((A / "model_comparison.json").read_text(encoding="utf-8"))["wedge_mmHg"]["input_sets"]["v1"]
    with open(A / "change_model_oof.csv", newline="", encoding="utf-8") as f:
        drops = np.array([float(r["measured_change"]) for r in csv.DictReader(f)])
    pred = np.array([p["estimate"]["wedge"] for p in patients])
    meas = np.array([p["measured"]["wedge"] for p in patients])
    abs_err = np.abs(pred - meas)
    decomp = np.array([p["decompensated"] if p["decompensated"] is not None else np.nan for p in patients], float)
    ok = np.isfinite(decomp)
    states = [p["congestion"]["state"] for p in patients]
    leans = [p["congestion"]["lean"] for p in patients]
    bt, ch = card["blind_test"], card["chance_of_congestion"]

    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": {"name": "Support vector regression (patch signals + record, 20 inputs)", "version": card["version"],
                  "n_recordings": exp["n_baseline"], "n_patients": exp["n_patients"],
                  "mae": round(v0["mae"], 2), "naive_mae": round(exp["naive"]["mae"], 2),
                  "gain": round(v0["vs_naive"]["mae_gain_mmHg_or_mL"], 2),
                  "gain_ci95": [round(v0["vs_naive"]["ci95_low"], 2), round(v0["vs_naive"]["ci95_high"], 2)],
                  "meets_success_rule": v0["vs_naive"]["meets_success_rule"],
                  "auroc": round(v0["auroc_decompensated"], 2),
                  "auroc_catheter": round(float(roc_auc_score(decomp[ok], meas[ok])), 2)},
        "errors": {"median": round(float(np.median(abs_err)), 1), "p25": round(float(np.percentile(abs_err, 25)), 1),
                   "p75": round(float(np.percentile(abs_err, 75)), 1), "max": round(float(abs_err.max()), 1),
                   "within": {str(k): int((abs_err <= k).sum()) for k in (1, 2, 5, 10)},
                   "estimate_range": [round(float(pred.min()), 1), round(float(pred.max()), 1)],
                   "catheter_range": [round(float(meas.min()), 1), round(float(meas.max()), 1)]},
        "congestion_band": {"coverage": 0.8, "lower": round(bt["error_range_80_mmHg"][0], 1),
                            "upper": round(bt["error_range_80_mmHg"][1], 1),
                            "decision": "journey P18 open: strict categories use the 80% range",
                            "counts": {s: states.count(s) for s in ("congested", "uncertain", "not_congested")},
                            "lean_counts": {s: leans.count(s) for s in ("congested", "not_congested")}},
        "chance": {"auroc": round(ch["auroc"], 2), "brier": round(ch["brier"], 3),
                   "brier_base": round(ch["brier_if_always_base_rate"], 3), "base_rate": round(ch["base_rate_congested"], 2),
                   "how": ch["how"], "lean_threshold": calibration.LEAN_THRESHOLD, "reliability": [
                       {"band": r["band"], "n": r["n"], "predicted": round(r["mean_predicted"], 2),
                        "observed": round(r["share_really_congested"], 2)} for r in ch["reliability"]]},
        "ui_text": final["meta"]["ui_text"],
        "cutoffs": {"wedge_congestion": cut["congestion_wedge_mmHg"], "cardiac_index_low": cut["low_perfusion_ci"],
                    "source": cut["source"]},
        "perfusion_counts": {k: sum(1 for p in patients if p["perfusion"]["state"] == k) for k in ("low", "normal", "unknown")},
        "vasodilator": {"n_pairs": int(len(drops)), "mean": round(float(drops.mean()), 1),
                        "smallest": round(float(drops.max()), 1), "largest": round(float(drops.min()), 1)},
        "model_comparison": sorted([{"name": MODEL_LABELS.get(k, k), "mae": round(v["mae"], 2)} for k, v in comp.items()
                                    if isinstance(v, dict) and "mae" in v], key=lambda x: x["mae"]),
        "data_source": {"name": "PhysioNet SCG-RHC wearable database v1.0.0", "licence": "Open Data Commons Attribution",
                        "url": "https://www.physionet.org/content/scg-rhc-wearable-database/1.0.0/"},
    }
    return {"meta": meta, "patients": patients}


def main():
    data = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    m = data["meta"]
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB): {len(data['patients'])} recordings, model {m['model']['version']}, "
          f"MAE {m['model']['mae']}, states {m['congestion_band']['counts']}, perfusion {m['perfusion_counts']}")


if __name__ == "__main__":
    main()
