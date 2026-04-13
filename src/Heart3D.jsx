// Heart3D.jsx — 3D heart twin (blood flow particles removed)
import React, { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import HeartModel        from './HeartModel'
import InternalHeartView from './InternalHeartView'
import ElectricalPulse   from './ElectricalPulse'

function Lights({ rPeak }) {
  return (
    <>
      <ambientLight intensity={2.5} />
      <hemisphereLight skyColor="#ffffff" groundColor="#ff2200" intensity={1.2} />
      <directionalLight position={[5, 8, 5]}   intensity={3} castShadow />
      <directionalLight position={[-5, -4, -5]} intensity={1.5} color="#ff6666" />
      <pointLight position={[0, 0, 4]}  intensity={rPeak ? 4 : 2} color="#ffffff" distance={12} />
      <pointLight position={[0, 3, 2]}  intensity={1.5} color="#ffcccc" distance={10} />
    </>
  )
}

function FallbackHeart() {
  return (
    <mesh>
      <sphereGeometry args={[1, 32, 32]} />
      <meshStandardMaterial color="#cc2222" roughness={0.5} />
    </mesh>
  )
}

export default function Heart3D({ bpm = 72, rPeak = false, sbp = 120, dbp = 80, abp = 100, size = 'normal' }) {
  const isLarge = size === 'large'
  return (
    <div className="w-full h-[500px]">
      <Canvas camera={{ position: [0, 0, 5], fov: 45 }} gl={{ antialias: true }} style={{ background: 'transparent' }}>
        <Lights rPeak={rPeak} />
        <Suspense fallback={<FallbackHeart />}>
          <HeartModel
            rPeak={rPeak} sbp={sbp} dbp={dbp} abp={abp}
            position={isLarge ? [-1.2, 0, 0] : [0, 0, 0]}
          />
          {isLarge && <InternalHeartView rPeak={rPeak} abp={abp} position={[1.2, 0, 0]} />}
          <ElectricalPulse rPeak={rPeak} />
        </Suspense>
        <OrbitControls enableZoom={false} enablePan={false} autoRotate={false} />
      </Canvas>
    </div>
  )
}
