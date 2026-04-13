// ConditionSimulator.jsx — Demo preset buttons that temporarily override vitals
import React from 'react'

const PRESETS = [
  {
    label: 'Hypertension',
    icon:  '🩸',
    color: 'border-red-600/60    text-red-300    hover:bg-red-900/30',
    glow:  'sim-active-red',
    values: { sbp: 165, dbp: 100, bpm: 82, spo2: 97 },
  },
  {
    label: 'Tachycardia',
    icon:  '💓',
    color: 'border-orange-600/60 text-orange-300 hover:bg-orange-900/30',
    glow:  'sim-active-orange',
    values: { sbp: 128, dbp: 82, bpm: 130, spo2: 97 },
  },
  {
    label: 'Bradycardia',
    icon:  '🐢',
    color: 'border-yellow-600/60 text-yellow-300 hover:bg-yellow-900/30',
    glow:  'sim-active-yellow',
    values: { sbp: 105, dbp: 68, bpm: 45, spo2: 96 },
  },
  {
    label: 'Low Oxygen',
    icon:  '💨',
    color: 'border-purple-600/60 text-purple-300 hover:bg-purple-900/30',
    glow:  'sim-active-purple',
    values: { sbp: 118, dbp: 76, bpm: 88, spo2: 88 },
  },
  {
    label: 'Arrhythmia',
    icon:  '〰️',
    color: 'border-pink-600/60   text-pink-300   hover:bg-pink-900/30',
    glow:  'sim-active-pink',
    values: { sbp: 122, dbp: 79, bpm: null, spo2: 95 },  // null bpm = irregular
  },
]

export default function ConditionSimulator({ onSimulate, onReset, active }) {
  return (
    <div className="glass-card border border-gray-800 rounded-xl p-4 shadow-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">⚡</span>
          <span className="text-xs text-gray-400 uppercase tracking-wider">Condition Simulator</span>
        </div>
        {active && (
          <button
            onClick={onReset}
            className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-2 py-0.5 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => onSimulate(p.values, p.label)}
            className={`flex items-center gap-1.5 text-xs border rounded-lg px-3 py-2 transition-all duration-150 ${p.color} ${
              active === p.label ? `ring-1 ring-white/20 brightness-125 ${p.glow}` : ''
            }`}
          >
            <span>{p.icon}</span>
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      {active && (
        <div className="mt-2 text-xs text-gray-500 text-center">
          Simulating: <span className="text-gray-300 font-medium">{active}</span>
        </div>
      )}
    </div>
  )
}
