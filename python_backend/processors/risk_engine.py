"""
risk_engine.py — Weighted multi-factor cardiovascular risk classification.

EDUCATIONAL DISCLAIMER:
  This is a rule-based physiological model for educational demonstration only.
  It is NOT a validated clinical decision-support tool. Thresholds are derived
  from standard reference ranges (ACC/AHA 2017, ESC 2018) and adapted to the
  empirical output space of this simulation's haemodynamic formulas.

DESIGN PHILOSOPHY — why weighted points instead of OR-gates:
  The previous engine used independent OR-gates: any single metric crossing its
  threshold immediately escalated risk. This caused a patient with SBP=131 mmHg
  (barely Stage 1 HTN) but otherwise perfect haemodynamics to be classified
  "Moderate" — the same as someone with SBP=139 + tachycardia + elevated wall
  stress. That is not physiologically defensible.

  A weighted accumulation model is more realistic because cardiovascular risk is
  inherently multi-factorial. The Framingham Heart Study, SCORE2, and ACC/AHA
  pooled cohort equations all combine multiple independent risk factors. A single
  mildly elevated metric in an otherwise healthy profile contributes little risk;
  the same metric combined with several other abnormalities is genuinely dangerous.
"""

from utils.constants import BLOOD_DENSITY, AORTA_DIAMETER, BLOOD_VISCOSITY


# ─────────────────────────────────────────────────────────────────────────────
# Reynolds number (formula unchanged — only interpretation changes)
# ─────────────────────────────────────────────────────────────────────────────

def calc_reynolds(velocity: float) -> float:
    """
    Reynolds Number: Re = (ρ × v × D) / μ.
    Dimensionless ratio of inertial to viscous forces in aortic flow.

    Constants: ρ=1060 kg/m³, D=0.025 m, μ=0.004 Pa·s.
    Velocity is an empirical CO-scaled estimate (v = CO/5), so Re values here
    are systematically higher than textbook laminar-onset values (Re>2300).
    Thresholds in the risk model are calibrated to this formula's output space.
    """
    if BLOOD_VISCOSITY <= 0:
        return 0.0
    return round((BLOOD_DENSITY * velocity * AORTA_DIAMETER) / BLOOD_VISCOSITY, 1)


# ─────────────────────────────────────────────────────────────────────────────
# Weighted risk factor scoring
# ─────────────────────────────────────────────────────────────────────────────
#
# Each physiological factor contributes 0, 1, or 2 points:
#   0 = within normal range
#   1 = mildly elevated / borderline
#   2 = significantly abnormal
#
# Total score → risk level:
#   0–2  → Low      (healthy or single mild deviation)
#   3–5  → Moderate (multiple mild or one significant deviation)
#   6+   → High     (multiple significant deviations)
#
# This means a healthy adult with one mildly elevated metric stays "Low".
# "High" requires genuine multi-system haemodynamic compromise.
#
# WEIGHT RATIONALE:
#   MAP is weighted most heavily (max 3 pts) because sustained elevated
#   perfusion pressure is the strongest independent predictor of end-organ
#   damage in the Framingham and SCORE2 models.
#   Reynolds and wall stress are weighted moderately — they are model-derived
#   estimates with inherent uncertainty, so they should not dominate.
#   HR and CO are supporting signals that amplify risk when combined with
#   pressure abnormalities.

def _score_map(map_val: float) -> tuple[int, str]:
    """
    MAP (Mean Arterial Pressure) — primary perfusion pressure signal.
    Normal: 70–100 mmHg. Hypotension < 65 mmHg. Hypertensive crisis > 130 mmHg.
    Weighted up to 3 points because MAP is the most direct measure of
    sustained vascular load on end organs.
    """
    if map_val > 120:   return 3, "Critically elevated MAP — hypertensive urgency range"
    if map_val > 105:   return 2, "Elevated MAP — sustained hypertensive load"
    if map_val > 100:   return 1, "Mildly elevated MAP"
    if map_val < 65:    return 2, "Low MAP — risk of inadequate organ perfusion"
    if map_val < 70:    return 1, "Borderline low MAP"
    return 0, ""


def _score_wall_stress(ws: float) -> tuple[int, str]:
    """
    Ventricular wall stress via Laplace's Law: σ = P·r / 2h.
    Elevated wall stress increases myocardial O₂ demand and is associated
    with ventricular hypertrophy and heart failure progression.
    Normal ABP≈100 → σ≈150. Elevated ABP≈120 → σ≈180. High ABP≈167 → σ≈250.
    """
    if ws > 280:   return 2, "High ventricular wall stress — elevated myocardial O₂ demand"
    if ws > 200:   return 1, "Mildly elevated wall stress"
    return 0, ""


def _score_reynolds(re: float) -> tuple[int, str]:
    """
    Reynolds number — indicator of turbulent flow risk.
    Calibrated to this system's empirical velocity estimate (v = CO/5):
      Healthy rest CO≈5 → Re≈6 600 (normal for this model)
      Elevated CO≈8     → Re≈10 600 (borderline)
      High CO≈12        → Re≈15 900 (significantly elevated)
    Re alone is a weak risk signal because it is model-derived; it contributes
    at most 2 points and cannot trigger High risk by itself.
    """
    if re > 14_000:  return 2, "High Reynolds number — turbulent aortic flow likely"
    if re > 9_000:   return 1, "Elevated Reynolds number — possible flow turbulence"
    return 0, ""


def _score_hr(bpm: int) -> tuple[int, str]:
    """
    Heart Rate — sustained tachycardia increases myocardial O₂ demand and
    reduces diastolic filling time. Bradycardia may indicate conduction disease.
    Normal resting HR: 60–100 bpm (ACC/AHA).
    """
    if bpm > 130:   return 2, "Severe tachycardia — significantly increased cardiac workload"
    if bpm > 100:   return 1, "Tachycardia — elevated heart rate"
    if bpm < 45:    return 2, "Severe bradycardia — risk of haemodynamic compromise"
    if bpm < 60:    return 1, "Bradycardia — below normal resting heart rate"
    return 0, ""


def _score_co(co: float) -> tuple[int, str]:
    """
    Cardiac Output — volume pumped per minute.
    Normal resting CO: 4–8 L/min. Low CO (<3.5) may indicate heart failure
    or cardiogenic shock. High CO (>10) may indicate high-output states
    (sepsis, anaemia, hyperthyroidism).
    """
    if co < 2.5:    return 2, "Critically low cardiac output — possible cardiogenic compromise"
    if co < 3.5:    return 1, "Reduced cardiac output — monitor for impaired perfusion"
    if co > 12.0:   return 2, "Very high cardiac output — possible high-output state"
    if co > 9.0:    return 1, "Elevated cardiac output"
    return 0, ""


def _score_pulse_pressure(pp: float) -> tuple[int, str]:
    """
    Pulse Pressure — reflects stroke volume and arterial stiffness.
    Wide PP (>60 mmHg) suggests arterial stiffness or aortic regurgitation.
    Narrow PP (<25 mmHg) may indicate low stroke volume or tamponade.
    """
    if pp > 80:    return 2, "Wide pulse pressure — significant arterial stiffness"
    if pp > 60:    return 1, "Mildly wide pulse pressure"
    if pp < 20:    return 2, "Narrow pulse pressure — possible low stroke volume"
    if pp < 25:    return 1, "Borderline narrow pulse pressure"
    return 0, ""


# ─────────────────────────────────────────────────────────────────────────────
# Public interface
# ─────────────────────────────────────────────────────────────────────────────

def calc_risk_level(
    sbp: float,
    wall_stress: float,
    reynolds: float,
    bpm: int   = 72,
    map_val: float = 93.0,
    co: float  = 5.0,
    pp: float  = 40.0,
) -> str:
    """
    Weighted multi-factor cardiovascular risk classification.

    Returns "Low", "Moderate", or "High" based on accumulated risk points
    across seven independent physiological signals. No single metric can
    trigger High risk unless it is severely abnormal (score ≥ 6 alone is
    only possible for MAP in hypertensive urgency, which is clinically correct).

    Validation profiles:
      Healthy rest  (HR=70, MAP=90, CO=5, Re≈6600, WS≈150, PP=40) → Low
      Exercise/mild (HR=120, MAP=105, CO=7, Re≈9200, WS≈180, PP=50) → Moderate
      Abnormal      (HR=130, MAP=125, CO=12, Re≈16000, WS≈290, PP=75) → High
    """
    risk, _ = calc_risk_with_reasons(sbp, wall_stress, reynolds, bpm, map_val, co, pp)
    return risk


def calc_risk_with_reasons(
    sbp: float,
    wall_stress: float,
    reynolds: float,
    bpm: int   = 72,
    map_val: float = 93.0,
    co: float  = 5.0,
    pp: float  = 40.0,
) -> tuple[str, list[str]]:
    """
    Same as calc_risk_level but also returns a list of human-readable
    explanation strings for each triggered condition.

    Used by the debug log and available for future frontend display.
    """
    scorers = [
        _score_map(map_val),
        _score_wall_stress(wall_stress),
        _score_reynolds(reynolds),
        _score_hr(bpm),
        _score_co(co),
        _score_pulse_pressure(pp),
    ]

    total   = sum(s for s, _ in scorers)
    reasons = [msg for _, msg in scorers if msg]

    if total >= 6:
        level = "High"
    elif total >= 3:
        level = "Moderate"
    else:
        level = "Low"

    return level, reasons
