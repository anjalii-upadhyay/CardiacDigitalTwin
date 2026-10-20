"""
Add each recording's chance curve to the existing public/data/patients.json, without re-running export_data.py
(which needs the raw SCG-RHC download). Uses the same calibration.chance_curves() that export_data.py now writes, so
a later full re-export produces the same values.

Refuses to write unless every curve reproduces the chance the dashboard already shows for that recording.

Run from the repo root:
    python_backend/venv/bin/python -m hf_twin.dashboard.add_chance_curve
"""

import json
from pathlib import Path

from hf_twin.ml_training import calibration, config

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "public" / "data" / "patients.json"
FINAL = config.ARTIFACTS_DIR / "final" / "patient_estimates.json"
OOF = config.ARTIFACTS_DIR / "experiments_oof_wedge_mmHg.csv"


def main():
    final = json.loads(FINAL.read_text(encoding="utf-8"))
    data = json.loads(OUT.read_text(encoding="utf-8"))
    curves = calibration.chance_curves(final["patients"], OOF)

    for p in data["patients"]:
        c, curve = p["congestion"], curves[p["id"]]
        assert abs(curve["estimate_unrounded"] - c["estimate_mmHg"]) <= 0.05, f"{p['id']}: estimates disagree"
        again = calibration.platt_probability(curve["estimate_unrounded"], curve["slope"], curve["intercept"])
        lean = "congested" if again >= calibration.LEAN_THRESHOLD else "not_congested"
        assert abs(again - c["chance"]) < 0.0006, f"{p['id']}: curve gives {again:.4f}, dashboard shows {c['chance']}"
        assert lean == c["lean"], f"{p['id']}: curve lean {lean} != dashboard lean {c['lean']}"
        c["curve"] = curve
    data["meta"]["chance"]["lean_threshold"] = calibration.LEAN_THRESHOLD

    OUT.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    print(f"added chance curves to {len(data['patients'])} recordings in {OUT}; all reproduce the shown chance and lean")


if __name__ == "__main__":
    main()
