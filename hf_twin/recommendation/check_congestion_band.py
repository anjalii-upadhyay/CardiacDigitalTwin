"""
How the congestion band would behave on the 63 clean recordings (for decision P18; no verdict yet).

For honesty the range used for each patient is built WITHOUT that patient's own error (leave one patient out),
then the patient is classified congested / not congested / uncertain, and compared with the real catheter wedge
(> 18 mmHg = congested). Reports, for 80% and 90% coverage and each candidate model column:
how many land in each zone, and how often a decided call (congested / not) matches the catheter.

Run from the repo root:
    python_backend/venv/Scripts/python.exe -m hf_twin.recommendation.check_congestion_band [oof_csv] [column ...]
"""

import csv
import sys

import numpy as np

from hf_twin.ml_training import config
from hf_twin.recommendation import congestion_state as cs

DEFAULT_CSV = str(config.ARTIFACTS_DIR / "experiments_oof_wedge_mmHg.csv")
DEFAULT_COLUMNS = ("V0_current",)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    cols = sys.argv[2:] or list(DEFAULT_COLUMNS)
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    meas = np.array([float(r["measured"]) for r in rows])
    pats = np.array([r["rec_id"].split("-")[0] for r in rows])
    truth = meas > cs.WEDGE_CONGESTION_MMHG
    print(f"{len(rows)} recordings | catheter-congested (wedge > 18): {int(truth.sum())} | not: {int((~truth).sum())}")
    for col in cols:
        pred = np.array([float(r[col]) for r in rows])
        for cov in (0.8, 0.9):
            states = []
            for i in range(len(rows)):
                keep = pats != pats[i]
                band = cs.band_from_errors(meas[keep], pred[keep], cov, col)
                states.append(cs.congestion_state(pred[i], band)["state"])
            states = np.array(states)
            dec = states != "uncertain"
            called = states == "congested"
            right = (called == truth) & dec
            full = cs.band_from_errors(meas, pred, cov, col)
            print(f"  {col} | {int(cov*100)}% range = estimate {full.lower:+.1f} to {full.upper:+.1f} mmHg | "
                  f"congested {int((states=='congested').sum())}, not congested {int((states=='not_congested').sum())}, "
                  f"uncertain {int((~dec).sum())} | decided calls correct: {int(right.sum())}/{int(dec.sum())}"
                  + (f" ({100*right.sum()/dec.sum():.0f}%)" if dec.sum() else ""))


if __name__ == "__main__":
    main()
