"""Physical and physiological constants shared across all processors."""

SAMPLING_RATE       = 125       # Hz
DELAY               = 1 / SAMPLING_RATE

ARTERIAL_COMPLIANCE = 1.5       # mL/mmHg  — aortic compliance estimate
VENTRICLE_RADIUS    = 3.0       # cm       — mean LV end-diastolic radius
WALL_THICKNESS      = 1.0       # cm       — mean LV wall thickness
RESISTANCE          = 1.0       # mmHg·s/mL — peripheral vascular resistance
BLOOD_DENSITY       = 1060      # kg/m³
AORTA_DIAMETER      = 0.025     # m  (~2.5 cm)
BLOOD_VISCOSITY     = 0.004     # Pa·s


def clamp(value: float, lo: float, hi: float) -> float:
    """Clamp value to [lo, hi]."""
    return max(lo, min(hi, value))
