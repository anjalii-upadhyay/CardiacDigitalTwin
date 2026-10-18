// PredictionPanel.jsx — Throttled 10-min prediction + priority-ordered physio explanation
import React, { memo } from 'react'

// ── Prediction engine ────────────────────────────────────────────────────────
function buildPredictions(sbp, bpm, wallStress, reynolds, spo2, cardiacOutput) {
  const p = []
  if (sbp > 150)             p.push({ icon: '⚠️', text: 'Moderate Hypertension Risk',          sev: 'orange' })
  if (wallStress > 180)      p.push({ icon: '💢', text: 'Elevated Ventricular Workload',        sev: 'orange' })
  if (reynolds > 4000)       p.push({ icon: '🌀', text: 'Possible Turbulent Flow',              sev: 'yellow' })
  if (sbp > 140 && bpm > 90) p.push({ icon: '🩸', text: 'Increased Clot Risk',                 sev: 'red'    })
  if (bpm > 110)             p.push({ icon: '💓', text: 'Sustained Tachycardia Risk',           sev: 'red'    })
  if (spo2 < 93)             p.push({ icon: '💨', text: 'Hypoxia Risk if Trend Continues',      sev: 'red'    })
  if (cardiacOutput < 3)     p.push({ icon: '📉', text: 'Low Cardiac Output — Monitor Closely', sev: 'orange' })
  if (p.length === 0)        p.push({ icon: '✅', text: 'Stable — No Immediate Risk Predicted', sev: 'green'  })
  return p
}

const SEV = {
  red:    'bg-red-900/30    border-red-700/40    text-red-300',
  orange: 'bg-orange-900/30 border-orange-700/40 text-orange-300',
  yellow: 'bg-yellow-900/25 border-yellow-700/40 text-yellow-300',
  green:  'bg-green-900/20  border-green-700/40  text-green-300',
}

// ── Priority-ordered explanation engine ─────────────────────────────────────
// Returns a single most-important explanation string, stable unless threshold changes
function topExplanation(sbp, ptt, reynolds, cardiacOutput, wallStress, spo2) {
  if (reynolds > 5000) return 'Elevated Reynolds number may indicate turbulent blood flow.'
  if (sbp > 160)       return 'Critically high systolic pressure — severe ventricular overload.'
  if (sbp > 140)       return 'High systolic pressure is increasing ventricular workload.'
  if (wallStress > 200) return 'Ventricular wall stress is high — Laplace law indicates increased O₂ demand.'
  if (spo2 < 92)       return 'Oxygen saturation critically low — monitor respiratory status immediately.'
  if (spo2 < 95)       return 'Oxygen saturation is below optimal — monitor respiratory status.'
  if (ptt < 150)       return 'Short pulse transit time suggests elevated arterial stiffness.'
  if (ptt < 200)       return 'Pulse transit time suggests moderate arterial stiffness.'
  if (cardiacOutput < 4) return 'Cardiac output is below normal — possible reduced perfusion.'
  return 'All parameters within normal range — cardiac output and flow appear stable.'
}

function buildExplanations(sbp, ptt, reynolds, cardiacOutput, wallStress, spo2) {
  const lines = []

  // Priority line first
  lines.push(topExplanation(sbp, ptt, reynolds, cardiacOutput, wallStress, spo2))

  // Secondary lines only if different from primary
  const sbpLine = sbp > 140
    ? 'High systolic pressure is increasing ventricular workload.'
    : 'Systolic pressure is within acceptable range.'
  if (sbpLine !== lines[0]) lines.push(sbpLine)

  const pttLine = ptt < 150
    ? 'Short pulse transit time suggests elevated arterial stiffness.'
    : ptt < 200
      ? 'Pulse transit time suggests moderate arterial stiffness.'
      : 'Pulse transit time indicates normal arterial compliance.'
  if (pttLine !== lines[0]) lines.push(pttLine)

  const reLine = reynolds > 4000
    ? 'Elevated Reynolds number may indicate turbulent blood flow.'
    : 'Blood flow appears laminar — Reynolds number within safe range.'
  if (reLine !== lines[0]) lines.push(reLine)

  const coLine = cardiacOutput >= 4 && cardiacOutput <= 8
    ? 'Current cardiac output is within normal range.'
    : cardiacOutput < 4
      ? 'Cardiac output is below normal — possible reduced perfusion.'
      : 'Cardiac output is elevated — consistent with high heart rate.'
  if (coLine !== lines[0]) lines.push(coLine)

  return lines
}

// ── PredictionPanel — memo so it only re-renders when throttled props change ─
export const PredictionPanel = memo(function PredictionPanel({
  sbp, bpm, wallStress, reynolds, spo2, cardiacOutput,
}) {
  const preds = buildPredictions(sbp, bpm, wallStress, reynolds, spo2, cardiacOutput)
  return (
    <div className="glass-card border border-gray-800 rounded-xl p-4 shadow-md">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">🔮</span>
        <span className="text-xs text-gray-400 uppercase tracking-wider">Predicted 10-Min Outcome</span>
      </div>
      <div className="space-y-2">
        {preds.map((p, i) => (
          <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${SEV[p.sev]}`}>
            <span className="text-sm">{p.icon}</span>
            <span className="text-xs font-medium">{p.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
})

// ── PhysioExplainer — memo, only re-renders on throttled props ───────────────
export const PhysioExplainer = memo(function PhysioExplainer({
  sbp, ptt, reynolds, cardiacOutput, wallStress, spo2,
}) {
  const lines = buildExplanations(sbp, ptt, reynolds, cardiacOutput, wallStress, spo2)
  return (
    <div className="glass-card border border-gray-800 rounded-xl p-4 shadow-md">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">🧠</span>
        <span className="text-xs text-gray-400 uppercase tracking-wider">Live Physiological Explanation</span>
      </div>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`text-xs mt-0.5 shrink-0 ${i === 0 ? 'text-orange-400' : 'text-sky-500'}`}>●</span>
            <span className={`text-xs leading-relaxed ${i === 0 ? 'text-gray-200 font-medium' : 'text-gray-400'}`}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
})
