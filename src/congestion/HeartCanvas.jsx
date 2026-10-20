// HeartCanvas: THE SLOT for the 3D heart. The teammate who owns model loading replaces the body of this file
// (three.js / react-three-fiber like the legacy dashboard, or the Unity twin later). Nothing else in the
// dashboard needs to change: HeartView.jsx renders <HeartCanvas {...heart} /> and the props below are the contract.
//
// Props (all real or derived, built in HeartView.jsx):
//   patientId     string     recording id, e.g. "TRM245-RHC1". Changes when the doctor selects another patient.
//   beatsS        number[]   real R-peak times (s) inside the patch slice. The heart should contract at each one.
//   sliceS        number     slice length (s). Loop the replay: when time passes sliceS, start again at beatsS[0].
//   hrBpm         number|null  mean heart rate from the patch (fallback pacing if beatsS is empty)
//   state         'congested' | 'uncertain' | 'not_congested'   congestion state (tint / alert cue)
//   wedgeMmHg     number     wedge pressure being shown: the estimate, or the simulated value in the simulator tab
//   raMmHg        number|null  measured right-atrial pressure (catheter only, never estimated)
//   simulated     boolean    true in the simulator tab (label the view as a simulation)
//
// Layout contract: the component fills its parent (.hv-3d, height 300 px desktop / 240 px phone) and must not
// scroll the page. The parent shows the "Beats on real patch R-peaks" caption and the lung map; do not repeat them.
import React from 'react'

export default function HeartCanvas(props) {
  const { patientId, beatsS, sliceS, hrBpm, state, wedgeMmHg, simulated } = props
  return (
    <div className="hv-placeholder" data-heart-slot data-patient={patientId} data-state={state}>
      <div className="hv-ph-title">3D heart goes here</div>
      <div className="hv-ph-sub">Slot for the teammate's model loading (src/congestion/HeartCanvas.jsx)</div>
      <dl className="hv-ph-props">
        <div><dt>patientId</dt><dd>{patientId}</dd></div>
        <div><dt>beatsS</dt><dd>{beatsS.length} real beats</dd></div>
        <div><dt>sliceS</dt><dd>{sliceS} s</dd></div>
        <div><dt>hrBpm</dt><dd>{hrBpm == null ? '–' : Math.round(hrBpm)}</dd></div>
        <div><dt>state</dt><dd>{state}</dd></div>
        <div><dt>wedgeMmHg</dt><dd>{wedgeMmHg.toFixed(1)}{simulated ? ' (simulated)' : ''}</dd></div>
      </dl>
    </div>
  )
}
