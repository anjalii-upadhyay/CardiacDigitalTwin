"""
The approved six-action menu (journey D29/P19) and the safety rules that decide, in code and before any AI is asked,
which actions are even allowed for a patient.

Design parameters (engineering choices, NOT clinical values; documented so a clinician can change them):
  CONGESTED_CHANCE / NOT_CONGESTED_CHANCE  the outer bands of the model's reliability table (journey R7): in those bands
      the chance was closest to the share really congested (75-100%: 83% observed; 0-25%: 19% observed).
  SBP_LOW_MMHG = 90  hypotension guard; CSI 2018 Table 11 uses SBP < 90 mmHg as a caution for diuretic dosing.
Clinical cut-offs come from CSI 2018 Fig. 7 (congestion: wedge > 18 mmHg; low perfusion: cardiac index < 2.2).
Rule of D28: perfusion comes only from measured values; if it is unknown, any action that depends on it is not allowed.
"""

from dataclasses import dataclass, field

from hf_twin.recommendation import congestion_state as cs

CONGESTED_CHANCE = 0.75
NOT_CONGESTED_CHANCE = 0.25
SBP_LOW_MMHG = 90.0

ACTIONS = {
    "CONTINUE_GDMT": {
        "label": "No congestion: continue current guideline therapy",
        "description": ("No congestion and adequate perfusion: continue the current guideline-directed medical therapy "
                        "(CSI 2018 Fig. 7)."),
        "tags": ["NO_CONGESTION_CONTINUE_GDMT"],
    },
    "DIURETIC_REVIEW": {
        "label": "Congestion: clinician reviews the diuretic",
        "description": ("Congestion with adequate perfusion: the clinician reviews the diuretic therapy to relieve "
                        "congestion (AHA/ACC/HFSA 2022 section 7.2 and 9.3; CSI 2018 Fig. 7)."),
        "tags": ["CONGESTION_DIURETIC_REVIEW"],
    },
    "DIURETIC_RESISTANCE_REVIEW": {
        "label": "Diuretic not working: clinician reviews the resistance options",
        "description": ("Congestion persisting despite a loop diuretic at a high dose: the clinician reviews options to "
                        "intensify the diuretic regimen (AHA/ACC/HFSA 2022 section 7.2 and 9.3)."),
        "tags": ["DIURETIC_RESISTANCE_REVIEW"],
    },
    "VASODILATOR_ADJUVANT": {
        "label": "Vasodilator add-on may be considered (hospital only)",
        "description": ("In hospital, congestion without hypotension and with adequate perfusion: an intravenous "
                        "vasodilator may be considered as an add-on to diuretic therapy (AHA/ACC/HFSA 2022 section 9.4a, "
                        "class 2b; CSI 2018 section 2.2.3)."),
        "tags": ["VASODILATOR_ADJUVANT_CONSIDER", "SAFETY_HYPOTENSION"],
    },
    "URGENT_CLINICAL_REVIEW": {
        "label": "Urgent clinical review",
        "description": ("Low perfusion or low blood pressure: urgent assessment by a clinician; congestion and perfusion "
                        "must be assessed to guide triage (AHA/ACC/HFSA 2022 section 9.1; CSI 2018 Fig. 7)."),
        "tags": ["URGENT_CLINICAL_REVIEW", "LOW_PERFUSION_URGENT_REVIEW"],
    },
    "ABSTAIN": {
        "label": "Abstain: clinician review",
        "description": ("The patient's data does not clearly support any other action: make no recommendation and leave "
                        "the decision to the clinician."),
        "tags": [],
    },
}
ALWAYS_TAGS = ["THRESHOLDS", "SAFETY_MONITORING"]
DISCLAIMER = "Decision support for the clinician. The clinician decides; no dose is suggested."


@dataclass
class PatientFacts:
    chance_congested: float | None = None      # model: chance that wedge pressure is above 18 mmHg
    wedge_estimate: float | None = None        # model estimate, mmHg
    range80: tuple | None = None               # model 80% range, mmHg
    cardiac_index: float | None = None         # MEASURED, L/min/m2 (None = unknown)
    sbp: float | None = None                   # mmHg (None = unknown)
    inpatient: bool | None = None              # None = unknown
    current_diuretic: str = "unknown"          # unknown | none | loop | loop_high_dose (entered by the clinician)
    case_id: str = ""
    notes: dict = field(default_factory=dict)


def congestion_status(f: PatientFacts) -> str:
    """'congested', 'not_congested' or 'uncertain', from the model's chance and range (never from the catheter)."""
    lo, hi = (f.range80 or (None, None))
    if lo is not None and lo > cs.WEDGE_CONGESTION_MMHG:
        return "congested"
    if f.chance_congested is None:
        return "uncertain"
    if f.chance_congested >= CONGESTED_CHANCE:
        return "congested"
    if f.chance_congested <= NOT_CONGESTED_CHANCE or (hi is not None and hi <= cs.WEDGE_CONGESTION_MMHG):
        return "not_congested"
    return "uncertain"


def perfusion_status(f: PatientFacts) -> str:
    if f.cardiac_index is None:
        return "unknown"
    return "low" if f.cardiac_index < cs.CARDIAC_INDEX_LOW else "normal"


def eligible_actions(f: PatientFacts) -> tuple[list[str], list[str], dict]:
    """
    Returns (allowed action ids, safety flags, derived status). ABSTAIN is always allowed.
    Safety rules act here, so an unsafe action can never be offered to the AI.
    """
    cong, perf = congestion_status(f), perfusion_status(f)
    hypotension = f.sbp is not None and f.sbp < SBP_LOW_MMHG
    flags = []
    if perf == "unknown":
        flags.append("perfusion unknown: actions that depend on it are not allowed")
    if perf == "low":
        flags.append("low perfusion (measured cardiac index below 2.2)")
    if hypotension:
        flags.append(f"low blood pressure (SBP below {SBP_LOW_MMHG:.0f})")
    if cong == "uncertain":
        flags.append("congestion uncertain: the model's chance is in the middle zone")

    allowed = []
    if perf == "low" or hypotension:
        allowed.append("URGENT_CLINICAL_REVIEW")
    if cong == "not_congested" and perf == "normal" and not hypotension:
        allowed.append("CONTINUE_GDMT")
    if cong == "congested" and perf == "normal" and not hypotension:
        allowed.append("DIURETIC_REVIEW")
        if f.current_diuretic == "loop_high_dose":
            allowed.append("DIURETIC_RESISTANCE_REVIEW")
        if f.inpatient is True and f.sbp is not None:     # hospital only, and blood pressure must be known and not low
            allowed.append("VASODILATOR_ADJUVANT")
    allowed.append("ABSTAIN")
    return allowed, flags, {"congestion": cong, "perfusion": perf, "hypotension": hypotension}
