"""Haemodynamic parameter calculations (Windkessel, Laplace, etc.).

Units are stated on every function. Validation against the recording lives in
tests/test_values.py; the calibration rationale for each constant is in utils/constants.py.
"""

import math

from utils.constants import (
    ARTERIAL_COMPLIANCE, VENTRICLE_RADIUS, WALL_THICKNESS,
    RESISTANCE, CHARACTERISTIC_IMPEDANCE, AORTA_DIAMETER, clamp
)

MMHG_TO_KPA = 0.133322
AORTA_AREA_M2 = math.pi * (AORTA_DIAMETER / 2.0) ** 2   # 4.909e-4 m^2 for D = 2.5 cm


def calc_map(sbp: float, dbp: float) -> float:
    """Mean Arterial Pressure — DBP + 1/3 of pulse pressure (mmHg)."""
    return dbp + (sbp - dbp) / 3.0


def calc_pulse_pressure(sbp: float, dbp: float) -> float:
    """Pulse Pressure — systolic minus diastolic (mmHg)."""
    return sbp - dbp


def calc_stroke_volume(pulse_pressure: float) -> float:
    """
    Stroke Volume ESTIMATE via the pulse-pressure method: SV ≈ PP × total arterial compliance (mL).
    This is a surrogate, not a measured volume, and it does not fall with heart rate as real SV does.
    Clamped to [5, 200] mL — the floor must stay below pathological values so genuinely low output
    is reported rather than hidden.
    """
    return clamp(pulse_pressure * ARTERIAL_COMPLIANCE, 5.0, 200.0)


def calc_cardiac_output(sv: float, bpm: float) -> float:
    """Cardiac Output = SV × HR / 1000 (L/min). Clamped to [0.3, 20]."""
    return clamp((sv * bpm) / 1000.0, 0.3, 20.0)


def calc_bsa(height_cm: float, weight_kg: float) -> float:
    """Body Surface Area, Mosteller formula (m^2). Links the static record to the dynamic flow values."""
    return math.sqrt(height_cm * weight_kg / 3600.0)


def calc_cardiac_index(co_lpm: float, bsa_m2: float) -> float:
    """Cardiac Index = CO / BSA (L/min/m^2). Normal resting range 2.5-4.0; <2.2 is the shock threshold."""
    return co_lpm / bsa_m2 if bsa_m2 > 0 else 0.0


def calc_wall_stress(systolic_mmhg: float) -> float:
    """
    Peak systolic LV wall stress via Laplace's law for a thin-walled sphere, σ = P·r / (2h), in kPa.
    r and h are population constants, so this is SBP on a different scale — it is reported for
    display but carries no information independent of blood pressure.
    Reference: peak systolic wall stress ~15-25 kPa (150-250 kdyn/cm^2).
    """
    if WALL_THICKNESS <= 0:
        return 0.0
    return systolic_mmhg * MMHG_TO_KPA * VENTRICLE_RADIUS / (2.0 * WALL_THICKNESS)


class Windkessel3:
    """
    3-element (Westerhof) Windkessel run in the INVERSE direction: given the measured aortic
    pressure P, recover the flow Q the heart delivers.

        P = Zc·Q + P_wk                      characteristic impedance Zc in series
        C·dP_wk/dt = Q − P_wk/R              compliance C and peripheral runoff R in parallel

    Eliminating Q leaves a linear first-order ODE for the Windkessel pressure P_wk, which is
    integrated EXACTLY over each 8 ms sample (unconditionally stable, no Euler step):

        P_wk* = P · R/(R+Zc)                 steady state for a held pressure
        P_wk ← P_wk* + (P_wk − P_wk*) · exp(−dt·(1/Zc + 1/R)/C)
        Q    = (P − P_wk) / Zc

    Properties used by tests/test_values.py: mean Q = MAP/(R+Zc); per-beat volume = MAP·RR/(R+Zc);
    diastolic decay τ = R·C (valve shut ⇒ Q≈0 ⇒ P = P_wk). Unlike the 2-element inverse, Q has no
    dP/dt term, so sample noise is not amplified; the brief negative Q at valve closure (dicrotic
    notch) is physical backflow and is kept. State must be reset at a dataset window splice.
    """

    def __init__(self, zc: float = CHARACTERISTIC_IMPEDANCE, r: float = RESISTANCE, c: float = ARTERIAL_COMPLIANCE):
        self.zc, self.r, self.c = zc, r, c
        self.rate = (1.0 / zc + 1.0 / r) / c
        self.gain = r / (r + zc)
        self.p_wk = None
        self.prev_p = None

    def reset(self, p0: float) -> None:
        """Start at the steady state for the first pressure so a splice causes no spurious transient."""
        self.p_wk = p0 * self.gain
        self.prev_p = p0

    def step(self, p: float, dt: float) -> tuple[float, float, float]:
        """Advance one sample. Returns (flow mL/s, dP/dt mmHg/s, Windkessel pressure mmHg)."""
        if not math.isfinite(p):
            return 0.0, 0.0, self.p_wk if self.p_wk is not None else 0.0
        if self.p_wk is None:
            self.reset(p)
        dpdt = (p - self.prev_p) / dt if dt > 0 else 0.0
        self.prev_p = p
        target = p * self.gain
        self.p_wk = target + (self.p_wk - target) * math.exp(-self.rate * dt)
        return (p - self.p_wk) / self.zc, dpdt, self.p_wk


def calc_blood_velocity(cardiac_output_lpm: float) -> float:
    """Mean aortic blood velocity, v = Q / A (m/s). Reference mean ~0.1-0.2 m/s (peak systolic ~1-1.7)."""
    q_m3s = cardiac_output_lpm / 1000.0 / 60.0
    return clamp(q_m3s / AORTA_AREA_M2, 0.0, 5.0)
