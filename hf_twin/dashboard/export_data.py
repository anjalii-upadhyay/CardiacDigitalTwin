"""
Export everything the doctor dashboard shows into one static file: public/data/patients.json.

One row per clean-set recording (63). Every wedge estimate is the out-of-fold prediction of the chosen model
(a model that never saw that patient). Congestion and perfusion states come from hf_twin/recommendation/
congestion_state.py, so the cut-offs live in one place and the React app contains no clinical thresholds.

Run from the repo root:
    python_backend/venv/Scripts/python.exe -m hf_twin.dashboard.export_data [--coverage 0.8]
"""

import argparse
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.signal import butter, filtfilt
from sklearn.metrics import roc_auc_score

from hf_twin.ml_training import config, data_io, dataset, quality
from hf_twin.recommendation import congestion_state as cs

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "public" / "data" / "patients.json"
A = config.ARTIFACTS_DIR
OOF_CSV = A / "experiments_oof_wedge_mmHg.csv"
MODEL_COLUMN = "V0_current"              # best model so far (R2-R5): SVR, signals v1 + record, 20 inputs
CLIP_START_S, CLIP_LEN_S, CLIP_FS = 10, 8, 100

FEATURES = ["hr_bpm", "rmssd_ms", "sdnn_ms", "irregular_share", "scg_amp_mg", "scg_t1_ms", "scg_t2_minus_t1_ms",
            "breath_rate_per_min", "breath_depth_mg", "tilt_deg", "skin_temp_c", "bmi"]
MODEL_LABELS = {"svr": "Support vector regression", "extra_trees": "Extra trees", "gaussian_process": "Gaussian process",
                "ensemble_svr_gp_rf": "Ensemble (SVR + GP + RF)", "gradient_boosting": "Gradient boosting",
                "knn": "Nearest neighbours", "elasticnet": "Elastic net", "random_forest": "Random forest",
                "ridge": "Ridge regression"}
DRUGS = {"S/P Nipride Challenge": "nitroprusside", "S/P Nitro": "nitroglycerin"}

# Plain-language tags parsed from the real free-text history (keyword, regex, label)
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


def build(coverage: float) -> dict:
    with open(OOF_CSV, newline="", encoding="utf-8") as f:
        oof = list(csv.DictReader(f))
    table = {r["rec_id"]: r for r in dataset.load_table() if r["phase"] == "baseline"}
    recs = {r.rec_id: r for r in data_io.load_recordings()}
    after = after_vasodilator()

    ids = [r["rec_id"] for r in oof]
    meas = np.array([float(r["measured"]) for r in oof])
    pred = np.array([float(r[MODEL_COLUMN]) for r in oof])
    pats = np.array([i.split("-")[0] for i in ids])

    patients = []
    for i, rid in enumerate(ids):
        t, rec, lab = table[rid], recs[rid], recs[rid].label
        maclab = {k.strip(): v for k, v in lab.get("maclabMeas", {}).items()}
        # error range built without this patient's own error (same method as check_congestion_band.py)
        keep = pats != pats[i]
        band = cs.band_from_errors(meas[keep], pred[keep], coverage, f"{OOF_CSV.name}:{MODEL_COLUMN}")
        co = num(maclab.get("TDCOL/min")) or num(maclab.get("Fick COL/min"))
        history = (lab.get("history of patient") or "").strip()
        patients.append({
            "id": rid, "patient": rec.patient_id, "visit": int(rid.split("RHC")[1]),
            "record": {"age": lab.get("age"), "sex": lab.get("gender"), "height_cm": num(lab.get("height"), 1),
                       "weight_kg": num(lab.get("weight"), 1), "bmi": num(t.get("bmi"), 1),
                       "sbp": lab.get("sbp") if (lab.get("sbp") or 0) > 0 else None,
                       "dbp": lab.get("dbp") if (lab.get("dbp") or 0) > 0 else None,
                       "nyha": lab.get("NYHAC"), "outpatient": lab.get("outpatient"),
                       "history": history, "history_tags": tags(history)},
            "estimate": {"wedge": round(float(pred[i]), 1), "error_vs_catheter": round(float(pred[i] - meas[i]), 1)},
            "congestion": cs.congestion_state(float(pred[i]), band),
            "perfusion": cs.perfusion_state(co, lab.get("height"), lab.get("weight")),
            "measured": {"wedge": num(meas[i], 1), "ra": num(t["right_atrial_mmHg"], 1), "pa": num(t["pa_mean_mmHg"], 1),
                         "sv": num(t["stroke_volume_mL"], 1), "co": co},
            "decompensated": num(t["pdecomp"], 0),
            "after_vasodilator": after.get(rid),
            "features": {k: num(t[k]) for k in FEATURES},
            "signals": signals(rec),
        })

    exp = json.load(open(A / "experiments.json"))["wedge_mmHg"]
    v0 = exp["variants"][MODEL_COLUMN]
    comp = json.load(open(A / "model_comparison.json"))["wedge_mmHg"]["input_sets"]["v1"]
    with open(A / "change_model_oof.csv", newline="", encoding="utf-8") as f:
        drops = np.array([float(r["measured_change"]) for r in csv.DictReader(f)])
    abs_err = np.abs(pred - meas)
    decomp = np.array([p["decompensated"] if p["decompensated"] is not None else np.nan for p in patients], float)
    ok = np.isfinite(decomp)
    full_band = cs.band_from_errors(meas, pred, coverage, f"{OOF_CSV.name}:{MODEL_COLUMN}")
    states = [p["congestion"]["state"] for p in patients]

    meta = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": {"name": "Support vector regression (V0: patch signals + record, 20 inputs)", "column": MODEL_COLUMN,
                  "n_recordings": exp["n_baseline"], "n_patients": exp["n_patients"],
                  "mae": round(v0["mae"], 2), "mae_per_split": [round(x, 2) for x in v0["mae_per_split"]],
                  "naive_mae": round(exp["naive"]["mae"], 2),
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
        "congestion_band": {"coverage": coverage, "lower": round(full_band.lower, 1), "upper": round(full_band.upper, 1),
                            "method": "per patient, built from the other patients' out-of-fold errors",
                            "decision": "P18 open: coverage not final",
                            "counts": {s: states.count(s) for s in ("congested", "uncertain", "not_congested")}},
        "cutoffs": {"wedge_congestion": cs.WEDGE_CONGESTION_MMHG, "cardiac_index_low": cs.CARDIAC_INDEX_LOW,
                    "source": cs.CUTOFF_SOURCE},
        "vasodilator": {"n_pairs": int(len(drops)), "mean": round(float(drops.mean()), 1),
                        "smallest": round(float(drops.max()), 1), "largest": round(float(drops.min()), 1)},
        "model_comparison": sorted([{"name": MODEL_LABELS.get(k, k), "mae": round(v["mae"], 2)} for k, v in comp.items()
                                    if isinstance(v, dict) and "mae" in v], key=lambda m: m["mae"]),
        "data_source": {"name": "PhysioNet SCG-RHC wearable database v1.0.0", "licence": "Open Data Commons Attribution",
                        "url": "https://www.physionet.org/content/scg-rhc-wearable-database/1.0.0/"},
    }
    return {"meta": meta, "patients": patients}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--coverage", type=float, default=0.8, help="error-range coverage (decision P18 still open)")
    args = ap.parse_args()
    data = build(args.coverage)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    m = data["meta"]
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB): {len(data['patients'])} recordings, "
          f"MAE {m['model']['mae']}, congestion states {m['congestion_band']['counts']}")


if __name__ == "__main__":
    main()
