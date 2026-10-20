"""
predict(): score one chest-patch recording with the frozen model, the same way it was trained.

    from hf_twin.inference import predict_wedge
    result = predict_wedge(signals, channel_names, record)

signals        2-D array (samples x channels) in physical units at 500 samples/second (mV for ECG, mg for motion,
               degrees C for temperature), about 80 seconds is what the model was trained on
channel_names  names of the columns, using the dataset's names: patch_ECG, patch_ACC_lat, patch_ACC_hf, patch_ACC_dv,
               patch_Temp (other columns are ignored; hospital reference channels are never read)
record         patient facts: age, gender ("Male"/"Female"), height (cm), weight (kg), sbp, dbp (mmHg; missing = None)

The result holds the estimated wedge pressure, its 80% and 90% ranges (from the model's real blind errors), the chance
of congestion (wedge above 18 mmHg), the strict category and the leaning. If the signal fails the sanity check it returns
ok=False with the reasons instead of a number.
"""

from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np

from hf_twin.ml_training import calibration, config, data_io, features, quality

DEFAULT_MODEL = config.ARTIFACTS_DIR / "final" / "wedge_svr_v1.joblib"


@lru_cache(maxsize=2)
def load_model(path: str | Path = DEFAULT_MODEL) -> dict:
    return joblib.load(path)


def _index(names, wanted):
    try:
        return list(names).index(wanted)
    except ValueError as e:
        raise KeyError(f"channel {wanted!r} not found in channel_names") from e


def predict_wedge(signals, channel_names, record: dict, model: dict | None = None) -> dict:
    model = model or load_model()
    sig = np.asarray(signals, dtype=float)
    ecg_i = _index(channel_names, config.PATCH_ECG)
    acc_i = [_index(channel_names, n) for n in config.PATCH_ACC]
    temp_i = _index(channel_names, config.PATCH_TEMP)

    check = quality.check_window(sig, ecg_i, acc_i)
    if not check["ok"]:
        return {"ok": False, "reasons": check["reasons"], "model_version": model["version"]}

    feats = features.extract_from_arrays(sig[:, ecg_i], sig[:, acc_i], sig[:, temp_i], record)
    x = np.array([[feats[c] for c in model["features"]]], dtype=float)
    est = float(model["pipeline"].predict(x)[0])

    cal = model["calibration"]
    p = calibration.platt_probability(est, cal["slope"], cal["intercept"])
    lo80, hi80 = est + model["error_band_80"][0], est + model["error_band_80"][1]
    lo90, hi90 = est + model["error_band_90"][0], est + model["error_band_90"][1]
    cutoff = cal["cutoff_mmHg"]
    return {
        "ok": True,
        "wedge_mmHg": round(est, 1),
        "range80_mmHg": [round(lo80, 1), round(hi80, 1)],
        "range90_mmHg": [round(lo90, 1), round(hi90, 1)],
        "chance_congested": round(p, 3),
        "category_strict": "congested" if lo80 > cutoff else "not_congested" if hi80 <= cutoff else "uncertain",
        "lean": "congested" if p >= 0.5 else "not_congested",
        "cutoff_mmHg": cutoff,
        "heart_rate_bpm": check["heart_rate_bpm"],
        "n_beats": check["n_beats"],
        "duration_s": check["duration_s"],
        "model_version": model["version"],
        "note": "range and chance come from the model's blind (never-seen-patient) errors; not a catheter reading",
    }


def predict_recording(rec_id: str, model: dict | None = None) -> dict:
    """Convenience for the downloaded dataset: score recording `rec_id` (its wedge-position slice)."""
    rec = next(r for r in data_io.load_recordings() if r.rec_id == rec_id)
    channels = data_io.read_header(rec_id)
    sig = data_io.load_window(rec.window_path, channels)
    return predict_wedge(sig, [c.name for c in channels], rec.label, model)
