"""
Turn one 80 s patch slice (plus the patient record) into a small set of numbers for the model.

Groups (plain words, medical term in brackets):
  rhythm      heart rate and how much the beat-to-beat interval varies (heart rate variability)
  vibration   the averaged heart vibration after each beat (seismocardiogram, SCG)
  breathing   breathing rate and depth from the slow chest movement
  posture     body tilt from the steady part of the accelerometer (gravity direction)
  record      age, sex, body mass index, blood pressure from the label file

Only the 7 patch channels are read. Hospital reference channels are never touched.
"""

import math

import numpy as np
from scipy.signal import butter, filtfilt, welch

from hf_twin.ml_training import config, data_io
from hf_twin.ml_training.quality import bandpass, detect_r_peaks

SCG_WINDOW_S = 0.6          # look at the vibration up to 600 ms after each beat
FIRST_PEAK_S = (0.0, 0.2)   # first big vibration (aortic valve opening, roughly)
SECOND_PEAK_S = (0.25, 0.6)  # second big vibration (aortic valve closing, roughly)


# ── helpers ──────────────────────────────────────────────────────────────────
def _lowpass(x, hi, fs=config.FS, order=2):
    b, a = butter(order, hi / (fs / 2), btype="low")
    return filtfilt(b, a, x)


def clean_rr(peaks, fs=config.FS):
    """Beat intervals in seconds, dropping ones far from the median (missed or extra detections)."""
    rr = np.diff(peaks) / fs
    if len(rr) == 0:
        return rr
    med = np.median(rr)
    return rr[(rr > 0.6 * med) & (rr < 1.4 * med)]


# ── feature groups ───────────────────────────────────────────────────────────
def rhythm_features(rr):
    """
    Standard short-term heart rate variability measures on regular beats only.
    A beat interval that changes by more than 20% from the previous one is treated as irregular
    (the common 20% artefact/ectopic rule) and left out of the variability numbers; how often that
    happens is kept as its own feature (irregular_share).
    """
    keys = ("hr_bpm", "rmssd_ms", "sdnn_ms", "pnn50", "irregular_share")
    if len(rr) < 10:
        return dict.fromkeys(keys, np.nan)
    d = np.diff(rr)
    regular = np.abs(d) <= 0.2 * rr[:-1]
    d_reg = d[regular]
    if len(d_reg) < 5:
        out = dict.fromkeys(keys, np.nan)
        out.update(hr_bpm=60.0 / np.mean(rr), irregular_share=float(1 - np.mean(regular)))
        return out
    rr_reg = rr[1:][regular]
    return {
        "hr_bpm": 60.0 / np.mean(rr),
        "rmssd_ms": 1000.0 * np.sqrt(np.mean(d_reg ** 2)),
        "sdnn_ms": 1000.0 * np.std(rr_reg, ddof=1),
        "pnn50": float(np.mean(np.abs(d_reg) > 0.05)),   # share of successive changes above 50 ms (standard definition)
        "irregular_share": float(1 - np.mean(regular)),
    }


def vibration_features(scg, peaks, rr, fs=config.FS):
    """Average the heart vibration over all beats, then measure its size and timing."""
    n = int(SCG_WINDOW_S * fs)
    if len(rr):
        n = min(n, int(0.9 * np.median(rr) * fs))      # never run into the next beat
    beats = np.array([scg[p : p + n] for p in peaks if p + n <= len(scg)])
    out = dict.fromkeys(("scg_amp_mg", "scg_energy_mg", "scg_t1_ms", "scg_t2_ms", "scg_t2_minus_t1_ms",
                         "scg_amp_cv"), np.nan)
    if len(beats) < 10:
        return out
    template = np.median(beats, axis=0)                 # median is robust to the odd noisy beat
    a1, b1 = int(FIRST_PEAK_S[0] * fs), int(FIRST_PEAK_S[1] * fs)
    a2, b2 = int(SECOND_PEAK_S[0] * fs), min(int(SECOND_PEAK_S[1] * fs), n)
    early = template[: min(int(0.4 * fs), n)]
    out["scg_amp_mg"] = float(np.ptp(early))
    out["scg_energy_mg"] = float(np.sqrt(np.mean(template[: min(int(0.25 * fs), n)] ** 2)))
    t1 = a1 + int(np.argmax(np.abs(template[a1:b1])))
    out["scg_t1_ms"] = 1000.0 * t1 / fs
    if b2 - a2 > 5:
        t2 = a2 + int(np.argmax(np.abs(template[a2:b2])))
        out["scg_t2_ms"] = 1000.0 * t2 / fs
        out["scg_t2_minus_t1_ms"] = out["scg_t2_ms"] - out["scg_t1_ms"]
    per_beat = np.ptp(beats[:, : early.size], axis=1)
    out["scg_amp_cv"] = float(np.std(per_beat) / np.mean(per_beat)) if np.mean(per_beat) > 0 else np.nan
    return out


def breathing_features(acc_dv, fs=config.FS):
    """Breathing moves the chest slowly (about 6-40 breaths a minute = 0.1-0.7 Hz)."""
    slow = bandpass(acc_dv, 0.1, 0.7, fs, order=2)
    f, p = welch(slow, fs=fs, nperseg=min(len(slow), 60 * fs))
    band = (f >= 0.1) & (f <= 0.7)
    rate = 60.0 * f[band][np.argmax(p[band])] if band.any() else np.nan
    return {"breath_rate_per_min": float(rate), "breath_depth_mg": float(np.std(slow))}


def posture_features(acc_xyz, fs=config.FS):
    """Angle between the head-to-foot axis and gravity: about 90 deg lying flat, smaller when propped up."""
    g = np.array([np.mean(_lowpass(acc_xyz[:, i], 0.1, fs)) for i in range(3)])   # lat, hf, dv in mg
    norm = np.linalg.norm(g)
    if norm < 1e-6:
        return {"tilt_deg": np.nan}
    return {"tilt_deg": float(math.degrees(math.acos(np.clip(abs(g[1]) / norm, -1, 1))))}


def record_features(label):
    """Static facts from the patient record (label file)."""
    h, w = label.get("height"), label.get("weight")
    bmi = w / (h / 100.0) ** 2 if isinstance(h, (int, float)) and isinstance(w, (int, float)) and h else np.nan
    num = lambda v: float(v) if isinstance(v, (int, float)) and v > 0 else np.nan  # noqa: E731  (-1 = not recorded)
    return {
        "age": num(label.get("age")),
        "male": 1.0 if str(label.get("gender", "")).lower().startswith("m") else 0.0,
        "bmi": float(bmi),
        "sbp_mmHg": num(label.get("sbp")),
        "dbp_mmHg": num(label.get("dbp")),
    }


def vibration_axes_features(acc, peaks, rr, fs=config.FS):
    """
    Richer vibration features (version 2): the averaged heartbeat vibration on every motion axis
    (side-to-side, head-to-foot, front-to-back) and their combined size, plus shape descriptors of the
    front-to-back beat that need no fitting (so they cannot leak test information).
    """
    names = ("lat", "hf", "dv")
    filt = [bandpass(acc[:, i], 1.0, 40.0, fs) for i in range(3)]
    filt.append(np.sqrt(filt[0] ** 2 + filt[1] ** 2 + filt[2] ** 2))     # combined size of the vibration
    names = names + ("vm",)
    n = int(SCG_WINDOW_S * fs)
    if len(rr):
        n = min(n, int(0.9 * np.median(rr) * fs))
    keep = [p for p in peaks if p + n <= len(filt[0])]
    out = {}
    for name, x in zip(names, filt):
        keys = (f"v2_{name}_amp_mg", f"v2_{name}_energy_mg", f"v2_{name}_t1_ms")
        if len(keep) < 10:
            out.update(dict.fromkeys(keys, np.nan))
            continue
        beats = np.array([x[p : p + n] for p in keep])
        tpl = np.median(beats, axis=0)
        early = tpl[: min(int(0.4 * fs), n)]
        out[keys[0]] = float(np.ptp(early))
        out[keys[1]] = float(np.sqrt(np.mean(tpl[: min(int(0.25 * fs), n)] ** 2)))
        out[keys[2]] = 1000.0 * int(np.argmax(np.abs(tpl[: int(FIRST_PEAK_S[1] * fs)]))) / fs
    # shape of the front-to-back beat
    shape_keys = ("v2_dv_peak_ratio", "v2_dv_beat_consistency", "v2_dv_low_band_share", "v2_dv_mid_band_share")
    if len(keep) < 10:
        out.update(dict.fromkeys(shape_keys, np.nan))
        return out
    dv = filt[2]
    beats = np.array([dv[p : p + n] for p in keep])
    tpl = np.median(beats, axis=0)
    a2, b2 = int(SECOND_PEAK_S[0] * fs), min(int(SECOND_PEAK_S[1] * fs), n)
    p1 = np.max(np.abs(tpl[: int(FIRST_PEAK_S[1] * fs)]))
    p2 = np.max(np.abs(tpl[a2:b2])) if b2 - a2 > 5 else np.nan
    out["v2_dv_peak_ratio"] = float(p2 / p1) if p1 > 0 else np.nan        # second vs first big vibration
    corr = [np.corrcoef(b, tpl)[0, 1] for b in beats if np.std(b) > 0]
    out["v2_dv_beat_consistency"] = float(np.median(corr)) if corr else np.nan
    spec = np.abs(np.fft.rfft(tpl * np.hanning(len(tpl)))) ** 2
    f = np.fft.rfftfreq(len(tpl), 1 / fs)
    total = spec[(f >= 1) & (f <= 40)].sum()
    out["v2_dv_low_band_share"] = float(spec[(f >= 1) & (f < 10)].sum() / total) if total > 0 else np.nan
    out["v2_dv_mid_band_share"] = float(spec[(f >= 10) & (f < 20)].sum() / total) if total > 0 else np.nan
    return out


VIBRATION_V2_FEATURES = tuple(f"v2_{a}_{k}" for a in ("lat", "hf", "dv", "vm") for k in ("amp_mg", "energy_mg", "t1_ms")) + (
    "v2_dv_peak_ratio", "v2_dv_beat_consistency", "v2_dv_low_band_share", "v2_dv_mid_band_share")

SIGNAL_FEATURES = ("hr_bpm", "rmssd_ms", "sdnn_ms", "pnn50", "irregular_share",
                   "scg_amp_mg", "scg_energy_mg", "scg_t1_ms", "scg_t2_ms", "scg_t2_minus_t1_ms", "scg_amp_cv",
                   "breath_rate_per_min", "breath_depth_mg", "tilt_deg", "skin_temp_c")
RECORD_FEATURES = ("age", "male", "bmi", "sbp_mmHg", "dbp_mmHg")


# ── one recording ────────────────────────────────────────────────────────────
def extract(rec: data_io.Recording) -> dict:
    channels = data_io.read_header(rec.rec_id)
    sig = data_io.load_window(rec.window_path, channels)
    ecg = sig[:, data_io.channel_index(channels, config.PATCH_ECG)]
    acc = np.column_stack([sig[:, data_io.channel_index(channels, n)] for n in config.PATCH_ACC])
    temp = sig[:, data_io.channel_index(channels, config.PATCH_TEMP)]
    return extract_from_arrays(ecg, acc, temp, rec.label)


def extract_from_arrays(ecg, acc, temp, label) -> dict:
    """
    Same features from raw arrays at 500 Hz, in physical units: ecg (n,), acc (n, 3) in the order side-to-side,
    head-to-foot, front-to-back, temp (n,), and the record facts (age, gender, height, weight, sbp, dbp).
    Used by the frozen model's predict() so a backend can score a new recording the same way.
    """
    peaks = detect_r_peaks(ecg)
    rr = clean_rr(peaks)
    scg_dv = bandpass(acc[:, 2], 1.0, 40.0)

    feats = {}
    feats.update(rhythm_features(rr))
    feats.update(vibration_features(scg_dv, peaks, rr))
    feats.update(vibration_axes_features(acc, peaks, rr))
    feats.update(breathing_features(acc[:, 2]))
    feats.update(posture_features(acc))
    t = float(np.median(temp))
    t = (t - 32.0) * 5.0 / 9.0 if t > 45.0 else t                      # some patches log Fahrenheit
    feats["skin_temp_c"] = t if 25.0 <= t <= 43.0 else np.nan           # outside skin range = sensor fault
    feats.update(record_features(label))
    feats["n_beats"] = int(len(peaks))
    return feats
