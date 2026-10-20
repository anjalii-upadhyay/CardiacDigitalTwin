"""
Precomputes the recommendation for every recording and writes public/data/recommendations.json (journey R8).
The dashboard is a static app and cannot hold the Jev key, so this runs offline: key never leaves this machine.

Contract with the dashboard (src/congestion/SimulatorTab.jsx RecommendationCard), top-level keys = recording ids:
  status          'recommend' | 'abstain' | 'review'      (review = the recommendation service failed)
  action_text     fixed menu label (never a dose)
  rationale       plain-language reason built in code from the patient's facts and the cited recommendation class
  guideline_refs  [{source, page, section, class, level, ids}]
  safety_flags    plain-language safety checks that fired
  checks          AI choice confidence, guideline-support score, model version (for transparency)
  scenarios       extra labelled SIMULATED inputs (dose of current diuretic is not in the dataset)
'_meta' holds gate settings, test results, cited excerpt text and limitations.

Inputs come from public/data/patients.json (made by hf_twin.dashboard.export_data): model chance/estimate/range, measured
cardiac index, systolic blood pressure and the outpatient flag from the record. Current diuretic is NOT in the dataset, so
the real entry uses 'unknown'.
Run:  python -m hf_twin.recommendation.export_recommendations
"""

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from hf_twin.recommendation import actions as A
from hf_twin.recommendation import recommend as R

REPO = Path(__file__).resolve().parents[2]
PATIENTS = REPO / "public" / "data" / "patients.json"
OUT = REPO / "public" / "data" / "recommendations.json"
EVAL = Path(__file__).resolve().parent / "artifacts" / "recommendation_eval.json"
SOURCES = {"AHA2022": "AHA/ACC/HFSA 2022 heart failure guideline",
           "CSI2018": "CSI 2018 heart failure position statement (India)"}
WHY = {
    "CONTINUE_GDMT": "No congestion and adequate perfusion, so the framework supports continuing the current guideline-directed therapy.",
    "DIURETIC_REVIEW": "In patients with fluid retention, diuretics are recommended to relieve congestion (class 1, level B-NR).",
    "DIURETIC_RESISTANCE_REVIEW": "Congestion despite a high-dose loop diuretic: the guideline lists options to intensify the diuretic regimen.",
    "VASODILATOR_ADJUVANT": "In hospital, without low blood pressure, an intravenous vasodilator may be considered as an add-on (class 2b).",
}
LIMITS = [
    "The congestion input is an ESTIMATE from the chest patch, not a measurement; only the middle of its range is reliable (journey R7).",
    "Cardiac index and blood pressure are measured values from the record, never estimated.",
    "The dataset has no medication list: the current diuretic is 'unknown' unless a simulated input is shown and labelled.",
    "The tool never suggests a dose. Dose tables are kept out of the AI input.",
    "The low-blood-flow / low-blood-pressure review is decided by code alone from measured values and cited cut-offs; "
    "that it always leads to a clinician review is a safety choice of the team, not a guideline sentence.",
    "The 31 test cases were written from the guidelines by the engineering team and have not been reviewed by a clinician.",
    "A decision-support gate that abstains is working as designed; most of this cohort has low measured perfusion or a middle-zone congestion estimate.",
]


def facts_of(p: dict, diuretic: str = "unknown") -> A.PatientFacts:
    c = p["congestion"]
    return A.PatientFacts(chance_congested=c["chance"], wedge_estimate=c["estimate_mmHg"], range80=tuple(c["range_mmHg"]),
                          cardiac_index=p["perfusion"].get("cardiac_index"), sbp=p["record"]["sbp"],
                          inpatient=not p["record"]["outpatient"], current_diuretic=diuretic, case_id=p["id"])


def facts_sentence(f: A.PatientFacts) -> str:
    if f.chance_congested is None:
        s = "No chest-patch estimate is available."
    else:
        s = f"Chest-patch estimate: {round(100 * f.chance_congested)}% chance of congestion"
        s += (f" (wedge pressure about {f.wedge_estimate:.0f} mmHg; congestion cut-off 18 mmHg)." if f.wedge_estimate is not None
              else " (congestion cut-off: wedge pressure above 18 mmHg).")
    s += (f" Measured cardiac index {f.cardiac_index:.2f} L/min/m² (low below 2.2)." if f.cardiac_index is not None
          else " Perfusion not measured.")
    return s + ("" if f.sbp is None else f" Systolic blood pressure {f.sbp:.0f} mmHg.")


def refs(res: dict) -> list[dict]:
    out, seen = [], {}
    for c in res.get("citations", []):
        key = (c["source"], c["page"])
        if key not in seen:
            seen[key] = {"source": SOURCES.get(c["source"], c["source"]), "page": c["page"], "section": c["section"],
                         "class": c["class"], "level": c["evidence_level"], "ids": []}
            out.append(seen[key])
        seen[key]["ids"].append(c["id"])
    return out


def shape(f: A.PatientFacts, res: dict) -> dict:
    d = res["decision"]
    ai_failed = bool(res["reason"]) and "service unavailable" in res["reason"]
    status = "review" if ai_failed else ("recommend" if d != "ABSTAIN" else "abstain")
    if status == "recommend":
        why = res.get("why") or WHY[d]          # the low-flow / low-pressure review carries its own wording (D37)
    elif status == "review":
        why = "The recommendation service could not be reached, so no suggestion is made."
    elif not res.get("ai_used"):
        why = "The safety rules allow no suggestion for these facts: " + "; ".join(res["safety_flags"] or ["no rule matches"]) + "."
    else:
        why = "The guideline check was not confident enough to suggest an action, so the decision is left to the clinician."
    return {"status": status,
            "action_text": res["label"] if status == "recommend" else None,
            "action_id": d if status == "recommend" else None,
            "rationale": f"{facts_sentence(f)} {why}",
            "guideline_refs": refs(res),
            "safety_flags": res["safety_flags"],
            "checks": {"ai_used": res.get("ai_used"), "choice_confidence": res.get("choice_confidence"),
                       "support_score": res.get("support_score"), "model": res.get("jev_model"),
                       "abstain_reason": res["reason"]},
            "rule_decided": bool(res.get("rule_decided")),
            "disclaimer": res["disclaimer"]}


def eval_block() -> dict:
    if not EVAL.exists():
        return {}
    e = json.loads(EVAL.read_text(encoding="utf-8"))
    cases = {c["id"]: c for c in json.loads((Path(__file__).resolve().parent / "test_cases.json").read_text(encoding="utf-8"))["cases"]}
    rows = [{"id": r["id"], "group": r["group"], "facts": cases[r["id"]]["facts"], "expected": r["acceptable"],
             "decision": r["decision"], "verdict": r["verdict"]} for r in e["runs"]["production_run1"]]
    return {"summary": e["summary"], "label": "SYNTHETIC test inputs, not patients", "cases": rows}


def main():
    data = json.loads(PATIENTS.read_text(encoding="utf-8"))["patients"]

    def one(p):
        f = facts_of(p)
        entry = shape(f, R.recommend(f))
        # only congestion with normal perfusion makes a high-dose loop diuretic matter (it unlocks the resistance review)
        if A.eligible_actions(f)[2]["congestion"] == "congested" and A.eligible_actions(f)[2]["perfusion"] == "normal":
            f2 = facts_of(p, "loop_high_dose")
            entry["scenarios"] = {"loop_high_dose": {"label": "SIMULATED input: clinician records a high-dose loop diuretic",
                                                     **shape(f2, R.recommend(f2))}}
        return p["id"], entry

    with ThreadPoolExecutor(max_workers=4) as pool:
        out = dict(pool.map(one, data))

    cited = {}
    exc = {e["id"]: e for e in R.excerpts()}
    for entry in list(out.values()) + [s for e in out.values() for s in e.get("scenarios", {}).values()]:
        for r in entry["guideline_refs"]:
            for i in r["ids"]:
                cited[i] = {"source": SOURCES.get(exc[i]["source"], exc[i]["source"]), "section": exc[i]["section"],
                            "page": exc[i]["page"], "class": exc[i].get("cor"), "level": exc[i].get("loe"), "text": exc[i]["text"]}
    jev_models = sorted({e["checks"]["model"] for e in out.values() if e["checks"]["model"]})
    out["_meta"] = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "jev_models": jev_models,
                    "gate": {"min_choice_confidence": R.MIN_CHOICE_CONFIDENCE, "min_support_score": R.MIN_SUPPORT_SCORE},
                    "rules": {"congested_chance": A.CONGESTED_CHANCE, "not_congested_chance": A.NOT_CONGESTED_CHANCE,
                              "sbp_low_mmHg": A.SBP_LOW_MMHG, "cardiac_index_low": 2.2, "wedge_congestion_mmHg": 18},
                    "actions": {k: v["label"] for k, v in A.ACTIONS.items()}, "tests": eval_block(),
                    "excerpts": cited, "limitations": LIMITS, "disclaimer": A.DISCLAIMER}
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")

    rows = [v for k, v in out.items() if k != "_meta"]
    by_status = {s: sum(r["status"] == s for r in rows) for s in ("recommend", "abstain", "review")}
    by_action = {}
    for r in rows:
        by_action[r["action_id"] or "ABSTAIN"] = by_action.get(r["action_id"] or "ABSTAIN", 0) + 1
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB): {len(rows)} recordings, status {by_status}, actions {by_action}, "
          f"with safety flags {sum(bool(r['safety_flags']) for r in rows)}, jev {jev_models}")


if __name__ == "__main__":
    main()
