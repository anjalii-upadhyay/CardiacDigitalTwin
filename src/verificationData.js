// verificationData.js
// Single source of truth for all physiological parameter definitions.
// To add a new parameter: push a new entry into PARAMETERS.

// ── Data type tags ────────────────────────────────────────────────────────────
export const TYPE = {
  SENSOR:  "Direct Sensor Value",
  CALC:    "Calculated Value",
  MODEL:   "Model-Derived Value",
}

// ── Color scheme per type ─────────────────────────────────────────────────────
export const TYPE_COLOR = {
  [TYPE.SENSOR]: { badge: "bg-blue-900/40 text-blue-300 border-blue-700/50",   dot: "bg-blue-400"   },
  [TYPE.CALC]:   { badge: "bg-green-900/40 text-green-300 border-green-700/50", dot: "bg-green-400"  },
  [TYPE.MODEL]:  { badge: "bg-purple-900/40 text-purple-300 border-purple-700/50", dot: "bg-purple-400" },
}

// ── Validation status helpers ─────────────────────────────────────────────────
export function getStatus(value, lo, hi, warnLo, warnHi) {
  if (value == null || isNaN(value)) return "unknown"
  if (value < lo || value > hi)                          return "abnormal"
  if ((warnLo != null && value < warnLo) ||
      (warnHi != null && value > warnHi))                return "borderline"
  return "normal"
}

export const STATUS_STYLE = {
  normal:     { label: "✅ Normal",     cls: "text-green-400",  row: "border-green-900/20"  },
  borderline: { label: "⚠ Borderline", cls: "text-yellow-400", row: "border-yellow-900/20" },
  abnormal:   { label: "❌ Abnormal",   cls: "text-red-400",    row: "border-red-900/20"    },
  unknown:    { label: "— N/A",         cls: "text-gray-500",   row: ""                     },
}

// ── Parameter registry ────────────────────────────────────────────────────────
// Each entry:
//   id          — unique key matching live packet field
//   name        — display name
//   unit        — unit string
//   type        — TYPE.*
//   source      — sensor or method name
//   formula     — LaTeX-style string for display
//   formulaFn   — (packet) => number  — recomputes value from raw packet fields
//   backendKey  — key in the live packet object
//   range       — { lo, hi, warnLo?, warnHi?, label }
//   tooltip     — { what, why, note }
//   expandable  — show expanded model detail card
//   detail      — (optional) extra explanation shown in expanded row

export const PARAMETERS = [
  {
    id: "ecg",
    name: "ECG Signal",
    unit: "mV",
    type: TYPE.SENSOR,
    source: "AD8232 ECG Module",
    formula: "Direct acquisition — Lead II configuration",
    formulaFn: p => p.ecg,
    backendKey: "ecg",
    range: { lo: -2.0, hi: 2.0, warnLo: -1.5, warnHi: 1.5, label: "−2.0 to +2.0 mV" },
    tooltip: {
      what: "Raw electrical potential difference across the heart measured at the skin surface.",
      why:  "Lead II captures the largest QRS deflection, making R-peak detection most reliable.",
      note: "Directly sampled from AD8232 at 125 Hz. No formula applied.",
    },
    expandable: false,
  },
  {
    id: "bpm",
    name: "Heart Rate",
    unit: "bpm",
    type: TYPE.CALC,
    source: "R-Peak Detection (ECG)",
    formula: "HR = 60 / RR",
    formulaFn: p => p.rr_interval > 0 ? parseFloat((60 / p.rr_interval).toFixed(1)) : null,
    backendKey: "bpm",
    range: { lo: 40, hi: 180, warnLo: 60, warnHi: 100, label: "60–100 bpm" },
    tooltip: {
      what: "Number of ventricular contractions per minute.",
      why:  "Derived from the RR interval — time between consecutive R-peaks in the ECG.",
      note: "Bradycardia < 60 bpm. Tachycardia > 100 bpm.",
    },
    expandable: false,
  },
  {
    id: "rr_interval",
    name: "RR Interval",
    unit: "s",
    type: TYPE.CALC,
    source: "ECG R-Peak Timestamps",
    formula: "RR = 60 / HR",
    formulaFn: p => p.bpm > 0 ? parseFloat((60 / p.bpm).toFixed(3)) : null,
    backendKey: "rr_interval",
    range: { lo: 0.33, hi: 1.5, warnLo: 0.6, warnHi: 1.0, label: "0.6–1.0 s" },
    tooltip: {
      what: "Time between two consecutive R-peaks in the ECG waveform.",
      why:  "Fundamental measure of cardiac cycle duration. Inverse of heart rate.",
      note: "Short RR = fast heart rate. Long RR = slow heart rate.",
    },
    expandable: false,
  },
  {
    id: "abp",
    name: "Arterial Blood Pressure",
    unit: "mmHg",
    type: TYPE.SENSOR,
    source: "Invasive Arterial Line (ABP_Raw)",
    formula: "Direct waveform acquisition",
    formulaFn: p => p.abp,
    backendKey: "abp",
    range: { lo: 40, hi: 200, warnLo: 60, warnHi: 160, label: "60–160 mmHg" },
    tooltip: {
      what: "Instantaneous arterial pressure waveform sampled from the dataset.",
      why:  "Provides beat-to-beat pressure variation used to derive haemodynamic parameters.",
      note: "Dataset field: ABP_Raw. Sampled at 125 Hz.",
    },
    expandable: false,
  },
  {
    id: "sbp",
    name: "Systolic Blood Pressure",
    unit: "mmHg",
    type: TYPE.SENSOR,
    source: "Dataset SegSBP + noise",
    formula: "SBP = SegSBP + U(−3, +3)",
    formulaFn: p => p.sbp,
    backendKey: "sbp",
    range: { lo: 70, hi: 200, warnLo: 90, warnHi: 140, label: "90–140 mmHg" },
    tooltip: {
      what: "Peak arterial pressure during ventricular contraction.",
      why:  "Per-window SBP from dataset with ±3 mmHg physiological noise to simulate beat-to-beat variability.",
      note: "Stage 1 HTN ≥ 130. Stage 2 HTN ≥ 140 (ACC/AHA 2017).",
    },
    expandable: false,
  },
  {
    id: "dbp",
    name: "Diastolic Blood Pressure",
    unit: "mmHg",
    type: TYPE.SENSOR,
    source: "Dataset SegDBP + noise",
    formula: "DBP = SegDBP + U(−2, +2)",
    formulaFn: p => p.dbp,
    backendKey: "dbp",
    range: { lo: 40, hi: 130, warnLo: 60, warnHi: 90, label: "60–90 mmHg" },
    tooltip: {
      what: "Minimum arterial pressure during ventricular relaxation.",
      why:  "Per-window DBP from dataset with ±2 mmHg noise.",
      note: "Elevated DBP > 90 mmHg indicates diastolic hypertension.",
    },
    expandable: false,
  },
  {
    id: "map",
    name: "Mean Arterial Pressure",
    unit: "mmHg",
    type: TYPE.CALC,
    source: "SBP + DBP",
    formula: "MAP = DBP + (SBP − DBP) / 3",
    formulaFn: p => parseFloat((p.dbp + (p.sbp - p.dbp) / 3).toFixed(1)),
    backendKey: "map",
    range: { lo: 50, hi: 130, warnLo: 70, warnHi: 105, label: "70–105 mmHg" },
    tooltip: {
      what: "Time-averaged perfusion pressure driving blood through the systemic circulation.",
      why:  "Diastole occupies ~2/3 of the cardiac cycle, so MAP ≈ DBP + PP/3 rather than a simple mean.",
      note: "MAP < 65 mmHg indicates haemodynamic compromise.",
    },
    expandable: false,
  },
  {
    id: "pulse_pressure",
    name: "Pulse Pressure",
    unit: "mmHg",
    type: TYPE.CALC,
    source: "SBP − DBP",
    formula: "PP = SBP − DBP",
    formulaFn: p => parseFloat((p.sbp - p.dbp).toFixed(1)),
    backendKey: "pulse_pressure",
    range: { lo: 20, hi: 100, warnLo: 25, warnHi: 60, label: "25–60 mmHg" },
    tooltip: {
      what: "Difference between systolic and diastolic pressure — reflects stroke volume and arterial stiffness.",
      why:  "Wide PP (> 60) suggests arterial stiffness or aortic regurgitation.",
      note: "Narrow PP (< 25) may indicate low stroke volume or cardiac tamponade.",
    },
    expandable: false,
  },
  {
    id: "stroke_volume",
    name: "Stroke Volume",
    unit: "mL",
    type: TYPE.MODEL,
    source: "Pulse-pressure method (Windkessel)",
    formula: "SV = PP × C  (C = 1.72 mL/mmHg, fitted)",
    formulaFn: p => {
      const pp = p.sbp - p.dbp
      return parseFloat(Math.min(Math.max(pp * 1.72, 5), 200).toFixed(1))
    },
    backendKey: "stroke_volume",
    range: { lo: 5, hi: 200, warnLo: 55, warnHi: 100, label: "55–100 mL" },
    tooltip: {
      what: "ESTIMATED volume of blood ejected by the left ventricle per beat (not a measured volume).",
      why:  "Windkessel steady state: SV ≈ PP × total arterial compliance. C = 1.72 mL/mmHg was fitted to this recording so that this estimate agrees with the Windkessel per-beat volume MAP·RR/(R+Zc) to within 1%.",
      note: "Normal resting SV: 60–100 mL. Does not fall with heart rate as real SV does.",
    },
    expandable: true,
    detail: "Pulse-pressure method: the aorta acts as an elastic reservoir (compliance C); the pressure rise PP per beat corresponds to the stored volume SV ≈ PP × C. C = 1.72 mL/mmHg is fitted (tests/test_values.py): it reconciles this estimate with the 3-element Windkessel volume and gives a diastolic time constant R·C = 1.60 s against a measured 1.7–2.1 s. Literature total arterial compliance 1.0–2.0 mL/mmHg.",
  },
  {
    id: "cardiac_output",
    name: "Cardiac Output",
    unit: "L/min",
    type: TYPE.CALC,
    source: "SV × HR",
    formula: "CO = SV × HR / 1000",
    formulaFn: p => {
      const pp = p.sbp - p.dbp
      const sv = Math.min(Math.max(pp * 1.72, 5), 200)
      return parseFloat(Math.min(Math.max((sv * p.bpm) / 1000, 0.3), 20).toFixed(2))
    },
    backendKey: "cardiac_output",
    range: { lo: 0.3, hi: 20, warnLo: 4, warnHi: 8, label: "4–8 L/min" },
    tooltip: {
      what: "Total volume of blood pumped by the heart per minute.",
      why:  "CO = SV × HR is the fundamental cardiac output equation.",
      note: "CO < 4 L/min at rest may indicate heart failure.",
    },
    expandable: false,
  },
  {
    id: "cardiac_index",
    name: "Cardiac Index",
    unit: "L/min/m²",
    type: TYPE.CALC,
    source: "CO / BSA  (static record + live flow)",
    formula: "CI = CO / BSA,  BSA = √(height·weight / 3600)",
    formulaFn: p => {
      if (p.bsa == null) return null
      const pp = p.sbp - p.dbp
      const sv = Math.min(Math.max(pp * 1.72, 5), 200)
      const co = Math.min(Math.max((sv * p.bpm) / 1000, 0.3), 20)
      return parseFloat((co / p.bsa).toFixed(2))
    },
    backendKey: "cardiac_index",
    range: { lo: 0.5, hi: 8, warnLo: 2.5, warnHi: 4.0, label: "2.5–4.0 L/min/m²" },
    tooltip: {
      what: "Cardiac output normalised to body size — the clinical measure of whether the heart is meeting this patient's demand.",
      why:  "Fuses the static record (height, weight → Mosteller BSA) with the live flow. A small elderly patient has a lower normal CO; CI removes that bias.",
      note: "Normal 2.5–4.0. CI < 2.2 L/min/m² is the haemodynamic definition of cardiogenic shock.",
    },
    expandable: false,
  },
  {
    id: "ejection_fraction",
    name: "Ejection Fraction",
    unit: "%",
    type: TYPE.MODEL,
    source: "SV / EDV (EDV estimated)",
    formula: "EF = (SV / EDV) × 100  (EDV ≈ SV + 50)",
    formulaFn: p => {
      const pp  = p.sbp - p.dbp
      const sv  = Math.min(Math.max(pp * 1.72, 5), 200)
      const edv = sv + 50   // simplified: ESV assumed ~50 mL
      return parseFloat(((sv / edv) * 100).toFixed(1))
    },
    backendKey: null,   // not in packet — computed entirely on frontend
    range: { lo: 20, hi: 80, warnLo: 50, warnHi: 75, label: "50–75 %" },
    tooltip: {
      what: "Fraction of end-diastolic volume ejected per beat.",
      why:  "EF is the primary clinical measure of systolic function. EDV is estimated as SV + ESV where ESV ≈ 50 mL.",
      note: "EF < 40% indicates systolic heart failure (HFrEF).",
    },
    expandable: true,
    detail: "EDV (End-Diastolic Volume) is estimated as SV + ESV. ESV (End-Systolic Volume) is assumed ~50 mL — a simplified estimate for a resting adult. In clinical practice EDV is measured via echocardiography.",
  },
  {
    id: "ptt",
    name: "Pulse Transit Time",
    unit: "ms",
    type: TYPE.MODEL,
    source: "Not measurable from this dataset",
    formula: "PTT = t(PPG pulse arrival) − t(ECG R-peak)",
    formulaFn: () => null,   // no honest value exists: see note
    backendKey: "ptt",
    range: { lo: 100, hi: 400, warnLo: 200, warnHi: 350, label: "200–350 ms (R → finger)" },
    tooltip: {
      what: "Time for the pressure pulse to travel from the heart to a peripheral site.",
      why:  "Requires the true timing between the ECG R-peak and the PPG pulse arrival. PulseDB time-aligns its PPG to the ECG, which removes exactly that delay, so it cannot be recovered here. A former formula derived PTT from SBP alone — that was a restatement of blood pressure, not a measurement, and has been removed.",
      note: "Shown as — until a live ECG + MAX30102 PPG pair provides it.",
    },
    expandable: false,
  },
  {
    id: "wall_stress",
    name: "Ventricular Wall Stress",
    unit: "kPa",
    type: TYPE.MODEL,
    source: "Laplace's Law (peak systolic)",
    formula: "σ = SBP × 0.1333 × r / (2h)  r=3cm, h=1cm",
    formulaFn: p => parseFloat((p.sbp * 0.133322 * 3.0 / (2 * 1.0)).toFixed(1)),
    backendKey: "wall_stress",
    range: { lo: 0, hi: 60, warnLo: 0, warnHi: 26.7, label: "15–25 kPa" },
    tooltip: {
      what: "Peak systolic mechanical stress on the left-ventricular wall.",
      why:  "Laplace's Law for a thin-walled sphere: σ = P·r / 2h, with the per-beat systolic pressure. Elevated wall stress increases myocardial O₂ demand.",
      note: "r = 3.0 cm and h = 1.0 cm are population constants, so this value is a fixed multiple of SBP (×0.2) — it carries no information independent of blood pressure and is shown for context, not as a separate finding.",
    },
    expandable: true,
    detail: "Laplace's Law (thin-walled sphere): σ = (P × r) / (2h), converted to kPa (1 mmHg = 0.1333 kPa). P = per-beat systolic pressure measured from the ABP waveform. r = 3.0 cm mean LV end-diastolic radius, h = 1.0 cm mean wall thickness — population-mean values from cardiac MRI studies (Maceira et al., 2006). Reference peak systolic wall stress 15–25 kPa (150–250 kdyn/cm²).",
  },
  {
    id: "blood_flow",
    name: "Aortic Blood Flow",
    unit: "mL/s",
    type: TYPE.MODEL,
    source: "3-Element Windkessel (Westerhof)",
    formula: "Q = (P − P_wk) / Zc   Zc = 0.07",
    formulaFn: p => {
      // The backend streams its Windkessel pressure P_wk every sample, so the frontend
      // reproduces the backend's flow EXACTLY with one subtraction — no timing, no state.
      const Zc = 0.07   // mmHg·s/mL — aortic characteristic impedance (R + Zc = 1.0 = MAP/CO)
      if (p.windkessel_pressure == null) return null
      return parseFloat(((p.abp - p.windkessel_pressure) / Zc).toFixed(2))
    },
    backendKey: "blood_flow",
    range: { lo: -150, hi: 900, warnLo: 0, warnHi: 600, label: "peak 300–600 mL/s" },
    tooltip: {
      what: "Instantaneous volumetric blood flow into the aorta, recovered from the measured pressure.",
      why:  "3-element Windkessel run in the inverse direction: Zc in series with the parallel R‖C. The characteristic impedance converts the pressure drop P − P_wk directly into flow — no dP/dt term, so sample noise is not amplified.",
      note: "Brief negative flow at valve closure (the dicrotic notch) is physical backflow and is kept. Per-beat integral equals MAP·RR/(R+Zc) ≈ stroke volume.",
    },
    expandable: true,
    detail: "3-element Windkessel: P = Zc·Q + P_wk and C·dP_wk/dt = Q − P_wk/R. The backend integrates P_wk exactly per 8 ms sample and streams it, so Q = (P − P_wk)/Zc here is bit-for-bit the backend's value. Zc = 0.07 mmHg·s/mL (~7% of total resistance, literature — an assumption, not identifiable from pressure alone), R = 0.93, C = 1.72. Median peak flow on this recording: 411 mL/s (physiological 300–600).",
  },
  {
    id: "blood_velocity",
    name: "Blood Velocity",
    unit: "m/s",
    type: TYPE.MODEL,
    source: "Continuity equation",
    formula: "v = Q / A,  A = π(D/2)²,  D = 2.5 cm",
    formulaFn: p => {
      const pp = p.sbp - p.dbp
      const sv = Math.min(Math.max(pp * 1.72, 5), 200)
      const co = Math.min(Math.max((sv * p.bpm) / 1000, 0.3), 20)
      return parseFloat(Math.min(Math.max((co / 1000 / 60) / 4.9087e-4, 0), 5).toFixed(3))
    },
    backendKey: "blood_velocity",
    range: { lo: 0, hi: 1, warnLo: 0.1, warnHi: 0.25, label: "0.1–0.2 m/s (mean)" },
    tooltip: {
      what: "MEAN aortic blood flow velocity over the cardiac cycle.",
      why:  "Continuity: v = Q / A with A = π(D/2)², D = 2.5 cm aortic diameter. (A former empirical v ≈ CO/5 was ~6× too high — it coincided with PEAK systolic velocity, 1.0–1.7 m/s, not the mean.)",
      note: "True velocity requires Doppler ultrasound. Peak systolic velocity is several times the mean.",
    },
    expandable: false,
  },
  {
    id: "reynolds_number",
    name: "Reynolds Number",
    unit: "",
    type: TYPE.MODEL,
    source: "Hagen-Poiseuille / Navier-Stokes",
    formula: "Re = (ρ·v·D) / μ  ρ=1060, D=0.025m, μ=0.004",
    formulaFn: p => {
      const pp  = p.sbp - p.dbp
      const sv  = Math.min(Math.max(pp * 1.72, 5), 200)
      const co  = Math.min(Math.max((sv * p.bpm) / 1000, 0.3), 20)
      const vel = Math.min(Math.max((co / 1000 / 60) / 4.9087e-4, 0), 5)
      return parseFloat(((1060 * vel * 0.025) / 0.004).toFixed(1))
    },
    backendKey: "reynolds_number",
    range: { lo: 0, hi: 5000, warnLo: 0, warnHi: 1528, label: "< 1 528 (laminar)" },
    tooltip: {
      what: "Dimensionless ratio of inertial to viscous forces in MEAN aortic blood flow.",
      why:  "Computed from the physical mean velocity v = Q/A. Re < 2300 is laminar in a straight tube; the risk thresholds (1 528 / 2 377) are the former 9 000 / 14 000 divided by the exact 5.89× velocity correction, so classifications are unchanged.",
      note: "ρ = 1060 kg/m³ (blood density), D = 0.025 m (aortic diameter), μ = 0.004 Pa·s (blood viscosity). Pulsatile flow is transiently turbulent at peak systole even when the mean Re is laminar.",
    },
    expandable: true,
    detail: "Re = (ρ·v·D)/μ with v the mean aortic velocity. Healthy rest CO ≈ 5 L/min → Re ≈ 1 125 (laminar). Risk scoring: Low < 1 528, Moderate 1 528–2 377, High > 2 377.",
  },
  {
    id: "cardiac_phase",
    name: "Cardiac Phase",
    unit: "0–1",
    type: TYPE.CALC,
    source: "R-Peak Timestamps",
    formula: "φ = (t − t_Rpeak) / RR",
    formulaFn: p => parseFloat(Math.min(Math.max(p.cardiac_phase, 0), 1).toFixed(3)),
    backendKey: "cardiac_phase",
    range: { lo: 0, hi: 1, label: "0.0–1.0" },
    tooltip: {
      what: "Normalised position within the current cardiac cycle. 0 = R-peak (systole onset), 1 = next R-peak.",
      why:  "Used to drive the 3D heart animation and cardiac phase card.",
      note: "Resets to 0 at each detected R-peak.",
    },
    expandable: false,
  },
  {
    id: "spo2",
    name: "SpO₂",
    unit: "%",
    type: TYPE.SENSOR,
    source: "MAX30102 PPG Sensor",
    formula: "SpO₂ = (R_AC/R_DC) / (IR_AC/IR_DC) — Beer-Lambert",
    formulaFn: () => null,   // not in packet; sensor-only
    backendKey: null,
    range: { lo: 80, hi: 100, warnLo: 95, warnHi: 100, label: "95–100 %" },
    tooltip: {
      what: "Peripheral oxygen saturation — fraction of haemoglobin saturated with oxygen.",
      why:  "Measured by comparing red (660 nm) and infrared (940 nm) light absorption ratios.",
      note: "Not currently in the dataset. Displayed as a static 99% placeholder.",
    },
    expandable: false,
  },
]
