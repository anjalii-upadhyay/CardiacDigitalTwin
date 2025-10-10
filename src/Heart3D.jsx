import React, { useRef, useEffect } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { OrbitControls } from '@react-three/drei'

function HeartModel({ bpm }) {
  const meshRef = useRef()
  const gltf = useLoader(GLTFLoader, '/src/realistic_human_heart.glb')
  
  useFrame((state) => {
    if (meshRef.current) {
      // Heartbeat animation based on BPM
      const time = state.clock.getElapsedTime()
      const beatFreq = bpm / 60
      const scale = 1 + Math.sin(time * beatFreq * Math.PI * 1) * 0.1
      meshRef.current.scale.setScalar(scale)
      
      // Slow rotation
      meshRef.current.rotation.y = time * 0.2
    }
  })

  return (
    <primitive 
      ref={meshRef} 
      object={gltf.scene} 
      scale={25}
      position={[0, 0, 0]}
    />
  )
}

export default function Heart3D({ bpm = 72 }) {
  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#ff0000" />
        <HeartModel bpm={bpm} />
        <OrbitControls enableZoom={false} enablePan={false} />
      </Canvas>
    </div>
  )
}