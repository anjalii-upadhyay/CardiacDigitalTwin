"""
Turn the model's wedge-pressure estimate into (a) a chance of congestion and (b) an error range, honestly.

Both are learned only from OUT-OF-FOLD estimates, i.e. estimates made by models that never saw that patient, and the
number shown for any patient is built without that patient's own result (leave one patient out). So when a patient
shows "70%", the 70% was learned from other patients only.

Congestion = catheter wedge pressure above 18 mmHg (CSI 2018 position statement, Fig. 7).
Chance of congestion = Platt scaling: a one-variable logistic regression of (wedge > 18) on the model's estimate.
"""

import numpy as np
from sklearn.linear_model import LogisticRegression

CUTOFF_MMHG = 18.0
RELIABILITY_BINS = ((0.0, 0.25), (0.25, 0.5), (0.5, 0.75), (0.75, 1.0001))


def fit_platt(estimates, measured):
    """Fit chance-of-congestion from the estimate. Returns (slope, intercept) of the logistic curve."""
    x = np.asarray(estimates, float).reshape(-1, 1)
    y = (np.asarray(measured, float) > CUTOFF_MMHG).astype(int)
    lr = LogisticRegression(C=1e6, solver="lbfgs", max_iter=1000).fit(x, y)   # near-unregularised
    return float(lr.coef_[0, 0]), float(lr.intercept_[0])


def platt_probability(estimate, slope, intercept):
    return float(1.0 / (1.0 + np.exp(-(slope * float(estimate) + intercept))))


def error_band(estimates, measured, coverage):
    """Add these two numbers to an estimate to get the range that covers `coverage` of real errors."""
    err = np.asarray(measured, float) - np.asarray(estimates, float)
    q = (1.0 - coverage) / 2.0
    return float(np.quantile(err, q)), float(np.quantile(err, 1.0 - q))


def leave_one_patient_out(estimates, measured, patients, coverages=(0.8, 0.9)):
    """
    For every recording, the chance of congestion and error ranges built WITHOUT that recording's patient.
    Returns a list of dicts aligned with the inputs.
    """
    est, meas, pats = np.asarray(estimates, float), np.asarray(measured, float), np.asarray(patients)
    out = []
    for i in range(len(est)):
        keep = pats != pats[i]
        slope, intercept = fit_platt(est[keep], meas[keep])
        row = {"p_congested": platt_probability(est[i], slope, intercept)}
        for c in coverages:
            lo, hi = error_band(est[keep], meas[keep], c)
            row[f"range{int(round(c * 100))}"] = (float(est[i] + lo), float(est[i] + hi))
        out.append(row)
    return out


def reliability_table(probabilities, measured):
    """For each probability band: how many patients, the average predicted chance, and the share really congested."""
    p = np.asarray(probabilities, float)
    y = np.asarray(measured, float) > CUTOFF_MMHG
    rows = []
    for lo, hi in RELIABILITY_BINS:
        m = (p >= lo) & (p < hi)
        if m.any():
            rows.append({"band": f"{int(lo * 100)}-{min(int(hi * 100), 100)}%", "n": int(m.sum()),
                         "mean_predicted": float(p[m].mean()), "share_really_congested": float(y[m].mean())})
    return rows


def brier(probabilities, measured):
    p = np.asarray(probabilities, float)
    y = (np.asarray(measured, float) > CUTOFF_MMHG).astype(float)
    return float(np.mean((p - y) ** 2))
