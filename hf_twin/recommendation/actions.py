"""
The approved six-action menu (journey D29/P19) and the safety rules that decide, in code and before any AI is asked,
which actions are even allowed for a patient.

Design parameters (engineering choices, NOT clinical values; documented so a clinician can change them):
  CONGESTED_CHANCE / NOT_CONGESTED_CHANCE  the outer bands of the model's reliability table (journey R7): in those bands
      the chance was closest to the share really congested (75-100%: 83% observed; 0-25%: 19% observed).
Clinical cut-offs (cited):
  congestion: wedge pressure > 18 mmHg, and low perfusion: cardiac index < 2.2 L/min/m2 (CSI 2018 Fig. 7, p. S20;
      the 2.2 also appears in AHA/ACC/HFSA 2022 Table 23, p. e966)
  SBP_LOW_MMHG = 90  low blood pressure: "Hypotension (eg, SBP <90 mm Hg)" (AHA/ACC/HFSA 2022, p. e966, Tables 22-23).
      It is an example value there and is not enough alone to diagnose shock. CSI 2018 Table 11 also uses SBP < 90.
Engineering choice (journey D37): low measured flow or low blood pressure always leads to the clinician-review action.
No guideline states that sentence; it is a conservative safety rule. It is decided by code alone, never by the AI, and
the label says "urgent" only when both values are low (the two measured shock criteria of AHA Table 23).
Rule of D28: perfusion comes only from measured values; if it is unknown, any action that depends on it is not allowed.
"""

from dataclasses import dataclass, field

from hf_twin.recommendation import congestion_state as cs

CONGESTED_CHANCE = 0.75
NOT_CONGESTED_CHANCE = 0.25
SBP_LOW_MMHG = 90.0
REVIEW_ACTION = "LOW_FLOW_OR_PRESSURE_REVIEW"

# Decided by the rule alone (journey D37). Wording says "urgent" only when both measured values are low.
REVIEW = {
    "both": {
        "label": "Urgent clinical review: low blood flow and low blood pressure together",
        "why": ("Both measured values are below their cut-offs: cardiac index below 2.2 L/min/m² (CSI 2018 Fig. 7) and "
                "systolic blood pressure below 90 mmHg (AHA/ACC/HFSA 2022, p. e966). These are two of the measured criteria "
                "listed for cardiogenic shock; the diagnosis also needs signs of poor organ blood supply, which this tool "
                "cannot assess, so a clinician needs to assess the patient urgently."),
        "citations": ["AHA-T23", "AHA-9.5-SHOCKTEXT", "CSI-FIG7", "AHA-9.1-R1"],
    },
    "flow": {
        "label": "Low blood flow: clinician reviews the treatment plan",
        "why": ("Measured cardiac index is below 2.2 L/min/m², the CSI 2018 cut-off for low blood flow. The guideline treats "
                "this group differently from patients with normal flow, so a clinician reviews the treatment plan before any "
                "diuretic or vasodilator step."),
        "citations": ["CSI-FIG7", "AHA-9.1-R1"],
    },
    "pressure": {
        "label": "Low blood pressure: clinician reviews",
        "why": ("Systolic blood pressure is below 90 mmHg, the example cut-off for hypotension in the AHA/ACC/HFSA 2022 "
                "guideline (p. e966). Low pressure limits some treatments (for example, CSI 2018 says vasodilators should be "
                "avoided in symptomatic hypotension), so a clinician reviews the plan."),
        "citations": ["AHA-T23", "AHA-9.5-SHOCKTEXT", "CSI-2.2.3-VASO"],
    },
}

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
    REVIEW_ACTION: {
        "label": "Low blood flow or low blood pressure: clinician reviews",
        "description": ("Measured low blood flow (cardiac index below 2.2) and/or low blood pressure (systolic below 90): "
                        "the clinician reviews the treatment plan before any diuretic or vasodilator step (CSI 2018 Fig. 7; "
                        "AHA/ACC/HFSA 2022 section 9.1 and p. e966)."),
        "tags": ["URGENT_CLINICAL_REVIEW", "LOW_PERFUSION_URGENT_REVIEW", "LOW_PRESSURE_REVIEW"],
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


def review_kind(f: PatientFacts) -> str | None:
    """'both', 'flow' or 'pressure' when measured flow and/or blood pressure is low, else None."""
    low_flow = perfusion_status(f) == "low"
    low_pressure = f.sbp is not None and f.sbp < SBP_LOW_MMHG
    if low_flow and low_pressure:
        return "both"
    return "flow" if low_flow else ("pressure" if low_pressure else None)


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
        allowed.append(REVIEW_ACTION)
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
