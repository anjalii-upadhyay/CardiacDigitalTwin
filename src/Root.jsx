import React, { Suspense, lazy, useEffect, useState } from 'react'
import CongestionApp from './congestion/CongestionApp'

// The blood-pressure dashboard stays available at #legacy (journey D15, D33). It is loaded lazily because its
// WebSocket client connects to the old backend as soon as it is imported.
const LegacyApp = lazy(() => import('./App'))

export default function Root() {
  const [legacy, setLegacy] = useState(window.location.hash === '#legacy')
  useEffect(() => {
    const onHash = () => setLegacy(window.location.hash === '#legacy')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return legacy ? <Suspense fallback={null}><LegacyApp /></Suspense> : <CongestionApp />
}
