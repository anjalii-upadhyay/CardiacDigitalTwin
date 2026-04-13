// MetricsPanel.jsx — Smoothed metrics with avg, trend arrow, and sparkline
import React from 'react'
import { Sparkline } from './useSmoothed'

const TREND_COLOR = { '↑': 'text-orange-400', '↓': 'text-sky-400', '→': 'text-gray-500' }

// m = { current, avg, trend, delta, spark }
function Row({ label, m, unit, color = 'text-emerald-400', sparkColor = '#34d399' }) {
  if (!m) return null
  const tc = TREND_COLOR[m.trend] ?? 'text-gray-500'
  return (
    <div className="metric-row px-1 py-2 border-b border-gray-800/60 transition-colors">
      {/* top line: label + trend + current */}
      <div className="flex justify-between items-baseline">
        <span className="text-gray-400 text-xs">{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className={`font-bold text-sm ${color}`}>{m.current}</span>
          {unit && <span className="text-gray-600 text-[10px]">{unit}</span>}
          <span className={`text-xs font-semibold ${tc}`}>{m.trend}</span>
        </div>
      </div>
      {/* bottom line: avg + sparkline */}
      <div className="flex justify-between items-center mt-0.5">
        <span className="text-[10px] text-gray-600">
          Avg: <span className="text-gray-500">{m.avg}{unit ? ` ${unit}` : ''}</span>
          {m.delta !== 0 && (
            <span className={`ml-1 ${tc}`}>
              {m.delta > 0 ? '+' : ''}{m.delta}
            </span>
          )}
        </span>
        <Sparkline data={m.spark} width={52} height={14} color={sparkColor} />
      </div>
    </div>
  )
}

export default function MetricsPanel({
  bpm = 72, sbp = 120, dbp = 80, spo2 = 98, riskLevel = 'Low',
  // smoothed metric objects from App
  mMap, mPP, mSV, mCO, mPTT, mWS, mRe, mBF, mBV,
}) {
  const ef = Math.max(50, Math.min(70, 60 + (72 - bpm) * 0.2)).toFixed(0)
  const riskColor = riskLevel === 'High' ? 'text-red-400'
                  : riskLevel === 'Moderate' ? 'text-orange-400'
                  : 'text-emerald-400'

  return (
    <div className="glass-card border border-gray-800 rounded-xl p-4 shadow-md">
      <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Cardiac Metrics</div>

      {/* Static vitals — these are already stable (BPM, SBP/DBP, SpO2) */}
      <div className="metric-row flex justify-between items-center px-1 py-1.5 border-b border-gray-800/60">
        <span className="text-gray-400 text-xs">Heart Rate</span>
        <span className={`font-bold text-sm ${bpm > 100 || bpm < 60 ? 'text-orange-400' : 'text-red-400'}`}>
          {bpm} <span className="text-gray-600 text-[10px]">BPM</span>
        </span>
      </div>
      <div className="metric-row flex justify-between items-center px-1 py-1.5 border-b border-gray-800/60">
        <span className="text-gray-400 text-xs">SBP / DBP</span>
        <span className={`font-bold text-sm ${sbp > 140 ? 'text-orange-400' : 'text-rose-400'}`}>
          {Math.round(sbp)}/{Math.round(dbp)} <span className="text-gray-600 text-[10px]">mmHg</span>
        </span>
      </div>
      <div className="metric-row flex justify-between items-center px-1 py-1.5 border-b border-gray-800/60">
        <span className="text-gray-400 text-xs">SpO₂</span>
        <span className={`font-bold text-sm ${spo2 < 92 ? 'text-red-400' : 'text-emerald-400'}`}>
          {Math.round(spo2)} <span className="text-gray-600 text-[10px]">%</span>
        </span>
      </div>
      <div className="metric-row flex justify-between items-center px-1 py-1.5 border-b border-gray-800/60">
        <span className="text-gray-400 text-xs">Ejection Fraction</span>
        <span className="font-bold text-sm text-emerald-400">
          {ef} <span className="text-gray-600 text-[10px]">%</span>
        </span>
      </div>
      <div className="metric-row flex justify-between items-center px-1 py-1.5 border-b border-gray-800/60">
        <span className="text-gray-400 text-xs">Risk Level</span>
        <span className={`font-bold text-sm ${riskColor}`}>{riskLevel}</span>
      </div>

      {/* Smoothed metrics with avg + trend + sparkline */}
      <Row label="MAP"            m={mMap}  unit="mmHg"    sparkColor="#34d399" />
      <Row label="Pulse Pressure" m={mPP}   unit="mmHg"    sparkColor="#818cf8" />
      <Row label="Stroke Volume"  m={mSV}   unit="mL"      sparkColor="#34d399" />
      <Row label="Cardiac Output" m={mCO}   unit="L/min"   color={mCO?.current < 4 ? 'text-orange-400' : 'text-emerald-400'} sparkColor={mCO?.current < 4 ? '#f97316' : '#34d399'} />
      <Row label="PTT"            m={mPTT}  unit="ms"      color="text-sky-400"    sparkColor="#38bdf8" />
      <Row label="Wall Stress"    m={mWS}   unit="mmHg-eq" color={mWS?.current > 180 ? 'text-orange-400' : 'text-emerald-400'} sparkColor={mWS?.current > 180 ? '#f97316' : '#34d399'} />
      <Row label="Reynolds No."   m={mRe}   unit=""        color={mRe?.current > 3500 ? 'text-orange-400' : 'text-emerald-400'} sparkColor={mRe?.current > 3500 ? '#f97316' : '#34d399'} />
      <Row label="Blood Flow"     m={mBF}   unit="mL/s"    sparkColor="#34d399" />
      <Row label="Blood Velocity" m={mBV}   unit="m/s"     sparkColor="#34d399" />

      {sbp > 140 && (
        <div className="mt-2 p-2 rounded bg-orange-900/30 border border-orange-700/50">
          <div className="text-xs text-orange-300 font-semibold">⚠ Elevated Ventricular Stress</div>
          <div className="text-xs text-gray-400">SBP {Math.round(sbp)} mmHg · Wall stress {mWS?.current}</div>
        </div>
      )}
    </div>
  )
}
