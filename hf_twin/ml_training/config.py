"""Paths, channel lists, targets and exclusion rules for the congestion model."""

import os
from pathlib import Path

# ── Data locations (raw data stays outside the repo) ─────────────────────────
DATA_ROOT = Path(os.environ.get("SCG_RHC_ROOT", "D:/CardiacDigitalTwin_data/scg-rhc"))
WINDOWS_DIR = DATA_ROOT / "windows"
HEADERS_DIR = DATA_ROOT / "headers"
LABELS_DIR = DATA_ROOT / "labels"
META_DIR = DATA_ROOT / "meta"
RHC_VALUES_CSV = META_DIR / "RHC_values.csv"

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"

# ── Signal format ─────────────────────────────────────────────────────────────
FS = 500                      # samples per second (all recordings)
# The channel count differs per recording (7-22) and is read from each header.

# Only the wearable patch may feed the model. The rest are hospital reference signals.
PATCH_ECG = "patch_ECG"
PATCH_ACC = ("patch_ACC_lat", "patch_ACC_hf", "patch_ACC_dv")   # side-to-side, head-to-foot, front-to-back
PATCH_TEMP = "patch_Temp"
FORBIDDEN_CHANNELS = ("RHC_pressure", "PLETH", "ECG_lead_I", "ECG_lead_II", "ECG_lead_III",
                      "aVR", "aVL", "aVF", "ECG_lead_V1")

# ── Targets: model output name -> catheter measurement key in the label files ─
TARGETS = {
    "wedge_mmHg": "PCWM",              # back-pressure into the lungs (left side)
    "right_atrial_mmHg": "RAM",        # back-pressure toward the body (right side)
    "pa_mean_mmHg": "PAM",             # lung-artery pressure
    "stroke_volume_mL": "SVmL/beat",   # blood pumped per beat
}

# ── Clean-set exclusions (approved 2026-10-19) ───────────────────────────────
EXCLUDED_CLASSIFICATIONS = ("OHT", "VAD")                 # heart transplant, assist device
DRIP_WORDS = ("milrinone", "dobutamine", "dopamine")       # heart-support drips noted at baseline

RANDOM_SEED = 42
