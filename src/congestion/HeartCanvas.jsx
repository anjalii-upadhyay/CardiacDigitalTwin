// HeartCanvas: the slot for the Unity heart twin. The one Unity instance (unityHeart.js) is moved into whichever
// slot is mounted, and the slot tells the stream server (twinControl.js) which patient to stream to it:
// real values on the Patient tab, simulated values on the Simulator tab.
//
// Props (built in HeartView.jsx):
//   patientId   string    recording id, e.g. "TRM245-RHC1"
//   simulated   boolean   true in the simulator tab
//   wedgeMmHg   number    shown wedge: the estimate, or the simulated value
//   state       'congested' | 'uncertain' | 'not_congested'
//   chance      number    simulated chance of congestion (simulator only; the server uses the real one otherwise)
//   lean        'congested' | 'not_congested'   simulated lean (simulator only)
// The heart's beat timing (real R-peaks) and squeeze (catheter-measured stroke volume) come from the server.
import React, { useEffect, useRef } from 'react'
import { selectForTwin, useTwinStatus } from './twinControl'
import { unityCanvas, useUnityStatus } from './unityHeart'

const SEND_EVERY_MS = 100

function message(unity, twin, patientId) {
  if (unity.phase === 'missing') return ['3D heart not built yet.', 'In Unity: Tools > Cardiac Twin > Build WebGL for dashboard']
  if (unity.phase === 'error') return ['3D heart failed to load.', unity.message]
  if (unity.phase !== 'ready') return [`Loading 3D heart… ${Math.round(unity.progress * 100)}%`]
  if (!twin.connected) return ['Twin not connected.', 'Start the stream: python_backend/server.py']
  if (twin.selected !== patientId) return ['Waiting for patient data…']
  return null
}

export default function HeartCanvas({ patientId, simulated, wedgeMmHg, state, chance, lean }) {
  const host = useRef(null)
  const lastSent = useRef(0)
  const unity = useUnityStatus()
  const twin = useTwinStatus()

  useEffect(() => {
    host.current.appendChild(unityCanvas())
  }, [])

  useEffect(() => {
    const msg = simulated
      ? { select: patientId, simulated: true, wedge: wedgeMmHg, chance, lean, state }
      : { select: patientId }
    const wait = Math.max(0, lastSent.current + SEND_EVERY_MS - Date.now())
    const timer = setTimeout(() => { lastSent.current = Date.now(); selectForTwin(msg) }, wait)
    return () => clearTimeout(timer)
  }, [patientId, simulated, wedgeMmHg, state, chance, lean])

  const msg = message(unity, twin, patientId)
  return (
    <div className="hv-slot" ref={host} data-patient={patientId} data-state={state}>
      {msg && (
        <div className="hv-msg" role="status">
          <div className="hv-ph-title">{msg[0]}</div>
          {msg[1] && <div className="hv-ph-sub">{msg[1]}</div>}
        </div>
      )}
    </div>
  )
}
