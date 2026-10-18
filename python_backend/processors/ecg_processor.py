"""ECG-derived metrics: RR interval and cardiac phase."""

from utils.constants import clamp


def calc_rr_interval(bpm: float) -> float:
    """RR interval — time between consecutive R-peaks (seconds)."""
    return 60.0 / bpm if bpm > 0 else 1.0


def calc_cardiac_phase(current_time: float, last_r_peak_time: float, rr: float) -> float:
    """
    Normalised position within the cardiac cycle.
    0 = R-peak (systole onset), 1 = next R-peak.
    """
    if rr <= 0:
        return 0.0
    return clamp((current_time - last_r_peak_time) / rr, 0.0, 1.0)
