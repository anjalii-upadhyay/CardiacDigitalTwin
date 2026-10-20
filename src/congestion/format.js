// Shared helpers for the congestion dashboard. No clinical thresholds live here:
// cut-offs and error ranges come from public/data/patients.json (made by hf_twin/dashboard/export_data.py).

export const fmt = (v, d = 1) => (v == null || Number.isNaN(Number(v)) ? '–' : Number(v).toFixed(d))
export const signed = (v, d = 1) => (v == null ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`)

export const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }

export const label = (p) => `${p.patient} · visit ${p.visit}`

// Congestion status keys ('uncertain' is shown as "Borderline"; the key stays because the stream server expects it)
export const CONGESTION = {
  congested:     { key: 'crit', label: 'Congested' },
  uncertain:     { key: 'unc',  label: 'Borderline' },
  not_congested: { key: 'good', label: 'Not congested' },
}
export const PERFUSION = {
  low:     { key: 'crit', label: 'Low perfusion' },
  normal:  { key: 'good', label: 'Normal perfusion' },
  unknown: { key: 'unc',  label: 'Perfusion unknown' },
}

// The one status the doctor sees: the same rule the recommendation step uses (hf_twin/recommendation/actions.py,
// congestion_status), with its thresholds read from recommendations.json _meta.rules.
export function bandState(chance, range, rules) {
  const [lo, hi] = range
  if (lo > rules.wedge_congestion_mmHg || chance >= rules.congested_chance) return 'congested'
  if (chance <= rules.not_congested_chance || hi <= rules.wedge_congestion_mmHg) return 'not_congested'
  return 'uncertain'
}

export const STATUS_INFO = (rules) => rules
  ? `Congested: chance ≥ ${Math.round(rules.congested_chance * 100)}% or the whole 80% range above ${rules.wedge_congestion_mmHg} mmHg. `
    + `Not congested: chance ≤ ${Math.round(rules.not_congested_chance * 100)}% or the whole range at or below ${rules.wedge_congestion_mmHg}. `
    + 'Otherwise borderline. Same rule the recommendation uses.'
  : 'Congested only when the whole 80% range of the estimate is above the cut-off.'

// Same rule as congestion_state.py, applied to a simulated value with the patient's own exported range offsets.
export function classify(estimate, offsets, cutoff) {
  const lo = estimate + offsets.lower
  const hi = estimate + offsets.upper
  const state = lo > cutoff ? 'congested' : hi <= cutoff ? 'not_congested' : 'uncertain'
  return { state, range: [lo, hi] }
}
// Chance of congestion at a wedge value, from the patient's own leave-one-patient-out curve (patients.json).
export const chanceAt = (curve, wedge) => 1 / (1 + Math.exp(-(curve.slope * wedge + curve.intercept)))

export const offsetsOf = (c) => ({ lower: c.range_mmHg[0] - c.estimate_mmHg, upper: c.range_mmHg[1] - c.estimate_mmHg })


// Inputs shown in "What went into this estimate" (selected; the model uses 20)
export const PATCH_INPUTS = [
  ['hr_bpm', 'Heart rate', 'bpm', 0],
  ['rmssd_ms', 'Beat-to-beat change (RMSSD)', 'ms', 0],
  ['sdnn_ms', 'Heart-rate spread (SDNN)', 'ms', 0],
  ['irregular_share', 'Irregular beats', '%', 1, 100],
  ['scg_amp_mg', 'Heart vibration strength', 'mg', 1],
  ['scg_t1_ms', 'Time to first vibration peak', 'ms', 0],
  ['scg_t2_minus_t1_ms', 'Gap between vibration peaks', 'ms', 0],
  ['breath_rate_per_min', 'Breathing rate', '/min', 0],
  ['breath_depth_mg', 'Breathing depth', 'mg', 1],
  ['tilt_deg', 'Body tilt (90° = lying flat)', '°', 0],
  ['skin_temp_c', 'Skin temperature', '°C', 1],
]
export const RECORD_INPUTS = [
  ['age', 'Age', 'y', 0],
  ['bmi', 'Body-mass index', '', 1],
  ['sbp', 'Systolic BP', 'mmHg', 0],
  ['dbp', 'Diastolic BP', 'mmHg', 0],
]
export const inputValue = (p, k) => (k in p.features && k !== 'bmi' ? p.features[k] : p.record[k] ?? p.features[k])

export function cohortStats(patients) {
  const stats = {}
  ;[...PATCH_INPUTS, ...RECORD_INPUTS].forEach(([k]) => {
    const v = patients.map((p) => inputValue(p, k)).filter((x) => x != null && x >= 0).sort((a, b) => a - b)
    const q = (f) => { const i = (v.length - 1) * f, lo = Math.floor(i); return v[lo] + (v[Math.ceil(i)] - v[lo]) * (i - lo) }
    stats[k] = { min: v[0], max: v[v.length - 1], q1: q(0.25), med: q(0.5), q3: q(0.75) }
  })
  return stats
}

export const rangeText = (r) => `${fmt(Math.max(0, r[0]))} to ${fmt(r[1])} mmHg`
