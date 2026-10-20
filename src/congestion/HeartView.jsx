// HeartView: the dashboard's heart panel, holding the Unity heart twin slot (<HeartCanvas>).
// See HeartCanvas.jsx for the props the slot receives.
import React from 'react'
import HeartCanvas from './HeartCanvas'
import { fmt } from './format'

export default function HeartView({ patient, wedge, state, simulated = false, chance, lean }) {
  const heart = { patientId: patient.id, simulated, wedgeMmHg: wedge, state, chance, lean }
  return (
    <div className="hv">
      <div className="hv-3d">
        <HeartCanvas {...heart} />
        <div className="hv-tag">{fmt(patient.features.hr_bpm, 0)} bpm · real patch beats{simulated ? ' · simulated state' : ''}</div>
      </div>
    </div>
  )
}
