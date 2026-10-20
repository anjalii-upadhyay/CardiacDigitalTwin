// HeartView: the dashboard's heart panel. It holds two things:
//   1. the 3D slot (<HeartCanvas>, owned by the teammate doing model loading), and
//   2. a small 2D lung map tinted by congestion state, with captions, which belongs to the dashboard.
// See HeartCanvas.jsx for the props the 3D slot receives.
import React from 'react'
import HeartCanvas from './HeartCanvas'
import { CONGESTION, fmt } from './format'
import { Ev } from './ui'

function LungMap({ wedge, stateKey, hr }) {
  const op = Math.max(0.12, Math.min(0.7, 0.12 + ((wedge - 8) / 24) * 0.58)).toFixed(2)
  const fill = stateKey === 'unc' ? 'var(--ink-3)' : `var(--${stateKey})`
  return (
    <svg viewBox="0 0 200 170" className="lungmap" role="img" aria-label={`Lungs shaded by wedge pressure ${fmt(wedge)} mmHg`}>
      <path className="torso" d="M62 10 Q100 0 138 10 L170 40 Q180 100 162 164 L38 164 Q20 100 30 40 Z" />
      <path className="lung" style={{ fill, fillOpacity: op }} d="M57 44 Q70 30 89 38 L91 124 Q70 135 54 121 Q44 83 57 44Z" />
      <path className="lung" style={{ fill, fillOpacity: op }} d="M143 44 Q130 30 111 38 L109 124 Q130 135 146 121 Q156 83 143 44Z" />
      <g className="beat" style={{ '--dur': `${hr ? 60 / hr : 1}s` }}>
        <path className="heart-o" style={{ fill: 'var(--crit)', fillOpacity: 0.55 }} d="M100 92 C91 78 72 84 76 102 C80 117 97 128 104 137 C111 128 129 116 131 100 C132 83 113 78 100 92Z" />
      </g>
    </svg>
  )
}

export default function HeartView({ patient, wedge, state, simulated = false }) {
  const s = CONGESTION[state]
  const sig = patient.signals
  const heart = {
    patientId: patient.id, beatsS: sig.beats_s, sliceS: sig.slice_s, hrBpm: patient.features.hr_bpm,
    state, wedgeMmHg: wedge, raMmHg: patient.measured.ra, simulated,
  }
  return (
    <div className="hv">
      <div className="hv-3d">
        <HeartCanvas {...heart} />
        <div className="hv-tag">Beats on real patch R-peaks · {fmt(patient.features.hr_bpm, 0)} bpm <Ev k="R" /></div>
      </div>
      <div className="hv-side">
        <LungMap wedge={wedge} stateKey={s.key} hr={patient.features.hr_bpm} />
        <div className="capt">
          <div><span className="swatch" style={{ background: s.key === 'unc' ? 'var(--ink-3)' : `var(--${s.key})` }} />
            <span>Lungs: <b>{simulated ? 'simulated' : 'estimated'} wedge {fmt(wedge)} mmHg</b>, {s.label.toLowerCase()} <Ev k={simulated ? 'S' : 'R'} /></span></div>
          <div><span className="swatch" style={{ background: 'var(--ink-3)', opacity: 0.5 }} />
            <span>Right heart: <b>measured {fmt(patient.measured.ra, 0)} mmHg</b> (catheter only, no estimate) <Ev k="R" /></span></div>
        </div>
      </div>
    </div>
  )
}
