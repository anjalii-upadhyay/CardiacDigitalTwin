"""
recommend(): guideline-grounded action for one patient, in the approved two-step design (journey D29).

  0. rules (code)   which actions are allowed at all for this patient (actions.eligible_actions). Unsafe actions are never
                    shown to the AI. If only ABSTAIN is allowed, no AI call is made.
  1. Jev "choice"   picks ONE allowed action, using only the patient facts and the verbatim guideline excerpts.
  2. Jev "score"    rates how well those excerpts support the chosen action for this patient (rubric 0-3).
  3. gate           the action is shown only if it was chosen with enough confidence AND supported well enough;
                    otherwise, or on any failure, the result is ABSTAIN (clinician review).

Gate parameters were fixed BEFORE the first test run (journey R8): MIN_CHOICE_CONFIDENCE 0.6, MIN_SUPPORT_SCORE 2.0
(rubric index 2 = "mostly supported"). Any later change is logged with its reason.
No dose is ever produced: the output is built from the fixed menu text and excerpt citations.
"""

import json
from pathlib import Path

from hf_twin.recommendation import actions as A
from hf_twin.recommendation import jev_client

KNOWLEDGE = Path(__file__).resolve().parent / "knowledge" / "guideline_excerpts.json"
MIN_CHOICE_CONFIDENCE = 0.6
MIN_SUPPORT_SCORE = 2.0
SUPPORT_RUBRIC = [
    "Not supported: the guideline excerpts do not support this action for this patient, or they point to a different action",
    "Weakly supported: the excerpts only loosely relate to this action for this patient",
    "Mostly supported: the excerpts support this action, but some of this patient's facts are missing or borderline",
    "Fully supported: the excerpts clearly support this action given all of this patient's facts",
]

_excerpts = None


def excerpts() -> list[dict]:
    global _excerpts
    if _excerpts is None:
        _excerpts = json.loads(KNOWLEDGE.read_text(encoding="utf-8"))["excerpts"]
    return _excerpts


def _relevant(allowed: list[str]) -> list[dict]:
    tags = set(A.ALWAYS_TAGS)
    for a in allowed:
        tags.update(A.ACTIONS[a]["tags"])
    # dose tables are clinician reference only and never given to the AI
    return [e for e in excerpts() if tags & set(e["supports"]) and "DOSE_REFERENCE_ONLY" not in e["supports"]]


def _citation(e: dict) -> dict:
    return {"id": e["id"], "source": e["source"], "section": e["section"], "page": e["page"],
            "class": e.get("cor"), "evidence_level": e.get("loe")}


def describe_patient(f: A.PatientFacts, status: dict) -> str:
    chance = "unknown" if f.chance_congested is None else f"{round(100 * f.chance_congested)}%"
    est = "" if f.wedge_estimate is None else (
        f"; estimated wedge pressure {f.wedge_estimate:.0f} mmHg"
        + (f", range {f.range80[0]:.0f} to {f.range80[1]:.0f}" if f.range80 else ""))
    perf = {"unknown": "unknown (no measured cardiac index)",
            "low": f"LOW (measured cardiac index {f.cardiac_index:.2f} L/min/m2, cut-off 2.2)" if f.cardiac_index else "LOW",
            "normal": f"normal (measured cardiac index {f.cardiac_index:.2f} L/min/m2, cut-off 2.2)" if f.cardiac_index else "normal"}
    setting = {True: "inpatient (hospital)", False: "outpatient", None: "unknown"}[f.inpatient]
    cong = {"congested": "PROBABLE CONGESTION", "not_congested": "PROBABLE NO CONGESTION",
            "uncertain": "UNCERTAIN (the chance is in the middle zone)"}[status["congestion"]]
    return ("PATIENT FACTS\n"
            f"- Congestion (estimated by the chest-patch model, not measured): {cong}; chance that the wedge pressure is above "
            f"18 mmHg: {chance}{est}\n"
            f"- Perfusion (measured): {perf[status['perfusion']]}\n"
            f"- Systolic blood pressure: {'unknown' if f.sbp is None else f'{f.sbp:.0f} mmHg'}\n"
            f"- Care setting: {setting}\n"
            f"- Current diuretic therapy: {f.current_diuretic.replace('_', ' ')}")


def build_state(f: A.PatientFacts, status: dict, allowed: list[str]) -> tuple[str, list[dict]]:
    ex = _relevant(allowed)
    text = describe_patient(f, status) + "\n\nGUIDELINE EXCERPTS (verbatim; the only evidence you may use)\n" + "\n".join(
        f"[{e['id']}] {e['source']} {e['section']}" + (f" (class {e['cor']}, level {e['loe']})" if e.get("cor") else "")
        + f": {e['text']}" for e in ex)
    return text, ex


def recommend(f: A.PatientFacts, mode: str = "filtered") -> dict:
    """
    mode 'filtered' = production (rules first). mode 'unfiltered' = diagnostic only: all six actions are offered to the AI
    with no rule filtering, used in tests to show what the code rules add.
    """
    allowed, flags, status = A.eligible_actions(f)
    out = {"case_id": f.case_id, "mode": mode, "status": status, "safety_flags": flags, "allowed": allowed,
           "disclaimer": A.DISCLAIMER, "decision": "ABSTAIN", "label": A.ACTIONS["ABSTAIN"]["label"], "reason": None}
    if mode == "unfiltered":
        allowed = list(A.ACTIONS)
    if allowed == ["ABSTAIN"]:
        out["reason"] = "safety rules allow no action for these facts: " + "; ".join(flags or ["no rule matches"])
        out["ai_used"] = False
        return out

    state, ex = build_state(f, status, allowed)
    options = {a: A.ACTIONS[a]["description"] for a in allowed}
    try:
        ch = jev_client.choose(
            state,
            "Using ONLY the patient facts and the guideline excerpts above, which single action is indicated? "
            "If the excerpts do not clearly support any action for this patient, choose ABSTAIN. Never guess.",
            options)
        out.update(jev_choice=ch["choice"], choice_confidence=ch["confidence"], probabilities=ch["probabilities"],
                   ai_used=True, jev_model=ch["model"])
        if ch["choice"] == "ABSTAIN":
            out["reason"] = "the AI judged the evidence insufficient"
            return out
        if ch["choice"] not in allowed:
            out["reason"] = "the AI chose an action that the safety rules do not allow"
            return out
        act = A.ACTIONS[ch["choice"]]
        sc = jev_client.score(
            state,
            f"Chosen action: {act['label']} ({act['description']}) "
            "Using ONLY the guideline excerpts above, how well do they support this action for THIS patient's facts?",
            SUPPORT_RUBRIC)
        out.update(support_score=sc["score"], support_confidence=sc["confidence"])
    except jev_client.JevError as e:
        out.update(ai_used=True, reason=f"recommendation service unavailable ({e}); clinician review")
        return out

    if ch["confidence"] < MIN_CHOICE_CONFIDENCE:
        out["reason"] = f"AI confidence {ch['confidence']:.2f} is below {MIN_CHOICE_CONFIDENCE}"
    elif sc["score"] < MIN_SUPPORT_SCORE:
        out["reason"] = f"guideline support score {sc['score']:.2f} is below {MIN_SUPPORT_SCORE}"
    else:
        out.update(decision=ch["choice"], label=act["label"], reason=None,
                   citations=[_citation(e) for e in ex if set(act["tags"]) & set(e["supports"])])
    return out
