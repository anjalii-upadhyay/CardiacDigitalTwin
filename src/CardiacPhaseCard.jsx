// CardiacPhaseCard.jsx — Cardiac cycle phase with step timeline + glassmorphism
import React from 'react'

const PHASES = [
  { range: [0.0, 0.2], name: 'Atrial Systole',         short: 'A-Sys',  desc: 'Atria contract, pushing blood into ventricles.',         color: 'text-sky-300',     bar: 'bg-sky-500',     dot: 'bg-sky-400'     },
  { range: [0.2, 0.4], name: 'Ventricular Contraction', short: 'V-Con',  desc: 'Ventricles begin contracting, pressure builds rapidly.',  color: 'text-yellow-300',  bar: 'bg-yellow-500',  dot: 'bg-yellow-400'  },
  { range: [0.4, 0.6], name: 'Ventricular Ejection',    short: 'V-Ej',   desc: 'Blood ejected into aorta and pulmonary artery.',         color: 'text-red-300',     bar: 'bg-red-500',     dot: 'bg-red-400'     },
  { range: [0.6, 0.8], name: 'Relaxation',              short: 'Relax',  desc: 'Ventricles relax, valves close, pressure drops.',        color: 'text-purple-300',  bar: 'bg-purple-500',  dot: 'bg-purple-400'  },
  { range: [0.8, 1.0], name: 'Ventricular Filling',     short: 'Fill',   desc: 'Ventricles fill passively with blood from atria.',       color: 'text-emerald-300', bar: 'bg-emerald-500', dot: 'bg-emerald-400' },
]

function getPhaseIndex(p) {
  const idx = PHASES.findIndex(ph => p >= ph.range[0] && p < ph.range[1])
  return idx === -1 ? 4 : idx
}

export default function CardiacPhaseCard({ cardiacPhase = 0 }) {
  const idx   = getPhaseIndex(cardiacPhase)
  const phase = PHASES[idx]
  const pct   = Math.round(cardiacPhase * 100)

  return (
    <div className="glass-card border border-gray-800 rounded-xl p-4 shadow-md">
      <div className="text-xs text-gray-400 uppercase tracking-wider mb-3">Cardiac Phase</div>

      {/* Continuous progress bar */}
      <div className="w-full h-1.5 bg-gray-800 rounded-full mb-4 overflow-hidden">
        <div className={`h-full rounded-full phase-bar ${phase.bar}`} style={{ width: `${pct}%` }} />
      </div>

      {/* Step indicators */}
      <div className="flex justify-between mb-4">
        {PHASES.map((ph, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className={`w-2 h-2 rounded-full transition-all duration-200 ${
              i === idx ? `${ph.dot} ring-2 ring-white/30 scale-125` : 'bg-gray-700'
            }`} />
            <span className={`text-[9px] ${i === idx ? ph.color : 'text-gray-600'}`}>{ph.short}</span>
          </div>
        ))}
      </div>

      {/* Active phase name + description */}
      <div className={`text-sm font-bold ${phase.color} mb-1`}>{phase.name}</div>
      <div className="text-xs text-gray-400 leading-relaxed">{phase.desc}</div>
      <div className="text-xs text-gray-600 mt-2">Position: {pct}%</div>
    </div>
  )
}
