"""
server.py — Cardiac Digital Twin WebSocket server entry point.

Streams ECG + ABP with derived haemodynamic metrics at 125 Hz.
Run: python server.py
"""

import asyncio
import json
import random
import websockets

from utils.constants          import DELAY
from streams.dataset_stream   import load_dataset, get_window_signals
from processors.ecg_processor import calc_rr_interval, calc_cardiac_phase
from processors.hemodynamics  import (
    calc_map, calc_pulse_pressure, calc_stroke_volume,
    calc_cardiac_output, calc_ptt, calc_wall_stress,
    calc_blood_flow, calc_blood_velocity,
)
from processors.risk_engine   import calc_reynolds, calc_risk_level, calc_risk_with_reasons
from models.packet_model      import build_packet

# ── Load dataset once at startup ──────────────────────────────────────────────
subj, sbp_all, dbp_all, n_windows = load_dataset()
print(f"Total windows: {n_windows}  |  SBP range: {sbp_all.min():.1f}–{sbp_all.max():.1f}")

# Track active client count for debug logging
_active_clients = 0


async def stream_data(websocket):
    """WebSocket handler — streams one packet per ECG sample to the client."""
    global _active_clients
    _active_clients += 1
    print(f"Client connected  (active clients: {_active_clients})")

    prev_abp      = 100.0
    last_r_peak_t = 0.0
    packets_sent  = 0
    log_timer     = asyncio.get_event_loop().time()
    schema_logged = False

    while True:
        for win_idx in range(n_windows):
            ecg, t_vals, _, abp_w, rpeak_indices, bpm = get_window_signals(subj, win_idx)

            sbp_base = float(sbp_all[win_idx])
            dbp_base = float(dbp_all[win_idx])
            n_samples = min(len(ecg), len(abp_w), len(t_vals))

            for i in range(n_samples):
                t       = float(t_vals[i])
                ecg_val = round(float(ecg[i]), 4)
                abp_val = round(float(abp_w[i]), 2)
                is_peak = i in rpeak_indices

                sbp = round(sbp_base + random.uniform(-3, 3), 1)
                dbp = round(dbp_base + random.uniform(-2, 2), 1)

                if is_peak:
                    last_r_peak_t = t

                rr            = calc_rr_interval(bpm)
                cardiac_phase = calc_cardiac_phase(t, last_r_peak_t, rr)
                map_val       = round(calc_map(sbp, dbp), 1)
                pp            = round(calc_pulse_pressure(sbp, dbp), 1)
                sv            = round(calc_stroke_volume(pp), 1)
                co            = round(calc_cardiac_output(sv, bpm), 2)
                ptt           = round(calc_ptt(sbp), 1)
                wall_stress   = round(calc_wall_stress(abp_val), 1)
                blood_flow, dpdt = calc_blood_flow(abp_val, prev_abp, DELAY)
                blood_flow    = round(blood_flow, 2)
                dpdt          = round(dpdt, 4)
                blood_vel     = round(calc_blood_velocity(co), 3)
                reynolds      = calc_reynolds(blood_vel)
                risk, reasons = calc_risk_with_reasons(
                    sbp, wall_stress, reynolds,
                    bpm=bpm, map_val=map_val, co=co, pp=pp
                )

                prev_abp = abp_val

                packet = build_packet(
                    t, ecg_val, abp_val, is_peak, bpm,
                    rr, cardiac_phase, sbp, dbp,
                    map_val, pp, sv, co, ptt,
                    wall_stress, blood_flow, dpdt, blood_vel, reynolds, risk
                )

                # ── Debug: log schema once + one sample packet showing abp/dpdt/blood_flow ──
                if not schema_logged:
                    print(f"[DEBUG] Packet schema: {list(packet.keys())}")
                    print(f"[DEBUG] Sample | abp={abp_val:.2f}  dpdt={dpdt:.4f}  blood_flow={blood_flow:.2f}")
                    schema_logged = True

                packets_sent += 1
                now = asyncio.get_event_loop().time()
                if now - log_timer >= 1.0:
                    reason_str = " | ".join(reasons) if reasons else "all normal"
                    print(f"[DEBUG] {packets_sent} pkt/s | bpm={bpm} map={map_val:.1f} co={co:.2f} risk={risk} | {reason_str}")
                    packets_sent = 0
                    log_timer    = now

                try:
                    await websocket.send(json.dumps(packet))
                except websockets.exceptions.ConnectionClosed:
                    _active_clients -= 1
                    print(f"Client disconnected  (active clients: {_active_clients})")
                    return

                await asyncio.sleep(DELAY)


async def main():
    server = await websockets.serve(stream_data, "0.0.0.0", 8765)
    print("WebSocket server running on ws://localhost:8765")
    await server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())


# cd d:\majorProject\python_backend                                                
# venv\Scripts\activate
# python server.py

# cd d:\majorProject                                                               
# npm run dev  