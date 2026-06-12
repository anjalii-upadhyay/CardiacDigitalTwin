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
    source: "Windkessel Model",
    formula: "SV = PP × C  (C = 1.5 mL/mmHg)",
    formulaFn: p => {
      const pp = p.sbp - p.dbp
      return parseFloat(Math.min(Math.max(pp * 1.5, 20), 200).toFixed(1))
    },
    backendKey: "stroke_volume",
    range: { lo: 20, hi: 200, warnLo: 55, warnHi: 100, label: "55–100 mL" },
    tooltip: {
      what: "Volume of blood ejected by the left ventricle per beat.",
      why:  "2-element Windkessel: SV ≈ PP × arterial compliance. Compliance C = 1.5 mL/mmHg is a standard aortic estimate.",
      note: "Normal resting SV: 60–100 mL.",
    },
    expandable: true,
    detail: "2-Element Windkessel Model: The aorta acts as an elastic reservoir (compliance C). During systole, SV is stored; during diastole it is released. SV ≈ PP × C where C = 1.5 mL/mmHg is the mean aortic compliance estimate from literature (Stergiopulos et al., 1999).",
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
      const sv = Math.min(Math.max(pp * 1.5, 20), 200)
      return parseFloat(Math.min(Math.max((sv * p.bpm) / 1000, 1), 20).toFixed(2))
    },
    backendKey: "cardiac_output",
    range: { lo: 1, hi: 20, warnLo: 4, warnHi: 8, label: "4–8 L/min" },
    tooltip: {
      what: "Total volume of blood pumped by the heart per minute.",
      why:  "CO = SV × HR is the fundamental cardiac output equation.",
      note: "CO < 4 L/min at rest may indicate heart failure.",
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
      const sv  = Math.min(Math.max(pp * 1.5, 20), 200)
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
    source: "SBP-based estimation",
    formula: "PTT = 250 − 0.5 × (SBP − 120)",
    formulaFn: p => parseFloat(Math.min(Math.max(250 - 0.5 * (p.sbp - 120), 100), 300).toFixed(1)),
    backendKey: "ptt",
    range: { lo: 100, hi: 300, warnLo: 150, warnHi: 250, label: "150–250 ms" },
    tooltip: {
      what: "Time for the pressure pulse to travel from the heart to a peripheral site.",
      why:  "Higher BP → stiffer arteries → faster pulse wave → shorter PTT. Estimated from SBP when PPG is unavailable.",
      note: "True PTT requires simultaneous ECG R-peak and PPG arrival time.",
    },
    expandable: false,
  },
  {
    id: "wall_stress",
    name: "Ventricular Wall Stress",
    unit: "mmHg-eq",
    type: TYPE.MODEL,
    source: "Laplace's Law",
    formula: "σ = (P × r) / (2h)  r=3cm, h=1cm",
    formulaFn: p => parseFloat(((p.abp * 3.0) / (2 * 1.0)).toFixed(1)),
    backendKey: "wall_stress",
    range: { lo: 0, hi: 400, warnLo: 0, warnHi: 250, label: "< 250 mmHg-eq" },
    tooltip: {
      what: "Mechanical stress on the ventricular wall during contraction.",
      why:  "Laplace's Law for a thick-walled sphere: σ = P·r / 2h. Elevated wall stress increases myocardial O₂ demand.",
      note: "r = 3.0 cm (mean LV radius), h = 1.0 cm (wall thickness) — standard adult estimates.",
    },
    expandable: true,
    detail: "Laplace's Law (thick-walled sphere): σ = (P × r) / (2h). P = transmural pressure (ABP used as surrogate). r = 3.0 cm mean LV end-diastolic radius. h = 1.0 cm mean wall thickness. These are population-mean values from cardiac MRI studies (Maceira et al., 2006).",
  },
  // {
  //   id: "blood_flow",
  //   name: "Blood Flow",
  //   unit: "mL/s",
  //   type: TYPE.MODEL,
  //   source: "2-Element Windkessel",
  //   formula: "Q = P/R + C·(dP/dt)  R=1, C=1.5",
  //   formulaFn: p => {
  //     // The backend sends dpdt (mmHg/s) in every packet — the exact value it
  //     // used when computing blood_flow. Using it here makes the recomputation
  //     // deterministic: frontend and backend run the identical arithmetic.
  //     // No browser timing, no prevAbp estimation, no jitter.
  //     const R    = 1.0   // mmHg·s/mL — peripheral vascular resistance
  //     const C    = 1.5   // mL/mmHg  — aortic arterial compliance
  //     const dpdt = p.dpdt ?? 0
  //     const Q    = (p.abp / R) + (C * dpdt)
  //     return parseFloat(Math.min(Math.max(Q, 0), 500).toFixed(2))
  //   },
  //   backendKey: "blood_flow",
  //   range: { lo: 0, hi: 500, warnLo: 50, warnHi: 300, label: "50–300 mL/s" },
  //   tooltip: {
  //     what: "Instantaneous volumetric blood flow rate in the aorta.",
  //     why:  "2-Element Windkessel: Q = P/R + C·dP/dt. The resistive term (P/R) models steady Poiseuille flow; the capacitive term (C·dP/dt) models aortic wall elasticity.",
  //     note: "dP/dt is computed by the backend at 125 Hz (dt = 0.008 s) and sent in every packet as the 'dpdt' field, making frontend recomputation exact.",
  //   },
  //   expandable: true,
  //   detail: "2-Element Windkessel: Q = P/R + C·(dP/dt). R = 1.0 mmHg·s/mL (peripheral vascular resistance). C = 1.5 mL/mmHg (arterial compliance). dP/dt = (ABPₙ − ABPₙ₋₁) / 0.008 s, computed by the backend and forwarded in the packet. The capacitive term dominates during rapid pressure changes (systolic upstroke/diastolic runoff).",
  // },
  {
    id: "blood_velocity",
    name: "Blood Velocity",
    unit: "m/s",
    type: TYPE.MODEL,
    source: "CO-based aortic scaling",
    formula: "v = CO / 5  (empirical aortic scaling)",
    formulaFn: p => {
      const pp = p.sbp - p.dbp
      const sv = Math.min(Math.max(pp * 1.5, 20), 200)
      const co = Math.min(Math.max((sv * p.bpm) / 1000, 1), 20)
      return parseFloat(Math.min(Math.max(co / 5.0, 0), 5).toFixed(3))
    },
    backendKey: "blood_velocity",
    range: { lo: 0, hi: 5, warnLo: 0.3, warnHi: 2.0, label: "0.3–2.0 m/s" },
    tooltip: {
      what: "Mean aortic blood flow velocity.",
      why:  "Empirical scaling: v ≈ CO / 5. Derived from typical aortic cross-section and CO relationship.",
      note: "True velocity requires Doppler ultrasound. This is a model estimate.",
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
      const sv  = Math.min(Math.max(pp * 1.5, 20), 200)
      const co  = Math.min(Math.max((sv * p.bpm) / 1000, 1), 20)
      const vel = Math.min(Math.max(co / 5.0, 0), 5)
      return parseFloat(((1060 * vel * 0.025) / 0.004).toFixed(1))
    },
    backendKey: "reynolds_number",
    range: { lo: 0, hi: 20000, warnLo: 0, warnHi: 9000, label: "< 9 000 (laminar)" },
    tooltip: {
      what: "Dimensionless ratio of inertial to viscous forces in aortic blood flow.",
      why:  "Re > 4000 in a straight tube indicates turbulent flow. Calibrated thresholds used here account for the empirical velocity estimate.",
      note: "ρ = 1060 kg/m³ (blood density), D = 0.025 m (aortic diameter), μ = 0.004 Pa·s (blood viscosity).",
    },
    expandable: true,
    detail: "Re = (ρ·v·D)/μ. Laminar flow Re < 2300 (straight tube theory). Turbulent onset Re > 4000. Thresholds in this system are recalibrated to the empirical CO/5 velocity estimate: Low < 9000, Moderate 9000–13000, High > 13000.",
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
