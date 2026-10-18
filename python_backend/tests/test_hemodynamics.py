"""
test_hemodynamics.py — Backend validation test.

What it does:
  1. Unit-tests risk_engine with three clinical profiles (no server needed).
  2. Starts the WebSocket server in a background task.
  3. Connects a client and receives packets for 5 seconds.
  4. Prints one packet per second (every 125th packet at 125 Hz).
  5. Asserts all required fields are present and values are in range.

Run: python tests/test_hemodynamics.py  (from python_backend/)
"""

import asyncio
import json
import sys
import os

# Allow imports from python_backend root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import websockets
from server import main as server_main
from processors.risk_engine import calc_reynolds, calc_risk_with_reasons
from processors.hemodynamics import calc_blood_velocity, calc_map, calc_wall_stress

REQUIRED_FIELDS = [
    "time", "ecg", "abp", "ppg", "r_peak", "bpm",
    "rr_interval", "cardiac_phase", "sbp", "dbp", "map",
    "pulse_pressure", "stroke_volume", "cardiac_output", "ptt",
    "wall_stress", "blood_flow", "blood_velocity", "reynolds_number", "risk_level",
]


def test_risk_profiles():
    """
    Unit-test the weighted risk model against three clinical profiles.
    Each profile exercises the full call chain used in server.py.
    """
    def risk_for(bpm, sbp, dbp, co, abp):
        pp          = sbp - dbp
        map_val     = dbp + pp / 3.0
        vel         = calc_blood_velocity(co)
        reynolds    = calc_reynolds(vel)
        wall_stress = calc_wall_stress(abp)
        risk, reasons = calc_risk_with_reasons(
            sbp, wall_stress, reynolds,
            bpm=bpm, map_val=map_val, co=co, pp=pp
        )
        return risk, reasons, reynolds, wall_stress, map_val

    # ── Healthy adult at rest ─────────────────────────────────────────────────
    # HR=70, SBP=115, DBP=75, CO=5, ABP=95 — all within normal bounds
    risk, reasons, re, ws, mp = risk_for(bpm=70, sbp=115, dbp=75, co=5.0, abp=95)
    assert risk == "Low", f"Healthy profile should be Low, got {risk} | {reasons}"
    print(f"[PASS] Healthy   → risk={risk:8s}  MAP={mp:.1f}  Re={re:.0f}  WS={ws:.1f}")
    print(f"       reasons: {reasons or ['none — all normal']}")

    # ── Exercise / mild stress ─────────────────────────────────────────────────
    # HR=120 (tachycardia), mild BP elevation, CO elevated from exercise
    risk, reasons, re, ws, mp = risk_for(bpm=120, sbp=135, dbp=85, co=7.0, abp=115)
    assert risk == "Moderate", f"Exercise profile should be Moderate, got {risk} | {reasons}"
    print(f"[PASS] Moderate  → risk={risk:8s}  MAP={mp:.1f}  Re={re:.0f}  WS={ws:.1f}")
    print(f"       reasons: {reasons}")

    # ── Abnormal haemodynamics ─────────────────────────────────────────────────
    # Severe tachycardia + hypertensive urgency + high-output state
    risk, reasons, re, ws, mp = risk_for(bpm=135, sbp=165, dbp=105, co=12.0, abp=160)
    assert risk == "High", f"Abnormal profile should be High, got {risk} | {reasons}"
    print(f"[PASS] High      → risk={risk:8s}  MAP={mp:.1f}  Re={re:.0f}  WS={ws:.1f}")
    print(f"       reasons: {reasons}")

    print()


async def run_test():
    # ── Run unit tests first (no server needed) ───────────────────────────────
    test_risk_profiles()

    # Start server as a background task
    server_task = asyncio.create_task(server_main())
    await asyncio.sleep(0.5)  # give server time to bind

    print("Connecting to ws://localhost:8765 ...\n")

    async with websockets.connect("ws://localhost:8765") as ws:
        count      = 0
        print_next = 0   # print at sample 0, 125, 250, ...

        while count < 625:   # ~5 seconds at 125 Hz
            raw    = await ws.recv()
            packet = json.loads(raw)

            # ── Field presence check ──────────────────────────────────────
            missing = [f for f in REQUIRED_FIELDS if f not in packet]
            assert not missing, f"Missing fields: {missing}"

            # ── Range sanity checks ───────────────────────────────────────
            assert 0 < packet["bpm"] < 300,          f"BPM out of range: {packet['bpm']}"
            assert 0.0 <= packet["cardiac_phase"] <= 1.0, "cardiac_phase out of [0,1]"
            assert packet["risk_level"] in ("Low", "Moderate", "High"), \
                f"Unknown risk: {packet['risk_level']}"

            # ── Print one packet per second ───────────────────────────────
            if count == print_next:
                print(
                    f"[t={packet['time']:7.3f}s] "
                    f"bpm={packet['bpm']:3d}  "
                    f"abp={packet['abp']:7.2f}  "
                    f"sbp={packet['sbp']:5.1f}  "
                    f"map={packet['map']:5.1f}  "
                    f"sv={packet['stroke_volume']:5.1f}  "
                    f"co={packet['cardiac_output']:4.2f}  "
                    f"risk={packet['risk_level']}"
                )
                print_next += 125

            count += 1

    server_task.cancel()
    print(f"\n✓ All {count} packets validated — packet generation working correctly.")


if __name__ == "__main__":
    asyncio.run(run_test())
