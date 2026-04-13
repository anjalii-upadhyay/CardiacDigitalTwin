import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Anatomical waypoints (scaled to match heart model space)
const PATHS = [
  [[-0.5,-2,0],  [-0.4,-1.2,0], [-0.3,-0.5,0.1]],           // vena cava → RA
  [[-0.3,-0.5,0.1], [-0.2,-0.8,0.2], [-0.1,-1.3,0.1]],      // RA → RV
  [[0.3,-0.4,0.1],  [0.2,-0.8,0.2],  [0.1,-1.4,0.1]],       // LA → LV
  [[0.1,-1.4,0.1],  [0.2,-0.5,0.3],  [0.4,0.5,0.2], [0.6,1.5,0]], // LV → aorta
]

const COUNT = 120

export default function BloodFlowParticles({ rPeak, abp = 100 }) {
  const geoRef = useRef()

  const curves = useMemo(() =>
    PATHS.map(pts => new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))))
  , [])

  const particles = useMemo(() =>
    Array.from({ length: COUNT }, (_, i) => ({
      curveIdx: i % curves.length,
      t:        Math.random(),
      speed:    0.08 + Math.random() * 0.06,
    }))
  , [])

  const positions = useMemo(() => new Float32Array(COUNT * 3), [])
  const colors    = useMemo(() => new Float32Array(COUNT * 3), [])

  useFrame((_, delta) => {
    const speedMult  = rPeak ? 2.8 : 1.0
    const brightness = rPeak ? 1.0 : 0.45

    particles.forEach((p, i) => {
      const isAorta = p.curveIdx === 3
      p.t = (p.t + p.speed * speedMult * (isAorta && rPeak ? 1.6 : 1) * delta) % 1

      const pt = curves[p.curveIdx].getPoint(p.t)
      positions[i*3]   = pt.x
      positions[i*3+1] = pt.y
      positions[i*3+2] = pt.z

      const b = Math.min(brightness * (isAorta && rPeak ? 1.3 : 1), 1)
      colors[i*3]   = b
      colors[i*3+1] = 0
      colors[i*3+2] = 0
    })

    if (geoRef.current) {
      geoRef.current.attributes.position.needsUpdate = true
      geoRef.current.attributes.color.needsUpdate    = true
    }
  })

  return (
    <points>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" array={positions} count={COUNT} itemSize={3} />
        <bufferAttribute attach="attributes-color"    array={colors}    count={COUNT} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.06} vertexColors transparent opacity={0.85} sizeAttenuation />
    </points>
  )
}
