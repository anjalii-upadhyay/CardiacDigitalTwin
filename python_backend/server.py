"""
server.py: streams the doctor's selected heart-failure patient to the Unity heart twin.

Data: public/data/patients.json (made by hf_twin.dashboard.export_data), the same file the dashboard shows, so the
heart and the dashboard can never disagree. Source: PhysioNet SCG-RHC (real chest-patch R-peaks, catheter values).

    ws://localhost:8765/control   dashboard: sends the selection, gets an acknowledgement back
    ws://localhost:8765/stream    Unity:     gets one packet every 1/60 s for the selected patient

Nothing is streamed until a dashboard selects a patient. The selected patient's real R-peak times (beats_s, one
80 s chest-patch slice) are replayed in a loop; the gap from the last beat to the first beat of the next loop is
treated as a normal beat (it is 0.49-0.83 s for every patient). One global selection: the last one wins.

Run from the repo root:  python_backend/venv/bin/python python_backend/server.py
"""

import asyncio
import bisect
import json
import math
from pathlib import Path

from websockets.asyncio.server import serve
from websockets.exceptions import ConnectionClosed

HOST, PORT, RATE_HZ = "localhost", 8765, 60
DATA = Path(__file__).resolve().parents[1] / "public" / "data" / "patients.json"
STATES = ("congested", "uncertain", "not_congested")
LEANS = ("congested", "not_congested")


class Replay:
    """Phase within the real beat sequence of one patient, looping every slice_s seconds."""

    def __init__(self, beats_s, slice_s):
        self.slice = float(slice_s)
        b = [float(t) for t in beats_s]
        # one loop's beats plus the neighbours across both wrap points, so every t has a previous and a next beat
        self.beats = [b[-1] - self.slice] + b + [b[0] + self.slice]

    def at(self, t):
        """(index of the last beat at or before t, rr interval s, cardiac phase 0..1) for t in seconds."""
        t = t % self.slice
        i = bisect.bisect_right(self.beats, t) - 1
        prev, nxt = self.beats[i], self.beats[i + 1]
        rr = nxt - prev
        return i, rr, (t - prev) / rr


def load_patients():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    out = {}
    for p in data["patients"]:
        c = p["congestion"]
        out[p["id"]] = {"replay": Replay(p["signals"]["beats_s"], p["signals"]["slice_s"]),
                        "sv": p["measured"]["sv"], "state": c["state"], "lean": c["lean"],
                        "chance": c["chance"], "wedge": p["estimate"]["wedge"]}
    return out


PATIENTS = load_patients()
selection = None     # {"id", "simulated", "state", "lean", "chance", "wedge", "t0"}


def parse_selection(msg):
    """Validate a /control message (untrusted input). Returns the new selection or raises ValueError."""
    pid = msg.get("select")
    if pid not in PATIENTS:
        raise ValueError(f"unknown patient {pid!r}")
    base = PATIENTS[pid]
    if not msg.get("simulated"):
        return {"id": pid, "simulated": False, "state": base["state"], "lean": base["lean"],
                "chance": base["chance"], "wedge": base["wedge"]}
    wedge, chance = msg.get("wedge"), msg.get("chance")
    if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (wedge, chance)):
        raise ValueError("simulated wedge and chance must be finite numbers")
    if not (0 <= wedge <= 80 and 0 <= chance <= 1):
        raise ValueError("simulated wedge must be 0-80 mmHg and chance 0-1")
    if msg.get("state") not in STATES or msg.get("lean") not in LEANS:
        raise ValueError("simulated state/lean not recognised")
    return {"id": pid, "simulated": True, "state": msg["state"], "lean": msg["lean"],
            "chance": float(chance), "wedge": float(wedge)}


async def control(ws):
    global selection
    await ws.send(json.dumps({"type": "status", "connected": True,
                              "selected": selection["id"] if selection else None}))
    async for raw in ws:
        try:
            new = parse_selection(json.loads(raw))
        except (ValueError, TypeError, AttributeError, json.JSONDecodeError) as e:
            await ws.send(json.dumps({"type": "error", "error": str(e)}))
            continue
        loop_time = asyncio.get_running_loop().time()
        # keep the beat clock running while only the simulated values change, restart it for a new patient
        new["t0"] = selection["t0"] if selection and selection["id"] == new["id"] else loop_time
        if not selection or selection["id"] != new["id"]:
            print(f"selected {new['id']}")
        selection = new
        await ws.send(json.dumps({"type": "selected", "id": new["id"], "simulated": new["simulated"]}))


def packet(sel, now, last_beat):
    p = PATIENTS[sel["id"]]
    t = now - sel["t0"]
    i, rr, phase = p["replay"].at(t)
    loop_n = int(t // p["replay"].slice)
    beat_key = (sel["id"], loop_n, i)
    return beat_key, {
        "patient_id": sel["id"], "source": "SCG-RHC replay",
        "time": round(t % p["replay"].slice, 3),
        "r_peak": last_beat is not None and beat_key != last_beat,
        "rr_interval": round(rr, 4), "bpm": round(60.0 / rr, 1), "cardiac_phase": round(phase, 4),
        "stroke_volume": p["sv"],
        "congestion_state": sel["state"], "lean": sel["lean"], "wedge_mmHg": sel["wedge"], "chance": sel["chance"],
        "simulated": sel["simulated"],
    }


async def stream(ws):
    loop = asyncio.get_running_loop()
    next_send, last_beat = loop.time(), None
    while True:
        now = loop.time()
        if selection is not None:
            key, pkt = packet(selection, now, last_beat if last_beat and last_beat[0] == selection["id"] else None)
            last_beat = key
            await ws.send(json.dumps(pkt))
        next_send += 1.0 / RATE_HZ
        if next_send < now:                 # fell behind (e.g. a stalled client): skip, don't burst
            next_send = now + 1.0 / RATE_HZ
        await asyncio.sleep(max(0.0, next_send - loop.time()))


async def handler(ws):
    path = ws.request.path
    try:
        if path == "/control":
            await control(ws)
        elif path == "/stream":
            await stream(ws)
        else:
            await ws.close(code=1008, reason="use /control or /stream")
    except ConnectionClosed:
        pass


async def main():
    print(f"{len(PATIENTS)} patients from {DATA}")
    async with serve(handler, HOST, PORT):
        print(f"ws://{HOST}:{PORT}/control (dashboard) and /stream (Unity, {RATE_HZ} Hz) — waiting for a selection")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
