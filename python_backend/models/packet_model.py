"""Assembles the JSON packet sent over WebSocket each frame."""


def build_packet(
    t, ecg_val, abp_val, ppg_val, is_peak, bpm,
    rr, cardiac_phase, sbp, dbp,
    map_val, pp, sv, co, ptt,
    wall_stress, blood_flow, dpdt, blood_vel, reynolds, risk,
    cardiac_index, bsa, windkessel_pressure, subject,
):
    return {
        "subject":             subject,           # anonymised static record (id, age, sex, height, weight, bmi)
        "time":                round(t, 3),
        "ecg":                 ecg_val,
        "abp":                 abp_val,           # mmHg, instantaneous aortic pressure P
        "ppg":                 ppg_val,           # normalised 0-1 PPG sample (None if no PPG channel)
        "r_peak":              is_peak,
        "bpm":                 bpm,               # heart rate from the last 5 true RR intervals
        "rr_interval":         round(rr, 3),      # true beat-to-beat RR, s
        "cardiac_phase":       round(cardiac_phase, 3),
        "sbp":                 sbp,               # measured per beat from the ABP waveform
        "dbp":                 dbp,
        "map":                 map_val,
        "pulse_pressure":      pp,
        "stroke_volume":       sv,                # ESTIMATE: PP x arterial compliance, mL
        "cardiac_output":      co,                # L/min
        "cardiac_index":       cardiac_index,     # L/min/m^2  (CO / body surface area)
        "bsa":                 bsa,               # m^2, Mosteller, from the subject's height/weight
        "ptt":                 ptt,               # ms; None unless measured from ECG + PPG timing
        "wall_stress":         wall_stress,       # kPa, Laplace with population r/h (tracks SBP)
        "blood_flow":          blood_flow,        # mL/s, 3-element Windkessel: Q = (P - P_wk)/Zc
        "windkessel_pressure": windkessel_pressure,  # mmHg, P_wk — lets a consumer recompute Q exactly
        "dpdt":                dpdt,              # mmHg/s, informational
        "blood_velocity":      blood_vel,         # m/s, mean aortic (Q/A)
        "reynolds_number":     reynolds,
        "risk_level":          risk,
    }
