"""
Deterministic checks of the recommendation rules. No AI call and no API key needed (the AI client is replaced by one
that fails the check if it is ever called on a rule-decided case).
Run:  python -m hf_twin.recommendation.check_recommendation_rules
"""

import json
import re
from pathlib import Path

from hf_twin.recommendation import actions as A
from hf_twin.recommendation import jev_client
from hf_twin.recommendation import recommend as R
from hf_twin.recommendation.evaluate_recommendations import facts_of

HERE = Path(__file__).resolve().parent
failures = []


def check(ok, what):
    print(("PASS  " if ok else "FAIL  ") + what)
    if not ok:
        failures.append(what)


def F(**kw):
    return A.PatientFacts(case_id="check", **kw)


cases = json.loads((HERE / "test_cases.json").read_text(encoding="utf-8"))["cases"]

# 1. rules vs the guideline-derived test cases
leaks, unreachable = [], []
for c in cases:
    allowed = A.eligible_actions(facts_of(c))[0]
    if set(allowed) & set(c["unsafe"]):
        leaks.append(c["id"])
    if not set(allowed) & set(c["acceptable"]):
        unreachable.append(c["id"])
check(not leaks, f"no forbidden action is ever allowed ({len(cases)} cases)" + (f": {leaks}" if leaks else ""))
check(not unreachable, "an acceptable action is always reachable" + (f": {unreachable}" if unreachable else ""))

# 2. cut-offs sit exactly where the sources put them
check(A.perfusion_status(F(cardiac_index=2.2)) == "normal", "cardiac index 2.2 is normal (low is below 2.2)")
check(A.perfusion_status(F(cardiac_index=2.19)) == "low", "cardiac index 2.19 is low")
check(A.review_kind(F(sbp=90, cardiac_index=2.5)) is None, "SBP 90 is not low")
check(A.review_kind(F(sbp=89, cardiac_index=2.5)) == "pressure", "SBP 89 is low")
check(A.congestion_status(F(chance_congested=0.75)) == "congested", "chance 75% counts as congested")
check(A.congestion_status(F(chance_congested=0.25)) == "not_congested", "chance 25% counts as not congested")
check(A.congestion_status(F(chance_congested=0.5)) == "uncertain", "chance 50% is uncertain")
check(A.review_kind(F(sbp=None, cardiac_index=2.5)) is None, "missing blood pressure is not treated as low")

# 3. the review is decided by code alone, with the right wording and citations
real_call = jev_client.call


def forbidden(*a, **k):
    raise AssertionError("AI was called on a rule-decided case")


jev_client.call = forbidden
try:
    expect = {"both": F(chance_congested=0.9, cardiac_index=1.7, sbp=80, inpatient=True),
              "flow": F(chance_congested=0.9, cardiac_index=1.7, sbp=120, inpatient=True),
              "pressure": F(chance_congested=0.1, cardiac_index=2.6, sbp=85, inpatient=False)}
    by_id = {e["id"] for e in R.excerpts()}
    for kind, f in expect.items():
        res = R.recommend(f)
        check(res["decision"] == A.REVIEW_ACTION and res["ai_used"] is False and res.get("rule_decided"),
              f"'{kind}': review decided by the rule, no AI call")
        check(all(c["id"] in by_id for c in res["citations"]) and len(res["citations"]) >= 2,
              f"'{kind}': citations exist in the knowledge base")
        check(("urgent" in res["label"].lower()) == (kind == "both"), f"'{kind}': label says urgent only when both are low")
        check(res["label"] == A.REVIEW[kind]["label"], f"'{kind}': label is the fixed text")
    # abstain-only cases never need the AI either
    for name, f in {"uncertain congestion": F(chance_congested=0.5, cardiac_index=2.5, sbp=120, inpatient=False),
                    "perfusion unknown": F(chance_congested=0.9, sbp=120, inpatient=True)}.items():
        res = R.recommend(f)
        check(res["decision"] == "ABSTAIN" and res["ai_used"] is False, f"'{name}': abstain without the AI")
finally:
    jev_client.call = real_call

# 4. no dose or drug-name text anywhere in the fixed wording
fixed = json.dumps([A.REVIEW, {k: [v["label"], v["description"]] for k, v in A.ACTIONS.items()}]).lower()
check(not re.search(r"\bmg\b|furosemide|bumetanide|torsemide|metolazone|nitroglycerin|nitroprusside", fixed.replace("nitroglycerin or nitroprusside", "")),
      "no dose or drug name in the fixed labels and explanations")

print("\n" + ("ALL CHECKS PASSED" if not failures else f"{len(failures)} CHECK(S) FAILED"))
raise SystemExit(1 if failures else 0)
