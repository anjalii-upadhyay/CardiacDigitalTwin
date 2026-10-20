"""Build the training table: one row per recording with features, targets, patient id and clean-set flag."""

import csv

import numpy as np

from hf_twin.ml_training import config, data_io, features, quality

TABLE_CSV = config.ARTIFACTS_DIR / "features.csv"
ID_COLUMNS = ("rec_id", "patient_id", "window", "phase", "clean_set", "signal_ok", "notes")


def build_table() -> list[dict]:
    """Baseline rows (one per recording) followed by after-medicine rows (phase = 'after_medicine')."""
    rows = []
    baseline = data_io.load_recordings()
    clean_by_rec = {r.rec_id: not data_io.exclusion_reasons(r) for r in baseline}
    for rec in baseline + data_io.load_after_medicine():
        channels = data_io.read_header(rec.rec_id)
        sig = data_io.load_window(rec.window_path, channels)
        q = quality.check_window(sig, data_io.channel_index(channels, config.PATCH_ECG),
                                 [data_io.channel_index(channels, n) for n in config.PATCH_ACC])
        excl = data_io.exclusion_reasons(rec)
        phase = "after_medicine" if rec.window_kind == "VI" else "baseline"
        clean = clean_by_rec.get(rec.rec_id, False) if phase == "after_medicine" else not excl
        row = {"rec_id": rec.rec_id, "patient_id": rec.patient_id, "window": rec.window_kind, "phase": phase,
               "clean_set": clean, "signal_ok": q["ok"], "notes": "; ".join(excl + q["reasons"])}
        row.update(features.extract(rec))
        row.update(rec.targets)
        pd = rec.label.get("PDecomp")
        row["pdecomp"] = float(pd) if isinstance(pd, (int, float)) else np.nan   # evaluation only, never an input
        rows.append(row)
    return rows


def save_table(rows: list[dict]) -> None:
    config.ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    with open(TABLE_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)


def load_table() -> list[dict]:
    with open(TABLE_CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        for k, v in r.items():
            if k in ("clean_set", "signal_ok"):
                r[k] = v == "True"
            elif k not in ID_COLUMNS:
                r[k] = float(v) if v not in ("", "nan", "None") else np.nan
    return rows
