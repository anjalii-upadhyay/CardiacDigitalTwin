"""
Signal sanity checks: is the heartbeat visible in the patch ECG, and are the motion sensors alive?

The limits below are engineering checks on the recording, not clinical thresholds:
  * a heart rate outside 30-200 bpm almost always means the beat detector failed
  * a channel whose spread is ~0 is flat (sensor off or saturated)
"""

import numpy as np
from scipy.signal import butter, filtfilt, find_peaks

from hf_twin.ml_training import config

HR_MIN, HR_MAX = 30.0, 200.0
FLAT_STD = 1e-6


def bandpass(x: np.ndarray, lo: float, hi: float, fs: int = config.FS, order: int = 3) -> np.ndarray:
    b, a = butter(order, [lo / (fs / 2), hi / (fs / 2)], btype="band")
    return filtfilt(b, a, x)


def detect_r_peaks(ecg: np.ndarray, fs: int = config.FS) -> np.ndarray:
    """Simple R-peak detector: band-pass, pick the stronger polarity, peaks at least 0.3 s apart."""
    f = bandpass(ecg, 5.0, 25.0, fs)
    if np.percentile(-f, 99.5) > np.percentile(f, 99.5):   # patch may record the beat upside down
        f = -f
    height = 0.4 * np.percentile(f, 99.5)
    peaks, _ = find_peaks(f, height=height, distance=int(0.3 * fs))
    return peaks


def check_window(sig: np.ndarray, ecg_idx: int, acc_idx: list[int], fs: int = config.FS) -> dict:
    """Quality metrics for one slice. 'ok' is False with reasons if the slice is unusable."""
    ecg = sig[:, ecg_idx]
    reasons = []
    if np.std(ecg) < FLAT_STD:
        reasons.append("ECG flat")
        peaks = np.array([], dtype=int)
    else:
        peaks = detect_r_peaks(ecg, fs)
    duration_s = len(ecg) / fs
    rr = np.diff(peaks) / fs
    hr = 60.0 / np.median(rr) if len(rr) else float("nan")
    if not (HR_MIN <= hr <= HR_MAX):
        reasons.append(f"heart rate implausible ({hr:.0f} bpm)")
    # share of beat intervals far from the median: a crude detector-failure flag
    odd_beats = float(np.mean(np.abs(rr - np.median(rr)) > 0.3 * np.median(rr))) if len(rr) else 1.0
    acc_std = [float(np.std(bandpass(sig[:, i], 1.0, 40.0, fs))) for i in acc_idx]
    for name, s in zip(config.PATCH_ACC, acc_std):
        if s < FLAT_STD:
            reasons.append(f"{name} flat")
    return {
        "duration_s": round(duration_s, 1),
        "n_beats": int(len(peaks)),
        "heart_rate_bpm": round(hr, 1) if np.isfinite(hr) else None,
        "odd_beat_share": round(odd_beats, 3),
        "acc_vibration_std_mg": [round(s, 3) for s in acc_std],
        "ok": not reasons,
        "reasons": reasons,
    }
