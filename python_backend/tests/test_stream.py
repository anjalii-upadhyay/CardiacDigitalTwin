"""
Check the congestion stream: beat replay maths, selection validation, and a live /control + /stream round trip.
Run from the repo root:  python_backend/venv/bin/python python_backend/tests/test_stream.py
"""

import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import server  # noqa: E402
from websockets.asyncio.client import connect  # noqa: E402


def test_replay():
    r = server.Replay([0.5, 1.5, 2.3], slice_s=3.0)
    _, rr, ph = r.at(1.5)                                   # on a beat: phase 0, rr to the next beat
    assert abs(rr - 0.8) < 1e-9 and ph == 0.0
    _, rr, ph = r.at(1.9)
    assert abs(rr - 0.8) < 1e-9 and abs(ph - 0.5) < 1e-9
    _, rr, ph = r.at(2.9)                                   # across the loop end: 2.3 -> 3.5 (= 0.5 next loop)
    assert abs(rr - 1.2) < 1e-9 and abs(ph - 0.5) < 1e-9
    _, rr, ph = r.at(0.2)                                   # before the first beat: same wrap interval
    assert abs(rr - 1.2) < 1e-9 and abs(ph - 0.75) < 1e-9
    assert all(abs(a - b) < 1e-9 for a, b in zip(r.at(3.0 + 1.9)[1:], r.at(1.9)[1:]))   # loops every slice


def test_parse():
    pid = next(iter(server.PATIENTS))
    real = server.parse_selection({"select": pid})
    assert real["simulated"] is False and real["state"] == server.PATIENTS[pid]["state"]
    sim = server.parse_selection({"select": pid, "simulated": True, "wedge": 12.0, "chance": 0.2,
                                  "lean": "not_congested", "state": "uncertain"})
    assert sim["simulated"] and sim["wedge"] == 12.0
    for bad in ({"select": "nope"}, {"select": pid, "simulated": True, "wedge": float("nan"), "chance": 0.2,
                                     "lean": "congested", "state": "uncertain"},
                {"select": pid, "simulated": True, "wedge": 12, "chance": 2, "lean": "congested", "state": "uncertain"},
                {"select": pid, "simulated": True, "wedge": 12, "chance": 0.2, "lean": "x", "state": "uncertain"}):
        try:
            server.parse_selection(bad)
            raise AssertionError(f"accepted {bad}")
        except ValueError:
            pass


async def live():
    from websockets.asyncio.server import serve
    async with serve(server.handler, "localhost", 8799):
        async with connect("ws://localhost:8799/stream") as unity, connect("ws://localhost:8799/control") as dash:
            status = json.loads(await dash.recv())
            assert status["type"] == "status" and status["connected"]
            try:                                            # nothing streams before a selection
                await asyncio.wait_for(unity.recv(), 0.3)
                raise AssertionError("streamed before any selection")
            except asyncio.TimeoutError:
                pass
            pid = max(server.PATIENTS, key=lambda k: server.PATIENTS[k]["wedge"])
            await dash.send(json.dumps({"select": pid}))
            assert json.loads(await dash.recv())["type"] == "selected"
            pkts = [json.loads(await unity.recv()) for _ in range(120)]   # ~2 s at 60 Hz
            assert all(p["patient_id"] == pid and 0 <= p["cardiac_phase"] < 1 for p in pkts)
            assert any(p["r_peak"] for p in pkts), "no beat in 2 s"
            assert set(pkts[0]) == {"patient_id", "source", "time", "r_peak", "rr_interval", "bpm", "cardiac_phase",
                                    "stroke_volume", "congestion_state", "lean", "wedge_mmHg", "chance", "simulated"}
            await dash.send(json.dumps({"select": "nope"}))
            assert json.loads(await dash.recv())["type"] == "error"
        async with connect("ws://localhost:8799/other") as bad:
            try:
                await bad.recv()
                raise AssertionError("unknown path not closed")
            except Exception as e:
                assert "1008" in str(e) or "use /control" in str(e), e


if __name__ == "__main__":
    test_replay()
    test_parse()
    asyncio.run(live())
    print("stream checks passed")
