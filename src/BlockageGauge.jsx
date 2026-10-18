// BlockageGauge.jsx — Circular gauge showing blockage probability score
// Accepts pre-computed smoothed score from useSmoothedMetrics hook
import React from 'react'

export function computeBlockageScore(sbp, wallStress, reynolds, spo2) {
  const sbpScore    = Math.min(Math.max((sbp - 100) / 80, 0), 1)
  const stressScore = Math.min(Math.max((wallStress - 100) / 200, 0), 1)
  const reScore     = Math.min(Math.max((reynolds - 1000) / 5000, 0), 1)
  const spo2Score   = Math.min(Math.max((100 - spo2) / 20, 0), 1)
  return Math.round((sbpScore * 0.35 + stressScore * 0.30 + reScore * 0.20 + spo2Score * 0.15) * 100)
}

export default function BlockageGauge({ score = 0 }) {
  const label = score < 30 ? 'Low' : score < 60 ? 'Moderate' : 'High'
  const color = score < 30 ? '#22c55e' : score < 60 ? '#f97316' : '#ef4444'

  const R      = 40
  const cx     = 56
  const cy     = 56
  const circ   = 2 * Math.PI * R
  const arc    = (score / 100) * circ * 0.75
  const offset = circ * 0.25

  return (
    <div className="bg-[#0f1315] border border-gray-800 rounded-xl p-4 shadow-md flex flex-col items-center">
      <div className="text-xs text-gray-400 uppercase tracking-wider mb-3 self-start">Blockage Probability</div>
      <svg width="112" height="80" viewBox="0 0 112 80">
        {/* Background track */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#1f2937" strokeWidth="10"
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`}
          strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(135 ${cx} ${cy})`}
        />
        {/* Score arc — 1.5s transition so it never jumps */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${arc} ${circ - arc}`}
          strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(135 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 1.5s ease, stroke 1.5s ease' }}
        />
        <text x={cx} y={cy - 4} textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">{score}%</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill={color} fontSize="9">{label}</text>
      </svg>
      <div className="text-xs text-gray-500 mt-1 text-center">Based on SBP, Wall Stress,<br/>Reynolds &amp; SpO₂</div>
    </div>
  )
}
