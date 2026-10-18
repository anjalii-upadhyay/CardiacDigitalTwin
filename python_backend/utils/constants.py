"""Physical and physiological constants shared across all processors."""

SAMPLING_RATE       = 125       # Hz
DELAY               = 1 / SAMPLING_RATE

# Total arterial compliance. Fitted to this recording (tests/test_values.py): 1.72 makes the
# pulse-pressure stroke volume agree with the Windkessel volume MAP*RR/R to within 1% (was -14%
# at 1.5), gives tau = R*C = 1.72 s matching the measured diastolic decay (1.7-2.1 s), and a
# cardiac index of ~3.1 L/min/m^2 for this subject. Literature range 1.0-2.0 mL/mmHg.
ARTERIAL_COMPLIANCE = 1.72      # mL/mmHg
VENTRICLE_RADIUS    = 3.0       # cm       — mean LV end-diastolic radius
WALL_THICKNESS      = 1.0       # cm       — mean LV wall thickness
# Total systemic resistance seen by the heart, MAP/CO ≈ 1.0 mmHg·s/mL for this subject
# (MAP ~79 mmHg, CO ~4.7 L/min). In the 3-element (Westerhof) Windkessel it splits into the aortic
# characteristic impedance Zc (~5-7% of the total, literature; NOT identifiable from a single
# pressure channel, so this is an assumption) and the peripheral resistance R.
CHARACTERISTIC_IMPEDANCE = 0.07  # mmHg·s/mL — Zc
RESISTANCE               = 0.93  # mmHg·s/mL — peripheral R   (R + Zc = 1.0 = MAP/CO)
BLOOD_DENSITY       = 1060      # kg/m³
AORTA_DIAMETER      = 0.025     # m  (~2.5 cm)
BLOOD_VISCOSITY     = 0.004     # Pa·s


def clamp(value: float, lo: float, hi: float) -> float:
    """Clamp value to [lo, hi]."""
    return max(lo, min(hi, value))
