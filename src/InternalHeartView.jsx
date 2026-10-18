import React, { useRef, useEffect } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import * as THREE from 'three'

export default function InternalHeartView({ rPeak, abp = 100, position = [2.2, 0, 0] }) {
  const groupRef  = useRef()
  const phaseRef  = useRef(0)
  const timerRef  = useRef(0)
  const prevPeak  = useRef(false)
  const ready     = useRef(false)

  const gltf = useLoader(GLTFLoader, '/beating-heart.glb')

  useEffect(() => {
    if (!gltf?.scene || ready.current) return

    const scene = gltf.scene
    const box    = new THREE.Box3().setFromObject(scene)
    const center = box.getCenter(new THREE.Vector3())
    const size   = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const normalise = (1.2 * 2) / maxDim   // slightly smaller than external

    scene.position.sub(center)
    scene.scale.setScalar(normalise)

    console.log('beating-heart.glb loaded — size:', size, 'normalise scale:', normalise)

    scene.traverse((child) => {
      if (!child.isMesh) return
      if (!child.material._cloned) {
        child.material = child.material.clone()
        child.material._cloned = true
      }
      child.material.emissive          = new THREE.Color(0.3, 0, 0)
      child.material.emissiveIntensity = 0.2
    })

    ready.current = true
  }, [gltf])

  useFrame((_, delta) => {
    if (!groupRef.current) return

    if (rPeak && !prevPeak.current) { phaseRef.current = 1; timerRef.current = 0 }
    prevPeak.current = rPeak
    timerRef.current += delta

    let targetScale = 1.0
    const t = timerRef.current

    if (phaseRef.current === 1) {
      targetScale = 1.08
      if (t > 0.08) { phaseRef.current = 2; timerRef.current = 0 }
    } else if (phaseRef.current === 2) {
      const p = Math.min(t / 0.2, 1)
      targetScale = 1 + 0.12 * Math.sin(p * Math.PI)
      if (t > 0.2) { phaseRef.current = 3; timerRef.current = 0 }
    } else if (phaseRef.current === 3) {
      const p = Math.min(t / 0.3, 1)
      targetScale = 1 + 0.12 * (1 - p)
      if (t > 0.3) phaseRef.current = 0
    }

    const cur = groupRef.current.scale.x
    groupRef.current.scale.setScalar(cur + (targetScale - cur) * 0.2)

    const pressure = Math.min(abp / 160, 1)
    gltf.scene.traverse((child) => {
      if (!child.isMesh) return
      child.material.emissive.setRGB(0.3 + pressure * 0.5, 0, 0)
      child.material.emissiveIntensity = 0.15 + pressure * 0.4
    })
  })

  return (
    <group ref={groupRef} position={position}>
      <primitive object={gltf.scene} />
    </group>
  )
}
