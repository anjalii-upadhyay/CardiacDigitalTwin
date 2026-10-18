// RiskPanel.jsx — Color-coded cardiovascular risk with reasons + glassmorphism glow
import React from 'react'

const LEVEL = {
  High:     { glow: 'glow-red',    border: 'border-red-500/60',    text: 'text-red-300',    bg: 'bg-red-900/30',    dot: 'bg-red-400',    badge: 'bg-red-900/60 text-red-200'    },
  Moderate: { glow: 'glow-orange', border: 'border-orange-500/60', text: 'text-orange-300', bg: 'bg-orange-900/25', dot: 'bg-orange-400', badge: 'bg-orange-900/60 text-orange-200' },
  Low:      { glow: 'glow-green',  border: 'border-green-600/50',  text: 'text-green-300',  bg: 'bg-green-900/20',  dot: 'bg-green-400',  badge: 'bg-green-900/50 text-green-200'  },
}

function buildReasons(sbp, wallStress, reynolds, bpm, spo2) {
  const r = []
  if (sbp != null && sbp > 160)        r.push({ icon: '🩸', msg: `SBP critically high: ${Math.round(sbp)} mmHg` })
  else if (sbp != null && sbp > 140)   r.push({ icon: '⚠️', msg: `SBP elevated: ${Math.round(sbp)} mmHg` })

  // Thresholds mirror the backend risk engine (kPa): > 37.3 high, > 26.7 mildly elevated.
  if (wallStress != null && wallStress > 37.3) r.push({ icon: '💢', msg: `Wall stress high: ${Number(wallStress).toFixed(1)} kPa` })
  else if (wallStress != null && wallStress > 26.7) r.push({ icon: '⚠️', msg: `Wall stress elevated: ${Number(wallStress).toFixed(1)} kPa` })

  // Mean-flow Reynolds (v = Q/A); thresholds mirror the backend: > 2377 turbulent, > 1528 elevated.
  if (reynolds != null && reynolds > 2377)  r.push({ icon: '🌀', msg: `Reynolds high: ${Math.round(reynolds)} (turbulent)` })
  else if (reynolds != null && reynolds > 1528) r.push({ icon: '〰️', msg: `Reynolds elevated: ${Math.round(reynolds)}` })

  if (bpm != null && bpm > 100)        r.push({ icon: '💓', msg: `Tachycardia: ${Math.round(bpm)} BPM` })
  else if (bpm != null && bpm < 60)    r.push({ icon: '💓', msg: `Bradycardia: ${Math.round(bpm)} BPM` })

  if (spo2 != null && spo2 < 92)       r.push({ icon: '💨', msg: `Low SpO₂: ${Math.round(spo2)}%` })

  if (r.length === 0)   r.push({ icon: '✅', msg: 'All parameters within normal range' })
  return r
}

// No fabricated defaults: anything the stream hasn't provided is null and simply produces no reason.
export default function RiskPanel({ riskLevel = 'Low', sbp = null, wallStress = null, reynolds = null, bpm = null, spo2 = null }) {
  const c = LEVEL[riskLevel] ?? LEVEL.Low
  const reasons = buildReasons(sbp, wallStress, reynolds, bpm, spo2)

  return (
    <div className={`glass-card ${c.glow} border ${c.border} rounded-xl p-4 shadow-md`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${c.dot} animate-pulse`} />
          <span className="text-xs text-gray-400 uppercase tracking-wider">Risk Level</span>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.badge}`}>
          {riskLevel === 'High' ? '🔴' : riskLevel === 'Moderate' ? '🟡' : '🟢'} {riskLevel}
        </span>
      </div>

      {/* Big level text */}
      <div className={`text-3xl font-extrabold ${c.text} mb-3 tracking-tight`}>{riskLevel}</div>

      {/* Divider */}
      <div className="border-t border-gray-700/50 mb-3" />

      {/* Reasons */}
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Reasons</div>
      <div className="space-y-1.5">
        {reasons.map((r, i) => (
          <div key={i} className="flex items-start gap-2 slide-in" style={{ animationDelay: `${i * 40}ms` }}>
            <span className="text-sm leading-none mt-0.5">{r.icon}</span>
            <span className="text-xs text-gray-300 leading-relaxed">{r.msg}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
