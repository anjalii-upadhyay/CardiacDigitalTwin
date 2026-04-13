# websocket_server.py
# Cardiac Digital Twin — Real-time physiological parameter computation
# Streams ECG + ABP with derived haemodynamic metrics over WebSocket

import asyncio
import json
import random
import numpy as np
import websockets
from mat73 import loadmat

# ─────────────────────────────────────────────────────────────────────────────
# Dataset loading
# ─────────────────────────────────────────────────────────────────────────────
file_path = "../dataset/p000003.mat"
data      = loadmat(file_path)
subj      = data["Subj_Wins"]

sbp_all = np.array(subj["SegSBP"]).flatten()   # systolic BP per window  (mmHg)
dbp_all = np.array(subj["SegDBP"]).flatten()   # diastolic BP per window (mmHg)

n_windows = len(sbp_all)
print(f"Total windows: {n_windows}  |  SBP range: {sbp_all.min():.1f}–{sbp_all.max():.1f}")

# ─────────────────────────────────────────────────────────────────────────────
# Physical / physiological constants
# ─────────────────────────────────────────────────────────────────────────────
SAMPLING_RATE      = 125          # Hz
DELAY              = 1 / SAMPLING_RATE

ARTERIAL_COMPLIANCE = 1.5         # mL/mmHg  — aortic compliance estimate
VENTRICLE_RADIUS    = 3.0         # cm       — mean LV end-diastolic radius
WALL_THICKNESS      = 1.0         # cm       — mean LV wall thickness
RESISTANCE          = 1.0         # mmHg·s/mL — peripheral vascular resistance
BLOOD_DENSITY       = 1060        # kg/m³
AORTA_DIAMETER      = 0.025       # m  (~2.5 cm)
BLOOD_VISCOSITY     = 0.004       # Pa·s


def clamp(value, lo, hi):
    return max(lo, min(hi, value))


# ─────────────────────────────────────────────────────────────────────────────
# Physiological calculations
# ─────────────────────────────────────────────────────────────────────────────

def calc_rr_interval(bpm: float) -> float:
    """RR interval — time between consecutive R-peaks (seconds)."""
    return 60.0 / bpm if bpm > 0 else 1.0


def calc_cardiac_phase(current_time: float, last_r_peak_time: float, rr: float) -> float:
    """
    Normalised position within the cardiac cycle.
    0 = R-peak (systole onset), 1 = next R-peak.
    """
    if rr <= 0:
        return 0.0
    phase = (current_time - last_r_peak_time) / rr
    return clamp(phase, 0.0, 1.0)


def calc_map(sbp: float, dbp: float) -> float:
    """
    Mean Arterial Pressure — time-averaged perfusion pressure.
    Approximated as DBP + 1/3 of pulse pressure.
    """
    return dbp + (sbp - dbp) / 3.0


def calc_pulse_pressure(sbp: float, dbp: float) -> float:
    """Pulse Pressure — difference between systolic and diastolic pressure."""
    return sbp - dbp


def calc_stroke_volume(pulse_pressure: float) -> float:
    """
    Stroke Volume — volume ejected per beat.
    Windkessel-derived: SV ≈ PP × arterial compliance.
    """
    sv = pulse_pressure * ARTERIAL_COMPLIANCE
    return clamp(sv, 20.0, 200.0)   # physiological range mL


def calc_cardiac_output(sv: float, bpm: float) -> float:
    """
    Cardiac Output — volume pumped per minute (L/min).
    CO = SV × HR / 1000  (convert mL → L)
    """
    co = (sv * bpm) / 1000.0
    return clamp(co, 1.0, 20.0)


def calc_ptt(sbp: float) -> float:
    """
    Pulse Transit Time — delay between ECG R-peak and peripheral pulse arrival (ms).
    Estimated from SBP when a dedicated PPG channel is unavailable:
      PTT ≈ 250 − 0.5 × (SBP − 120)
    Higher blood pressure → stiffer arteries → faster pulse → shorter PTT.
    """
    ptt = 250.0 - 0.5 * (sbp - 120.0)
    return clamp(ptt, 100.0, 300.0)


def calc_wall_stress(abp: float) -> float:
    """
    Ventricular Wall Stress — Laplace's Law for a thick-walled sphere.
    σ = (P × r) / (2 × h)
    P = transmural pressure (ABP used as surrogate, mmHg)
    r = ventricular radius (cm), h = wall thickness (cm)
    Returns stress in mmHg-equivalent units.
    """
    if WALL_THICKNESS <= 0:
        return 0.0
    return (abp * VENTRICLE_RADIUS) / (2.0 * WALL_THICKNESS)


def calc_blood_flow(abp: float, prev_abp: float, dt: float) -> float:
    """
    Blood Flow — simplified 2-element Windkessel model.
    Q = P/R + C × dP/dt
    R = peripheral resistance, C = arterial compliance.
    """
    dpdt = (abp - prev_abp) / dt if dt > 0 else 0.0
    flow = (abp / RESISTANCE) + (ARTERIAL_COMPLIANCE * dpdt)
    return clamp(flow, 0.0, 500.0)   # mL/s


def calc_blood_velocity(cardiac_output_lpm: float) -> float:
    """
    Mean aortic blood velocity (m/s).
    Simplified: velocity ≈ CO / 5  (empirical scaling for aortic root).
    """
    return clamp(cardiac_output_lpm / 5.0, 0.0, 5.0)


def calc_reynolds(velocity: float) -> float:
    """
    Reynolds Number — dimensionless ratio of inertial to viscous forces.
    Re = (ρ × v × D) / μ
    Re > 4000 → turbulent flow risk.
    """
    if BLOOD_VISCOSITY <= 0:
        return 0.0
    re = (BLOOD_DENSITY * velocity * AORTA_DIAMETER) / BLOOD_VISCOSITY
    return round(re, 1)


def calc_risk_level(sbp: float, wall_stress: float, reynolds: float) -> str:
    """
    Rule-based cardiovascular risk classification.
    High   : SBP > 160  OR  wall stress > 250  OR  Re > 5000
    Moderate: SBP > 140  OR  wall stress > 180  OR  Re > 3500
    Low    : otherwise
    """
    if sbp > 160 or wall_stress > 250 or reynolds > 5000:
        return "High"
    if sbp > 140 or wall_stress > 180 or reynolds > 3500:
        return "Moderate"
    return "Low"


# ─────────────────────────────────────────────────────────────────────────────
# WebSocket handler
# ─────────────────────────────────────────────────────────────────────────────

async def stream_data(websocket):
    print("Client connected")

    prev_abp        = 100.0
    last_r_peak_t   = 0.0

    while True:
        for win_idx in range(n_windows):
            ecg    = np.array(subj["ECG_Record_F"][win_idx]).flatten()
            t_vals = np.array(subj["T"][win_idx]).flatten()
            rpeaks = np.array(subj["ECG_RPeaks"][win_idx]).flatten()
            abp_w  = np.array(subj["ABP_Raw"][win_idx]).flatten()

            sbp_base = float(sbp_all[win_idx])
            dbp_base = float(dbp_all[win_idx])

            rpeak_indices = set(int(x) for x in rpeaks if not np.isnan(x))

            # BPM from R-peak density in this window
            if len(rpeaks) >= 2:
                duration = float(t_vals[-1] - t_vals[0])
                bpm = int(round((len(rpeaks) / duration) * 60)) if duration > 0 else 72
            else:
                bpm = 72

            n_samples = min(len(ecg), len(abp_w), len(t_vals))

            for i in range(n_samples):
                t   = float(t_vals[i])
                dt  = DELAY

                # ── Raw signals ──────────────────────────────────────────────
                ecg_val = round(float(ecg[i]), 4)
                abp_val = round(float(abp_w[i]), 2)
                is_peak = i in rpeak_indices

                # ── Per-sample SBP/DBP with physiological noise ──────────────
                sbp = round(sbp_base + random.uniform(-3, 3), 1)
                dbp = round(dbp_base + random.uniform(-2, 2), 1)

                # Track last R-peak time for cardiac phase
                if is_peak:
                    last_r_peak_t = t

                # ── Derived haemodynamic parameters ─────────────────────────
                rr             = calc_rr_interval(bpm)
                cardiac_phase  = calc_cardiac_phase(t, last_r_peak_t, rr)
                map_val        = round(calc_map(sbp, dbp), 1)
                pp             = round(calc_pulse_pressure(sbp, dbp), 1)
                sv             = round(calc_stroke_volume(pp), 1)
                co             = round(calc_cardiac_output(sv, bpm), 2)
                ptt            = round(calc_ptt(sbp), 1)
                wall_stress    = round(calc_wall_stress(abp_val), 1)
                blood_flow     = round(calc_blood_flow(abp_val, prev_abp, dt), 2)
                blood_velocity = round(calc_blood_velocity(co), 3)
                reynolds       = calc_reynolds(blood_velocity)
                risk           = calc_risk_level(sbp, wall_stress, reynolds)

                prev_abp = abp_val

                packet = {
                    "time":           round(t, 3),
                    "ecg":            ecg_val,
                    "abp":            abp_val,
                    "ppg":            None,          # PPG channel not in dataset
                    "r_peak":         is_peak,
                    "bpm":            bpm,
                    "rr_interval":    round(rr, 3),
                    "cardiac_phase":  round(cardiac_phase, 3),
                    "sbp":            sbp,
                    "dbp":            dbp,
                    "map":            map_val,
                    "pulse_pressure": pp,
                    "stroke_volume":  sv,
                    "cardiac_output": co,
                    "ptt":            ptt,
                    "wall_stress":    wall_stress,
                    "blood_flow":     blood_flow,
                    "blood_velocity": blood_velocity,
                    "reynolds_number": reynolds,
                    "risk_level":     risk,
                }

                try:
                    await websocket.send(json.dumps(packet))
                except websockets.exceptions.ConnectionClosed:
                    print("Client disconnected")
                    return

                await asyncio.sleep(DELAY)


async def main():
    server = await websockets.serve(stream_data, "0.0.0.0", 8765)
    print("WebSocket server running on ws://localhost:8765")
    await server.wait_closed()


asyncio.run(main())
