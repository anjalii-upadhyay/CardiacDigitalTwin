"""
Checks that predict() works and matches the frozen model:
  1. For several recordings, predict_recording() equals the frozen model applied to the stored feature table.
  2. A flat or missing signal is rejected with reasons instead of a number.
  3. Missing record facts (None) do not crash it.

Run from the repo root:
    python_backend/venv/Scripts/python.exe -m hf_twin.inference.check_predict
"""

import numpy as np

from hf_twin.inference import load_model, predict_recording, predict_wedge
from hf_twin.ml_training import data_io, dataset


def main():
    model = load_model()
    table = {r["rec_id"]: r for r in dataset.load_table() if r["phase"] == "baseline"}
    ids = ["TRM152-RHC1", "TRM164-RHC1", "TRM198-RHC1", "TRM245-RHC1", "TRM268-RHC1"]
    ok_all = True
    for rid in ids:
        res = predict_recording(rid, model)
        x = np.array([[table[rid][c] for c in model["features"]]], dtype=float)
        stored = round(float(model["pipeline"].predict(x)[0]), 1)
        same = res["ok"] and abs(res["wedge_mmHg"] - stored) < 0.05
        ok_all &= same
        print(f"{rid}: predict() {res.get('wedge_mmHg')} vs stored {stored} -> {'match' if same else 'MISMATCH'} | "
              f"chance {res.get('chance_congested')} | {res.get('category_strict')} | lean {res.get('lean')}")

    rec = next(r for r in data_io.load_recordings() if r.rec_id == ids[0])
    channels = data_io.read_header(ids[0])
    names = [c.name for c in channels]
    sig = data_io.load_window(rec.window_path, channels)

    flat = np.zeros_like(sig)
    bad = predict_wedge(flat, names, rec.label, model)
    print(f"flat signal -> ok={bad['ok']}, reasons={bad.get('reasons')}")
    ok_all &= (bad["ok"] is False)

    try:
        predict_wedge(sig, ["a", "b"], rec.label, model)
        ok_all = False
        print("missing channels -> NOT rejected")
    except KeyError as e:
        print(f"missing channels -> rejected ({e})")

    partial = dict(rec.label, sbp=None, dbp=None, height=None)
    res = predict_wedge(sig, names, partial, model)
    print(f"missing record facts -> ok={res['ok']}, estimate {res.get('wedge_mmHg')}")
    ok_all &= res["ok"]
    print("ALL CHECKS PASSED" if ok_all else "SOME CHECKS FAILED")


if __name__ == "__main__":
    main()
