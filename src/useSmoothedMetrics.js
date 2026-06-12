// useSmoothedMetrics.js
// 3-stage smoothing: raw → exponential smooth → display (time-gated interpolation)
// Charts stay real-time; only numeric cards use smoothed display values.

import { useRef, useEffect, useState, useCallback } from 'react'

// ── Smoothing constants ───────────────────────────────────────────────────────
const ALPHA_NORMAL   = 0.15   // weight for new raw value  (normal metrics)
const ALPHA_STABLE   = 0.08   // weight for new raw value  (volatile metrics)
const DISPLAY_NORMAL = 2000   // ms between display updates (normal)
const DISPLAY_STABLE = 3000   // ms between display updates (volatile)
const RISK_HOLD_MS   = 5000   // ms a risk level must persist before switching
const EXPLAIN_HOLD   = 4000   // ms an explanation must persist before switching

// Metrics that need stronger smoothing
const STABLE_METRICS = new Set(['wallStress', 'reynolds', 'blockage', 'bloodVelocity', 'bloodFlow'])

// ── Single metric smoother ────────────────────────────────────────────────────
function makeSmoother(isStable) {
  return {
    smoothed:    null,
    display:     null,
    lastUpdate:  0,
    alpha:       isStable ? ALPHA_STABLE   : ALPHA_NORMAL,
    interval:    isStable ? DISPLAY_STABLE : DISPLAY_NORMAL,
  }
}

// ── Risk level debounce ───────────────────────────────────────────────────────
function makeRiskDebounce() {
  return { current: 'Low', candidate: 'Low', since: 0 }
}

// ── Explanation debounce ──────────────────────────────────────────────────────
function makeExplainDebounce() {
  return { current: [], candidate: [], since: 0 }
}

// ── Main hook ─────────────────────────────────────────────────────────────────
export function useSmoothedMetrics() {
  const smoothers = useRef({
    bpm:           makeSmoother(false),
    sbp:           makeSmoother(false),
    dbp:           makeSmoother(false),
    map:           makeSmoother(false),
    pulsePressure: makeSmoother(false),
    strokeVolume:  makeSmoother(false),
    cardiacOutput: makeSmoother(false),
    ptt:           makeSmoother(false),
    wallStress:    makeSmoother(true),
    reynolds:      makeSmoother(true),
    blockage:      makeSmoother(true),
    bloodVelocity: makeSmoother(true),
    bloodFlow:     makeSmoother(true),
  })

  const riskDebounce   = useRef(makeRiskDebounce())
  const explainDebounce = useRef(makeExplainDebounce())

  // Display state — only these trigger re-renders
  const [display, setDisplay] = useState({
    bpm: 72, sbp: 120, dbp: 80, map: 93,
    pulsePressure: 40, strokeVolume: 70, cardiacOutput: 5.0,
    ptt: 200, wallStress: 150, reynolds: 1200,
    blockage: 0, bloodVelocity: 0, bloodFlow: 0,
    riskLevel: 'Low', explanations: [],
    _raw: {},   // per-metric { current, avg, trend, delta, spark } for MetricsPanel
  })

  // ── Push new raw values from websocket ────────────────────────────────────
  const push = useCallback((raw, computedBlockage, rawRisk, rawExplanations) => {
    const now = Date.now()
    const s   = smoothers.current
    const updates = {}

    // Step 1 + 2: exponential smooth each metric
    const keys = Object.keys(s)
    const rawMap = {
      bpm:           raw.bpm,
      sbp:           raw.sbp,
      dbp:           raw.dbp,
      map:           raw.map,
      pulsePressure: raw.pulsePressure,
      strokeVolume:  raw.strokeVolume,
      cardiacOutput: raw.cardiacOutput,
      ptt:           raw.ptt,
      wallStress:    raw.wallStress,
      reynolds:      raw.reynolds,
      blockage:      computedBlockage,
      bloodVelocity: raw.bloodVelocity,
      bloodFlow:     raw.bloodFlow,
    }

    const rawObjects = {}

    keys.forEach(key => {
      const sm  = s[key]
      const val = rawMap[key]
      if (val == null || isNaN(val)) return

      // Initialise on first value
      if (sm.smoothed === null) { sm.smoothed = val; sm.display = val; sm.spark = [] }

      // Stage 2: exponential smooth
      sm.smoothed = sm.smoothed * (1 - sm.alpha) + val * sm.alpha

      // Accumulate spark history (last 20 smoothed values)
      sm.spark = [...(sm.spark ?? []), parseFloat(sm.smoothed.toFixed(1))].slice(-20)

      // Stage 3: time-gated display interpolation
      if (now - sm.lastUpdate >= sm.interval) {
        sm.display    = sm.display + (sm.smoothed - sm.display) * 0.1
        sm.lastUpdate = now
        updates[key]  = parseFloat(sm.display.toFixed(key === 'cardiacOutput' ? 2 : 1))
      }

      // Build per-metric object for MetricsPanel sparklines/trends
      const cur   = parseFloat(sm.display.toFixed(key === 'cardiacOutput' ? 2 : 1))
      const spark = sm.spark
      const avg   = spark.length
        ? parseFloat((spark.reduce((a, x) => a + x, 0) / spark.length).toFixed(1))
        : cur
      const prev2 = spark.length >= 3
        ? spark.slice(-3, -1).reduce((a, x) => a + x, 0) / 2
        : avg
      const delta = parseFloat((cur - prev2).toFixed(1))
      rawObjects[key] = {
        current: cur,
        avg,
        trend: Math.abs(delta) < 0.5 ? '→' : delta > 0 ? '↑' : '↓',
        delta,
        spark: [...spark],
      }
    })

    if (Object.keys(rawObjects).length > 0) updates._raw = rawObjects

    // ── Risk level debounce ──────────────────────────────────────────────────
    const rd = riskDebounce.current
    if (rawRisk !== rd.candidate) { rd.candidate = rawRisk; rd.since = now }
    if (rawRisk === rd.candidate && now - rd.since >= RISK_HOLD_MS && rawRisk !== rd.current) {
      rd.current    = rawRisk
      updates.riskLevel = rawRisk
    }

    // ── Explanation debounce ─────────────────────────────────────────────────
    const ed = explainDebounce.current
    const newSig = rawExplanations.join('|')
    const curSig = ed.candidate.join('|')
    if (newSig !== curSig) { ed.candidate = rawExplanations; ed.since = now }
    if (newSig === curSig && now - ed.since >= EXPLAIN_HOLD && newSig !== ed.current.join('|')) {
      ed.current         = rawExplanations
      updates.explanations = rawExplanations
    }

    if (Object.keys(updates).length > 0) {
      setDisplay(prev => ({ ...prev, ...updates }))
    }
  }, [])

  return { display, push }
}
