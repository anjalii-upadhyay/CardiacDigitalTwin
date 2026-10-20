"""
Scores the recommendation step on test_cases.json (journey R8).

  production  rules first, then Jev choice + score + gate (what the dashboard uses). Run twice to measure repeatability.
  unfiltered  diagnostic only: no rule filtering, all six actions offered to the AI (shows what the code rules add).

Per case: correct (decision in 'acceptable'), unsafe (decision in 'unsafe'), wrong (anything else that is not ABSTAIN),
abstain (decision ABSTAIN; counts as correct only when ABSTAIN is acceptable). Writes artifacts/recommendation_eval.json.
Run:  python -m hf_twin.recommendation.evaluate_recommendations
"""

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from hf_twin.recommendation import actions as A
from hf_twin.recommendation import recommend as R

HERE = Path(__file__).resolve().parent
OUT = HERE / "artifacts" / "recommendation_eval.json"


def facts_of(case: dict) -> A.PatientFacts:
    d = dict(case["facts"])
    if "range80" in d:
        d["range80"] = tuple(d["range80"])
    return A.PatientFacts(case_id=case["id"], **d)


def judge(case: dict, res: dict) -> str:
    d = res["decision"]
    if d in case["unsafe"]:
        return "unsafe"
    if d in case["acceptable"]:
        return "correct"
    if d == "ABSTAIN":
        return "abstain"
    return "wrong"


def run_mode(cases: list[dict], mode: str) -> list[dict]:
    def one(case):
        res = R.recommend(facts_of(case), mode=mode)
        return {"id": case["id"], "group": case["group"], "mode": mode, "decision": res["decision"],
                "verdict": judge(case, res), "acceptable": case["acceptable"], "ai_used": res.get("ai_used"),
                "jev_choice": res.get("jev_choice"), "choice_confidence": res.get("choice_confidence"),
                "support_score": res.get("support_score"), "reason": res["reason"]}
    with ThreadPoolExecutor(max_workers=4) as pool:
        return list(pool.map(one, cases))


def summarize(rows: list[dict]) -> dict:
    n = len(rows)
    c = {k: sum(r["verdict"] == k for r in rows) for k in ("correct", "unsafe", "wrong", "abstain")}
    return {"n": n, **c, "ai_calls_avoided": sum(r["ai_used"] is False for r in rows)}


def main():
    cases = json.loads((HERE / "test_cases.json").read_text(encoding="utf-8"))["cases"]
    runs = {"production_run1": run_mode(cases, "filtered"),
            "production_run2": run_mode(cases, "filtered"),
            "unfiltered": run_mode(cases, "unfiltered")}
    summary = {k: summarize(v) for k, v in runs.items()}
    same = sum(a["decision"] == b["decision"] for a, b in zip(runs["production_run1"], runs["production_run2"]))
    summary["production_repeatability"] = {"same_decision": same, "of": len(cases)}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"gate": {"min_choice_confidence": R.MIN_CHOICE_CONFIDENCE,
                                        "min_support_score": R.MIN_SUPPORT_SCORE},
                               "summary": summary, "runs": runs}, indent=1), encoding="utf-8")
    for k, v in summary.items():
        print(k, v)
    for k in ("production_run1", "unfiltered"):
        print(f"\n{k}: cases that are not 'correct'")
        for r in runs[k]:
            if r["verdict"] != "correct":
                print(f"  {r['id']:<3} {r['verdict']:<8} decision={r['decision']:<27} ai_choice={r['jev_choice']} "
                      f"conf={r['choice_confidence']} support={r['support_score']} | {r['reason']}")


if __name__ == "__main__":
    main()
