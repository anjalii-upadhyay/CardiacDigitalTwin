"""
Step 3.6: V4, pre-registered before its data arrived.

Same as V0 (signals v1 + record), but each recording's signal features are the average over all of its baseline
slices (wedge, artery and right-atrium catheter positions) instead of one 80 s slice. Tested with SVR and extra
trees (the two tied-best models in R3), with the same honest testing (10 patient groups, 3 splits averaged).
Only the 63 clean recordings are scored; slices that fail the signal check are left out of the average.

Outputs: artifacts/v4_multi_slice.json, artifacts/features_all_slices.csv
Run from the repo root:
    python_backend/venv/Scripts/python.exe -m hf_twin.ml_training.scripts.run_v4_multi_slice
"""

import csv
import json
from collections import defaultdict

import numpy as np

from hf_twin.ml_training import config, data_io, dataset, evaluate, features, quality

SEEDS = (42, 7, 2026)
COLS = features.SIGNAL_FEATURES + features.RECORD_FEATURES


def slice_features():
    rows = []
    for rec in data_io.load_all_baseline_slices():
        channels = data_io.read_header(rec.rec_id)
        sig = data_io.load_window(rec.window_path, channels)
        q = quality.check_window(sig, data_io.channel_index(channels, config.PATCH_ECG),
                                 [data_io.channel_index(channels, n) for n in config.PATCH_ACC])
        row = {"rec_id": rec.rec_id, "slice": rec.window_kind, "signal_ok": q["ok"]}
        row.update(features.extract(rec))
        rows.append(row)
    with open(config.ARTIFACTS_DIR / "features_all_slices.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    return rows


def main():
    base = [r for r in dataset.load_table() if r["clean_set"] and r["signal_ok"] and r["phase"] == "baseline"]
    slices = slice_features()
    by_rec = defaultdict(list)
    for s in slices:
        if s["signal_ok"]:
            by_rec[s["rec_id"]].append(s)
    counts = [len(by_rec[r["rec_id"]]) for r in base]
    print(f"recordings {len(base)} | slices per recording: " + ", ".join(f"{k}: {counts.count(k)}" for k in sorted(set(counts))))

    y = np.array([r["wedge_mmHg"] for r in base])
    g = np.array([r["patient_id"] for r in base])
    decomp = np.array([r["pdecomp"] for r in base])
    X_v0 = np.array([[r[c] for c in COLS] for r in base], dtype=float)
    X_v4 = X_v0.copy()
    for i, r in enumerate(base):
        for j, c in enumerate(features.SIGNAL_FEATURES):
            vals = [float(s[c]) for s in by_rec[r["rec_id"]] if np.isfinite(float(s[c]))]
            if vals:
                X_v4[i, j] = float(np.mean(vals))

    naive = np.mean([evaluate.out_of_fold_predictions(np.zeros((len(y), 1)), y, g, "naive_mean", seed=s)[0]
                     for s in SEEDS], axis=0)
    out = {"n": len(base), "slices_per_recording": counts, "naive_mae": float(np.mean(np.abs(naive - y))), "runs": {}}
    print(f"naive MAE {out['naive_mae']:.2f}")
    for label, X in (("V0_one_slice", X_v0), ("V4_averaged_slices", X_v4)):
        for m in ("svr", "extra_trees"):
            per = [evaluate.out_of_fold_predictions(X, y, g, m, seed=s)[0] for s in SEEDS]
            p = np.mean(per, axis=0)
            s = evaluate.summary(y, p)
            s["mae_per_split"] = [float(np.mean(np.abs(q - y))) for q in per]
            s["vs_naive"] = evaluate.bootstrap_mae_gain(y, p, naive, g)
            s["auroc_decompensated"] = evaluate.auroc(p, decomp)
            out["runs"][f"{label}__{m}"] = s
            gg = s["vs_naive"]
            print(f"  {label:<20} {m:<12} MAE {s['mae']:.2f} ({', '.join(f'{v:.2f}' for v in s['mae_per_split'])}) "
                  f"r {s['pearson_r']:+.2f} R2 {s['r2']:+.2f} | gain {gg['mae_gain_mmHg_or_mL']:+.2f} "
                  f"[{gg['ci95_low']:+.2f}, {gg['ci95_high']:+.2f}]{'  MEETS RULE' if gg['meets_success_rule'] else ''}"
                  f" | AUROC {s['auroc_decompensated']:.2f}", flush=True)
    (config.ARTIFACTS_DIR / "v4_multi_slice.json").write_text(json.dumps(out, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
