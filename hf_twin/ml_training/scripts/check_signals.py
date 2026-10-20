"""
Step 3.0: sanity-check every downloaded slice before building features.

Writes artifacts/signal_check.csv (one row per recording) and artifacts/signal_check_examples.png.
Run from the repo root:
    python_backend/venv/Scripts/python.exe -m hf_twin.ml_training.scripts.check_signals
"""

import csv

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from hf_twin.ml_training import config, data_io, quality  # noqa: E402


def main():
    config.ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    recs = data_io.load_recordings()
    rows, examples = [], []
    for rec in recs:
        channels = data_io.read_header(rec.rec_id)
        sig = data_io.load_window(rec.window_path, channels)
        ecg_i = data_io.channel_index(channels, config.PATCH_ECG)
        acc_i = [data_io.channel_index(channels, n) for n in config.PATCH_ACC]
        q = quality.check_window(sig, ecg_i, acc_i)
        excl = data_io.exclusion_reasons(rec)
        rows.append({
            "rec_id": rec.rec_id, "patient_id": rec.patient_id, "window": rec.window_kind,
            **{k: v for k, v in q.items() if k not in ("acc_vibration_std_mg", "reasons")},
            "acc_std_lat_hf_dv_mg": " ".join(str(s) for s in q["acc_vibration_std_mg"]),
            "signal_problems": "; ".join(q["reasons"]),
            "clean_set": not excl, "exclusion_reasons": "; ".join(excl),
            "wedge_mmHg": rec.targets["wedge_mmHg"],
        })
        if len(examples) < 3 and q["ok"]:
            examples.append((rec.rec_id, sig, ecg_i, acc_i[2]))

    out = config.ARTIFACTS_DIR / "signal_check.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    # example plot: 8 s of patch ECG and the front-to-back heart vibration, with detected beats
    fig, axes = plt.subplots(len(examples), 1, figsize=(11, 2.6 * len(examples)), squeeze=False)
    for ax, (rec_id, sig, ecg_i, dv_i) in zip(axes[:, 0], examples):
        n = 8 * config.FS
        ecg = quality.bandpass(sig[:, ecg_i], 5.0, 25.0)[:n]
        scg = quality.bandpass(sig[:, dv_i], 1.0, 40.0)[:n]
        t = np.arange(n) / config.FS
        peaks = quality.detect_r_peaks(sig[:, ecg_i])
        peaks = peaks[peaks < n]
        ax.plot(t, ecg / (np.max(np.abs(ecg)) or 1) + 1.2, lw=0.8, label="patch ECG")
        ax.plot(t, scg / (np.max(np.abs(scg)) or 1) - 1.2, lw=0.8, label="heart vibration (front-to-back)")
        ax.plot(peaks / config.FS, np.full(len(peaks), 2.3), "rv", ms=4, label="detected beats")
        ax.set_title(rec_id, fontsize=9)
        ax.set_yticks([])
        ax.legend(loc="upper right", fontsize=7)
    axes[-1, 0].set_xlabel("seconds")
    fig.tight_layout()
    fig.savefig(config.ARTIFACTS_DIR / "signal_check_examples.png", dpi=110)

    ok = [r for r in rows if r["ok"]]
    clean = [r for r in rows if r["clean_set"]]
    clean_ok = [r for r in clean if r["ok"]]
    hrs = [r["heart_rate_bpm"] for r in ok]
    print(f"slices checked: {len(rows)} | signal OK: {len(ok)} | clean set: {len(clean)} | clean AND signal OK: "
          f"{len(clean_ok)} from {len({r['patient_id'] for r in clean_ok})} patients")
    print(f"heart rate in OK slices: median {np.median(hrs):.0f} bpm, range {min(hrs):.0f}-{max(hrs):.0f}")
    print(f"beats per slice (OK): median {int(np.median([r['n_beats'] for r in ok]))}")
    bad = [r for r in rows if not r["ok"]]
    for r in bad:
        print(f"  problem: {r['rec_id']} ({r['window']}): {r['signal_problems']}")
    high_odd = [r for r in ok if r["odd_beat_share"] > 0.2]
    print(f"OK slices with >20% irregular beat intervals (check by eye): {len(high_odd)} "
          f"{[r['rec_id'] for r in high_odd]}")
    print(f"wrote {out} and signal_check_examples.png")


if __name__ == "__main__":
    main()
