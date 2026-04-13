import React, { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

// SA node sits near top-right of heart, AV node lower-center
const SA_POS  = [0.25, 0.6, 0.1]
const AV_POS  = [0.05, 0.0, 0.1]

export default function ElectricalPulse({ rPeak }) {
  const prevPeak   = useRef(false)
  const pulseT     = useRef(-1)   // -1 = inactive
  const saGlowRef  = useRef()
  const ringRef    = useRef()
  const avGlowRef  = useRef()

  useFrame((_, delta) => {
    if (rPeak && !prevPeak.current) pulseT.current = 0
    prevPeak.current = rPeak

    if (pulseT.current < 0) {
      if (saGlowRef.current)  saGlowRef.current.intensity  = 0
      if (avGlowRef.current)  avGlowRef.current.intensity  = 0
      if (ringRef.current)    ringRef.current.scale.setScalar(0.01)
      return
    }

    pulseT.current += delta

    const t = pulseT.current

    // SA node glow: 0–120 ms
    if (saGlowRef.current)
      saGlowRef.current.intensity = t < 0.12 ? 3 * (1 - t / 0.12) : 0

    // Propagation ring expands: 0–350 ms
    if (ringRef.current) {
      const progress = Math.min(t / 0.35, 1)
      const s = 0.01 + progress * 1.4
      ringRef.current.scale.setScalar(s)
      ringRef.current.material.opacity = 0.6 * (1 - progress)
    }

    // AV node glow: 80–200 ms (delayed conduction)
    if (avGlowRef.current)
      avGlowRef.current.intensity = (t > 0.08 && t < 0.2) ? 2 * (1 - (t - 0.08) / 0.12) : 0

    if (t > 0.5) pulseT.current = -1
  })

  return (
    <group>
      {/* SA node point light */}
      <pointLight
        ref={saGlowRef}
        position={SA_POS}
        color="#ffffaa"
        intensity={0}
        distance={2}
      />

      {/* AV node point light */}
      <pointLight
        ref={avGlowRef}
        position={AV_POS}
        color="#aaffff"
        intensity={0}
        distance={1.5}
      />

      {/* Expanding ring representing wavefront */}
      <mesh ref={ringRef} position={[0.1, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1.0, 48]} />
        <meshBasicMaterial
          color="#ffff66"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
