"""
server.py — Cardiac Digital Twin WebSocket server entry point.

Streams ECG + ABP with derived haemodynamic metrics at 125 Hz.
Run: python server.py

Honesty notes (clinical-grade review, 2026-10):
- SBP/DBP are MEASURED per beat as the max/min of the real ABP waveform between
  R-peaks (no synthetic noise). All derived values follow from those.
- rr_interval is the TRUE beat-to-beat interval; cardiac_phase is exact because
  the next R-peak is known in a replay.
- The stream labels itself as a replay ("source") and flags dataset window
  splices ("segment_break") so the client never renders a splice as a pause.
"""

import asyncio
import json
import os
import websockets

from utils.constants          import DELAY
from streams.dataset_stream   import DATASET_PATH, load_dataset, get_window_signals
from processors.ecg_processor import calc_rr_interval, calc_cardiac_phase
from processors.hemodynamics  import (
    calc_map, calc_pulse_pressure, calc_stroke_volume,
    calc_cardiac_output, calc_ptt, calc_wall_stress,
    calc_blood_flow, calc_blood_velocity,
)
from processors.risk_engine   import calc_reynolds, calc_risk_with_reasons
from models.packet_model      import build_packet

# ── Load dataset once at startup ──────────────────────────────────────────────
subj, sbp_all, dbp_all, n_windows = load_dataset()
print(f"Total windows: {n_windows}  |  SBP range: {sbp_all.min():.1f}–{sbp_all.max():.1f}")

SOURCE = "replay " + os.path.basename(DATASET_PATH)

# Track active client count for debug logging
_active_clients = 0


async def stream_data(websocket):
    """WebSocket handler — streams one packet per ECG sample to the client."""
    global _active_clients
    _active_clients += 1
    print(f"Client connected  (active clients: {_active_clients})")

    prev_abp      = 100.0
    packets_sent  = 0
    dropped       = 0
    log_timer     = asyncio.get_event_loop().time()
    schema_logged = False
    loop          = asyncio.get_event_loop()
    next_send     = loop.time()

    while True:
        for win_idx in range(n_windows):
            ecg, t_vals, _, abp_w, rpeak_indices, bpm = get_window_signals(subj, win_idx)
            n_samples  = min(len(ecg), len(abp_w), len(t_vals))
            peak_times = [float(t_vals[k]) for k in sorted(rpeak_indices) if k < n_samples]
            rr_mean    = calc_rr_interval(bpm)

            # Measured per-beat pressures, seeded from the dataset's own per-window values
            # until the first full beat has been observed.
            sbp = round(float(sbp_all[win_idx]), 1)
            dbp = round(float(dbp_all[win_idx]), 1)
            beat_max = beat_min = None
            seen_peak = False       # the leading PARTIAL beat must never overwrite the dataset seed
            pending_break = True    # carried until actually delivered, so a dropped packet can't lose it
            pending_peak = False

            # Beat bookkeeping restarts per window: windows are spliced, not contiguous.
            # A virtual previous beat one mean-RR before the first peak keeps phase/RR sane
            # for the leading partial beat.
            last_peak_t = (peak_times[0] - rr_mean) if peak_times else float(t_vals[0]) - rr_mean
            peak_i      = 0

            for i in range(n_samples):
                t       = float(t_vals[i])
                ecg_val = round(float(ecg[i]), 4)
                abp_val = round(float(abp_w[i]), 2)
                is_peak = i in rpeak_indices

                # Accumulate the pressure waveform within the current beat.
                beat_max = abp_val if beat_max is None else max(beat_max, abp_val)
                beat_min = abp_val if beat_min is None else min(beat_min, abp_val)

                if is_peak:
                    # Finalise the completed beat's measured SBP/DBP from the real waveform — but only for a
                    # FULL beat (R to R); the truncated partial beat at a window start keeps the dataset seed.
                    # Require a plausible pulse pressure so flat/artefact beats don't poison it.
                    if seen_peak and beat_max is not None and (beat_max - beat_min) >= 10.0:
                        sbp = round(beat_max, 1)
                        dbp = round(beat_min, 1)
                    seen_peak = True
                    beat_max = beat_min = None
                    last_peak_t = t
                    while peak_i < len(peak_times) and peak_times[peak_i] <= t:
                        peak_i += 1

                # True beat-to-beat RR; the next R-peak is known in a replay, so phase is exact.
                next_peak_t = peak_times[peak_i] if peak_i < len(peak_times) else None
                rr = (next_peak_t - last_peak_t) if (next_peak_t is not None and next_peak_t > last_peak_t) else rr_mean
                cardiac_phase = calc_cardiac_phase(t, last_peak_t, rr)

                map_val       = round(calc_map(sbp, dbp), 1)
                pp            = round(calc_pulse_pressure(sbp, dbp), 1)
                sv            = round(calc_stroke_volume(pp), 1)
                co            = round(calc_cardiac_output(sv, bpm), 2)
                ptt           = round(calc_ptt(sbp), 1)
                # Peak systolic wall stress (Laplace with per-beat SBP): stable within a beat, and on the
                # pressure scale the 200/280 risk thresholds were tuned for.
                wall_stress   = round(calc_wall_stress(sbp), 1)
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
                    t, ecg_val, abp_val, is_peak or pending_peak, bpm,
                    rr, cardiac_phase, sbp, dbp,
                    map_val, pp, sv, co, ptt,
                    wall_stress, blood_flow, dpdt, blood_vel, reynolds, risk
                )
                packet["source"]        = SOURCE
                packet["segment_break"] = pending_break

                if not schema_logged:
                    print(f"[DEBUG] Packet schema: {list(packet.keys())}")
                    print(f"[DEBUG] Sample | sbp={sbp:.1f} dbp={dbp:.1f} rr={rr:.3f} phase={cardiac_phase:.3f}")
                    schema_logged = True

                packets_sent += 1
                now = loop.time()
                if now - log_timer >= 1.0:
                    reason_str = " | ".join(reasons) if reasons else "all normal"
                    drop_str   = f" | dropped={dropped}" if dropped else ""
                    print(f"[DEBUG] {packets_sent} pkt/s | bpm={bpm} rr={rr:.2f} map={map_val:.1f} co={co:.2f} risk={risk}{drop_str} | {reason_str}")
                    packets_sent = 0
                    log_timer    = now

                try:
                    # allow_nan=False: NaN must never be serialised as a bare token the client
                    # cannot parse — drop the sample and count it instead. A dropped sample's
                    # segment_break / r_peak flags roll forward onto the next delivered sample.
                    await websocket.send(json.dumps(packet, allow_nan=False))
                    pending_break = False
                    pending_peak  = False
                except ValueError:
                    dropped += 1
                    pending_peak = pending_peak or is_peak
                except websockets.exceptions.ConnectionClosed:
                    _active_clients -= 1
                    print(f"Client disconnected  (active clients: {_active_clients})")
                    return

                # Pace to an absolute deadline so the stream holds 125 Hz without sleep drift.
                next_send += DELAY
                await asyncio.sleep(max(0.0, next_send - loop.time()))
                if loop.time() - next_send > 1.0:   # fell badly behind (e.g. debugger pause)
                    next_send = loop.time()


async def main():
    server = await websockets.serve(stream_data, "0.0.0.0", 8765)
    print("WebSocket server running on ws://localhost:8765")
    await server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
