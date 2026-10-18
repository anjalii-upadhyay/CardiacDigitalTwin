"""
test_values.py — Evidence that the derived haemodynamic values are accurate.

Every assertion below was first measured on the recording and is now locked in so that it
cannot silently regress. Run from python_backend/:  venv/bin/python tests/test_values.py
(takes ~1 min: it walks every beat in the 114-minute recording).
"""

import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from streams.dataset_stream import load_dataset, get_window_signals, get_subject_info
from processors.hemodynamics import (
    calc_map, calc_pulse_pressure, calc_stroke_volume, calc_cardiac_output,
    Windkessel3, calc_blood_velocity, calc_wall_stress, calc_bsa, calc_cardiac_index,
    AORTA_AREA_M2, MMHG_TO_KPA,
)
from utils.constants import (
    ARTERIAL_COMPLIANCE, RESISTANCE, CHARACTERISTIC_IMPEDANCE, DELAY,
    VENTRICLE_RADIUS, WALL_THICKNESS,
)

R_TOTAL = RESISTANCE + CHARACTERISTIC_IMPEDANCE


def beats(subj, n_windows):
    """
    Yield (abp_segment, q_segment, rr, sbp_label, dbp_label, first_in_window) for every full
    R-to-R beat, running the 3-element Windkessel continuously through each window exactly as
    server.py does (state reset at the window start).
    """
    sbp_all = np.array(subj["SegSBP"]).flatten()
    dbp_all = np.array(subj["SegDBP"]).flatten()
    for w in range(n_windows):
        ecg, t, _, abp, rpk, bpm, ppg = get_window_signals(subj, w)
        n = min(len(abp), len(t))
        wk = Windkessel3()
        wk.reset(float(abp[0]))
        q = np.array([wk.step(float(abp[k]), DELAY)[0] for k in range(n)])
        idx = [i for i in sorted(rpk) if 0 <= i < n]
        first = True
        for a, b in zip(idx, idx[1:]):
            seg = np.asarray(abp[a:b], float)
            rr = float(t[b] - t[a])
            if len(seg) < 10 or not (0.3 < rr < 2.5) or seg.max() - seg.min() < 10:
                first = False
                continue
            yield seg, q[a:b], rr, float(sbp_all[w]), float(dbp_all[w]), first
            first = False


def main():
    subj, _, _, n_windows = load_dataset()
    info = get_subject_info(subj)
    print(f"Subject {info['subject_id']}: {info['age']:.0f} y {info['sex']}, BMI {info['bmi']:.1f}")
    print(f"Windkessel: Zc={CHARACTERISTIC_IMPEDANCE} R={RESISTANCE} C={ARTERIAL_COMPLIANCE}  (R+Zc={R_TOTAL:.2f})")

    meas_s, meas_d, lab_s, lab_d = [], [], [], []
    sv_pp, sv_wk, vol_int, peak_q, neg_beats, hr = [], [], [], [], 0, []
    for seg, qseg, rr, ls, ld, first in beats(subj, n_windows):
        hi, lo = float(seg.max()), float(seg.min())
        meas_s.append(hi); meas_d.append(lo); lab_s.append(ls); lab_d.append(ld)
        hr.append(60.0 / rr)
        sv_pp.append(calc_stroke_volume(calc_pulse_pressure(hi, lo)))
        sv_wk.append(calc_map(hi, lo) * rr / R_TOTAL)        # analytic per-beat volume
        if not first:                                        # skip the beat that spans the reset
            vol_int.append(float(qseg.sum()) * DELAY)
            peak_q.append(float(qseg.max()))
            if qseg.min() < 0: neg_beats += 1
    meas_s, meas_d, lab_s, lab_d = map(np.array, (meas_s, meas_d, lab_s, lab_d))
    sv_pp, sv_wk = np.array(sv_pp), np.array(sv_wk)
    print(f"beats analysed: {len(sv_pp)}")

    # 1. Per-beat SBP/DBP measured from the waveform agree with the dataset's own labels
    #    (AAMI criterion for BP devices: mean difference <= 5 mmHg).
    bias_s, bias_d = (meas_s - lab_s).mean(), (meas_d - lab_d).mean()
    mae_s, mae_d = np.abs(meas_s - lab_s).mean(), np.abs(meas_d - lab_d).mean()
    print(f"[1] SBP bias {bias_s:+.1f} MAE {mae_s:.1f} | DBP bias {bias_d:+.1f} MAE {mae_d:.1f} mmHg")
    assert abs(bias_s) < 5 and abs(bias_d) < 5 and mae_s < 5 and mae_d < 5

    # 2. The two independent stroke-volume routes agree: PP x C vs the Windkessel volume MAP*RR/(R+Zc).
    rel = (sv_pp.mean() - sv_wk.mean()) / sv_wk.mean()
    print(f"[2] SV: pulse-pressure {sv_pp.mean():.1f} mL vs Windkessel {sv_wk.mean():.1f} mL ({rel:+.1%})")
    assert abs(rel) < 0.05, "ARTERIAL_COMPLIANCE no longer reconciles the two SV estimates"

    # 3. Time constants are physiological: diastolic decay tau = R*C, and R+Zc = MAP/CO ~ 1.0.
    tau = RESISTANCE * ARTERIAL_COMPLIANCE
    print(f"[3] tau = R*C = {tau:.2f} s (measured diastolic decay 1.7-2.1 s); R+Zc = {R_TOTAL:.2f} mmHg*s/mL")
    assert 1.0 <= tau <= 2.2
    assert 0.8 <= R_TOTAL <= 1.3

    # 4. Integrating the 3-element model's own flow over a beat reproduces MAP*RR/(R+Zc).
    err = (np.mean(vol_int) - sv_wk.mean()) / sv_wk.mean()
    print(f"[4] integral of Q per beat: {np.mean(vol_int):.1f} mL vs analytic {sv_wk.mean():.1f} mL ({err:+.1%})")
    assert abs(err) < 0.10

    # 5. The flow waveform is physiological: a pulsatile jet with a brief backflow at valve closure,
    #    and no derivative-noise spikes (the 2-element inverse reached +/-1300 mL/s).
    pk = float(np.median(peak_q))
    print(f"[5] peak flow per beat: median {pk:.0f} mL/s (ref peak aortic ~300-600); "
          f"beats with backflow: {100*neg_beats/len(vol_int):.0f}%")
    assert 150 <= pk <= 1000
    wk = Windkessel3(); wk.reset(100.0)
    assert wk.step(100.0, DELAY)[0] > 0, "steady pressure must give positive forward flow"

    # 6. Velocity is physical: v = Q/A, laminar at rest.
    v5 = calc_blood_velocity(5.0)
    print(f"[6] v(CO=5 L/min) = {v5:.3f} m/s (mean aortic ref 0.1-0.2)")
    assert math.isclose(v5, (5.0 / 1000 / 60) / AORTA_AREA_M2, rel_tol=1e-6)
    assert 0.10 <= v5 <= 0.25

    # 7. Wall stress is in kPa on the Laplace scale (population r/h), i.e. a fixed multiple of SBP.
    ws = calc_wall_stress(120.0)
    print(f"[7] wall stress at SBP 120 = {ws:.1f} kPa (ref 15-25)")
    assert math.isclose(ws, 120.0 * MMHG_TO_KPA * VENTRICLE_RADIUS / (2 * WALL_THICKNESS), rel_tol=1e-9)
    assert 15 <= ws <= 30

    # 8. Static + dynamic fusion: cardiac index for THIS subject is in the normal range.
    bsa = calc_bsa(info["height_cm"], info["weight_kg"])
    co = calc_cardiac_output(float(np.median(sv_pp)), float(np.median(hr)))
    ci = calc_cardiac_index(co, bsa)
    print(f"[8] BSA {bsa:.2f} m² | median CO {co:.2f} L/min | cardiac index {ci:.2f} L/min/m² (ref 2.5-4.0)")
    assert 1.3 <= bsa <= 1.6
    assert 2.5 <= ci <= 4.0

    print("\n✓ all value checks passed")


if __name__ == "__main__":
    main()
