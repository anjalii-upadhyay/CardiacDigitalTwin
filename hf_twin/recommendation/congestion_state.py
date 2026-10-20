"""
Turn the model's wedge-pressure estimate and the patient record into the twin's state.

Congestion (from the model): the estimate is only called "congested" or "not congested" when its whole error range
lies on one side of the clinical cut-off; otherwise it is "uncertain" (the recommendation step then abstains).
The error range is NOT a number we pick: it is taken from the model's real out-of-fold errors (patients the model
never saw). Which model and which coverage (80% / 90%) are still an OPEN decision (journey P18).

Perfusion (from measured values only, never from the model; journey D28): cardiac index = measured cardiac output /
body surface area. Missing measurements -> "unknown".

Cut-offs (journey D13, clinically accepted, cited):
  congestion at rest   = wedge pressure (PCWP) > 18 mmHg        CSI 2018 position statement, Fig. 7, p. S20
  low perfusion at rest = cardiac index < 2.2 L/min/m2          same figure
Body surface area: Mosteller formula, sqrt(height_cm * weight_kg / 3600).
"""

import csv
import math
from dataclasses import dataclass

import numpy as np

WEDGE_CONGESTION_MMHG = 18.0
CARDIAC_INDEX_LOW = 2.2
CUTOFF_SOURCE = "CSI position statement on management of heart failure in India, Indian Heart J 2018;70:S1-S72, Fig. 7 (p. S20)"


@dataclass
class ErrorBand:
    lower: float        # add to the estimate to get the low end of the range (mmHg, usually negative)
    upper: float        # add to the estimate to get the high end of the range (mmHg)
    coverage: float     # share of real errors the range is meant to contain (e.g. 0.8)
    n: int              # number of out-of-fold errors it was built from
    source: str         # which model / file the errors came from


def band_from_errors(measured, predicted, coverage: float, source: str) -> ErrorBand:
    """Error range from real out-of-fold errors (measured minus predicted)."""
    err = np.asarray(measured, float) - np.asarray(predicted, float)
    q = (1.0 - coverage) / 2.0
    return ErrorBand(float(np.quantile(err, q)), float(np.quantile(err, 1 - q)), coverage, int(len(err)), source)


def load_band(oof_csv: str, model_column: str, coverage: float) -> ErrorBand:
    with open(oof_csv, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    meas = [float(r["measured"]) for r in rows]
    pred = [float(r[model_column]) for r in rows]
    return band_from_errors(meas, pred, coverage, f"{oof_csv}:{model_column}")


def congestion_state(wedge_estimate: float, band: ErrorBand) -> dict:
    lo, hi = wedge_estimate + band.lower, wedge_estimate + band.upper
    if lo > WEDGE_CONGESTION_MMHG:
        state = "congested"
    elif hi <= WEDGE_CONGESTION_MMHG:
        state = "not_congested"
    else:
        state = "uncertain"
    return {"state": state, "estimate_mmHg": round(wedge_estimate, 1), "range_mmHg": [round(lo, 1), round(hi, 1)],
            "range_coverage": band.coverage, "cutoff_mmHg": WEDGE_CONGESTION_MMHG, "cutoff_source": CUTOFF_SOURCE}


def body_surface_area(height_cm, weight_kg):
    if not (isinstance(height_cm, (int, float)) and isinstance(weight_kg, (int, float))) or height_cm <= 0 or weight_kg <= 0:
        return None
    return math.sqrt(height_cm * weight_kg / 3600.0)


def perfusion_state(measured_cardiac_output_l_min, height_cm, weight_kg, measured_cardiac_index=None) -> dict:
    """
    Measured values only. Returns low / normal / unknown with the cardiac index used and where it came from.
    A directly measured cardiac index (thermodilution) is preferred; otherwise measured output / body surface area.
    """
    def ok(v):
        return isinstance(v, (int, float)) and math.isfinite(v) and v > 0

    if ok(measured_cardiac_index):
        ci, src = float(measured_cardiac_index), "measured cardiac index (thermodilution)"
    else:
        bsa = body_surface_area(height_cm, weight_kg)
        co = measured_cardiac_output_l_min
        if bsa is None or not ok(co):
            return {"state": "unknown", "cardiac_index": None,
                    "reason": "measured cardiac index, or cardiac output with height and weight, is missing"}
        ci, src = co / bsa, "measured cardiac output / body surface area (Mosteller)"
    return {"state": "low" if ci < CARDIAC_INDEX_LOW else "normal", "cardiac_index": round(ci, 2),
            "cutoff": CARDIAC_INDEX_LOW, "cutoff_source": CUTOFF_SOURCE, "source": src}
