"""Haemodynamic parameter calculations (Windkessel, Laplace, etc.)."""

from utils.constants import (
    ARTERIAL_COMPLIANCE, VENTRICLE_RADIUS, WALL_THICKNESS,
    RESISTANCE, clamp
)


def calc_map(sbp: float, dbp: float) -> float:
    """Mean Arterial Pressure — DBP + 1/3 of pulse pressure (mmHg)."""
    return dbp + (sbp - dbp) / 3.0


def calc_pulse_pressure(sbp: float, dbp: float) -> float:
    """Pulse Pressure — systolic minus diastolic (mmHg)."""
    return sbp - dbp


def calc_stroke_volume(pulse_pressure: float) -> float:
    """
    Stroke Volume via Windkessel: SV ≈ PP × arterial compliance (mL).
    Clamped to physiological range [20, 200] mL.
    """
    return clamp(pulse_pressure * ARTERIAL_COMPLIANCE, 20.0, 200.0)


def calc_cardiac_output(sv: float, bpm: float) -> float:
    """Cardiac Output = SV × HR / 1000 (L/min). Clamped to [1, 20]."""
    return clamp((sv * bpm) / 1000.0, 1.0, 20.0)


def calc_ptt(sbp: float) -> float:
    """
    Pulse Transit Time estimate from SBP (ms).
    PTT ≈ 250 − 0.5 × (SBP − 120). Higher BP → stiffer arteries → shorter PTT.
    Clamped to [100, 300] ms.
    """
    return clamp(250.0 - 0.5 * (sbp - 120.0), 100.0, 300.0)


def calc_wall_stress(abp: float) -> float:
    """
    LV wall stress via Laplace's Law: σ = (P × r) / (2 × h).
    Uses ABP as transmural pressure surrogate (mmHg units).
    """
    if WALL_THICKNESS <= 0:
        return 0.0
    return (abp * VENTRICLE_RADIUS) / (2.0 * WALL_THICKNESS)


def calc_blood_flow(abp: float, prev_abp: float, dt: float) -> tuple[float, float]:
    """
    Blood flow via 2-element Windkessel: Q = P/R + C × dP/dt (mL/s).
    Returns (blood_flow, dpdt) so the frontend can recompute Q exactly
    using the same dP/dt the backend used — eliminating timing-based errors.
    Clamped to [0, 500] mL/s.
    """
    dpdt = (abp - prev_abp) / dt if dt > 0 else 0.0
    flow = clamp((abp / RESISTANCE) + (ARTERIAL_COMPLIANCE * dpdt), 0.0, 500.0)
    return flow, dpdt


def calc_blood_velocity(cardiac_output_lpm: float) -> float:
    """Mean aortic blood velocity (m/s) — empirical scaling: v ≈ CO / 5."""
    return clamp(cardiac_output_lpm / 5.0, 0.0, 5.0)
