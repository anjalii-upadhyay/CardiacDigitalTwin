"""Read the SCG-RHC download: WFDB headers, 80 s signal slices and per-recording labels."""

import csv
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from hf_twin.ml_training import config


@dataclass
class Channel:
    name: str
    gain: float        # ADC units per physical unit
    baseline: float
    units: str


@dataclass
class Recording:
    rec_id: str                    # e.g. "TRM107-RHC1"
    patient_id: str                # e.g. "TRM107" (used to keep a patient's recordings together)
    window_path: Path
    window_kind: str               # PCW, PA, RA or MID (catheter position the slice was taken around)
    label: dict                    # raw per-recording JSON
    rhc_row: dict                  # baseline row of RHC_values.csv ({} if missing)
    targets: dict = field(default_factory=dict)


# ── Headers ──────────────────────────────────────────────────────────────────
def read_header(rec_id: str) -> list[Channel]:
    """
    Parse a WFDB .hea file (format 32: little-endian int32, interleaved).
    The channel count differs per recording (7-22); the 7 patch channels always come first.
    """
    lines = (config.HEADERS_DIR / f"{rec_id}.hea").read_text(encoding="utf-8").splitlines()
    n_signals = int(lines[0].split()[1])
    channels = []
    for line in lines[1 : 1 + n_signals]:
        parts = line.split()
        gain_txt = parts[2]                       # e.g. "100000.0(0)/mV"
        gain = float(gain_txt.split("(")[0].split("/")[0])
        baseline = float(gain_txt.split("(")[1].split(")")[0]) if "(" in gain_txt else 0.0
        units = gain_txt.split("/")[1] if "/" in gain_txt else ""
        channels.append(Channel(parts[-1], gain if gain else 1.0, baseline, units))
    return channels


# ── Signals ──────────────────────────────────────────────────────────────────
def load_window(path: Path, channels: list[Channel]) -> np.ndarray:
    """Return an (n_samples, n_channels) float array in physical units (mV, mg, deg C...)."""
    raw = np.fromfile(path, dtype="<i4")
    if raw.size % len(channels):
        raise ValueError(f"{path.name}: size does not match {len(channels)} channels")
    raw = raw.reshape(-1, len(channels)).astype(np.float64)
    gains = np.array([c.gain for c in channels])
    baselines = np.array([c.baseline for c in channels])
    return (raw - baselines) / gains


def channel_index(channels: list[Channel], name: str) -> int:
    for i, c in enumerate(channels):
        if c.name == name:
            if name in config.FORBIDDEN_CHANNELS:
                raise ValueError(f"{name} is a hospital reference channel and must not feed the model")
            return i
    raise KeyError(name)


# ── Labels ───────────────────────────────────────────────────────────────────
def _number(value):
    return float(value) if isinstance(value, (int, float)) and not math.isnan(value) else None


def catheter_value(label: dict, key: str):
    meas = {k.strip(): v for k, v in (label.get("maclabMeas") or {}).items()}
    return _number(meas.get(key))


def load_recordings() -> list[Recording]:
    """All recordings that have a downloaded slice, with labels and catheter targets."""
    with open(config.RHC_VALUES_CSV, newline="", encoding="utf-8-sig") as f:
        rhc = {r["Study ID"].replace(".", "-"): r for r in csv.DictReader(f) if r["RHC Phase"] == "Baseline"}
    # one slice per recording: prefer the wedge-position slice, then artery, right atrium, middle
    preference = {"PCW": 0, "PA": 1, "RA": 2, "MID": 3}
    best = {}
    for path in config.WINDOWS_DIR.glob("*.bin"):
        rec_id, kind, _ = path.stem.split("__")
        if kind not in preference:          # after-medicine slices are loaded separately
            continue
        if rec_id not in best or preference[kind] < preference[best[rec_id].stem.split("__")[1]]:
            best[rec_id] = path
    recs = []
    for rec_id in sorted(best):
        path = best[rec_id]
        kind = path.stem.split("__")[1]
        label = json.loads((config.LABELS_DIR / f"{rec_id}.json").read_text(encoding="utf-8"))
        r = Recording(rec_id, rec_id.split("-")[0], path, kind, label, rhc.get(rec_id, {}))
        r.targets = {name: catheter_value(label, key) for name, key in config.TARGETS.items()}
        recs.append(r)
    return recs


def load_all_baseline_slices() -> list[Recording]:
    """Every baseline slice of every recording (wedge, artery, right atrium, middle), several per recording."""
    with open(config.RHC_VALUES_CSV, newline="", encoding="utf-8-sig") as f:
        rhc = {r["Study ID"].replace(".", "-"): r for r in csv.DictReader(f) if r["RHC Phase"] == "Baseline"}
    out = []
    for path in sorted(config.WINDOWS_DIR.glob("*.bin")):
        rec_id, kind, _ = path.stem.split("__")
        if kind not in ("PCW", "PA", "RA", "MID"):
            continue
        label = json.loads((config.LABELS_DIR / f"{rec_id}.json").read_text(encoding="utf-8"))
        r = Recording(rec_id, rec_id.split("-")[0], path, kind, label, rhc.get(rec_id, {}))
        r.targets = {name: catheter_value(label, key) for name, key in config.TARGETS.items()}
        out.append(r)
    return out


VASODILATOR_PHASES = ("S/P Nipride Challenge", "S/P Nitro")


def load_after_medicine() -> list[Recording]:
    """
    Slices recorded after the vasodilator (window kind "VI"), with the catheter values measured then.
    Same patient and recording as the baseline row, but a different pressure.
    """
    def num(v):
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    with open(config.RHC_VALUES_CSV, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    base = {r["Study ID"].replace(".", "-"): r for r in rows if r["RHC Phase"] == "Baseline"}
    after = {r["Study ID"].replace(".", "-"): r for r in rows if r["RHC Phase"] in VASODILATOR_PHASES}
    recs = []
    for path in sorted(config.WINDOWS_DIR.glob("*__VI__*.bin")):
        rec_id = path.stem.split("__")[0]
        row = after.get(rec_id)
        if row is None:
            continue
        label = json.loads((config.LABELS_DIR / f"{rec_id}.json").read_text(encoding="utf-8"))
        r = Recording(rec_id, rec_id.split("-")[0], path, "VI", label, base.get(rec_id, {}))
        r.targets = {name: num(row.get(key)) for name, key in config.TARGETS.items()}
        recs.append(r)
    return recs


def exclusion_reasons(rec: Recording) -> list[str]:
    """Why a recording is left out of the clean set (empty list = kept)."""
    reasons = []
    if not rec.label.get("fine_alignment", False):
        reasons.append("coarse time alignment")
    if rec.rhc_row.get("Classification") in config.EXCLUDED_CLASSIFICATIONS:
        reasons.append(f"classification {rec.rhc_row.get('Classification')}")
    notes = (rec.rhc_row.get("Notes") or "").lower()
    if any(w in notes for w in config.DRIP_WORDS):
        reasons.append("heart-support drip at baseline")
    if rec.targets.get("wedge_mmHg") is None:
        reasons.append("no wedge value")
    return reasons
