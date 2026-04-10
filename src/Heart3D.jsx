import React, { useRef, useEffect } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { OrbitControls } from '@react-three/drei'

function HeartModel({ bpm, size = "normal" }) {
  const meshRef = useRef()
  // Use different paths for different sizes
  const modelPath = size === "large" ? '/src/realistic_human_heart.glb' : './src/realistic_human_heart.glb'
  const gltf = useLoader(GLTFLoader, modelPath)
  
  useFrame((state) => {
    if (meshRef.current) {
      // Heartbeat animation based on BPM
      const time = state.clock.getElapsedTime()
      const beatFreq = bpm / 60
      const baseScale = size === "large" ? 15 : 2.59
      const scale = baseScale + Math.sin(time * beatFreq * Math.PI * 2) * (baseScale * 0.1)
      meshRef.current.scale.setScalar(scale)
      
      // Slow rotation
      meshRef.current.rotation.y = time * 0.2
    }
  })

  return (
    <primitive 
      ref={meshRef} 
      object={gltf.scene} 
      scale={size === "large" ? 15 : 2.59}
      position={[0, 0, 0]}
    />
  )
}

export default function Heart3D({ bpm = 72, size = "normal" }) {
  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: [0, 0, size === "large" ? 8 : 5], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#ff0000" />
        <HeartModel bpm={bpm} size={size} />
        <OrbitControls enableZoom={size === "large"} enablePan={size === "large"} />
      </Canvas>
    </div>
  )
}