import React, { useRef, useEffect } from 'react'
import { useFrame, useLoader } from '@react-three/fiber'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import * as THREE from 'three'

const ATRIAL_SCALE    = 1.04
const VENTRICLE_SCALE = 1.13
const LV_EXTRA        = 0.015

const HIDE_NAMES = ['plane','background','floor','shell','vessel','cube','sphere','body']

export default function HeartModel({ rPeak, sbp = 120, dbp = 80, abp = 100, position = [0, 0, 0] }) {
  const groupRef = useRef()
  const phaseRef = useRef(0)
  const timerRef = useRef(0)
  const prevPeak = useRef(false)
  const ready    = useRef(false)
  const visibleMats = useRef([])   // only materials on visible meshes

  const fbx = useLoader(FBXLoader, '/Heart.fbx')

  useEffect(() => {
    if (!fbx || ready.current) return

    // ── Step 1: log + hide oversized / background meshes ──
    fbx.traverse((child) => {
      if (!child.isMesh) return
      const box  = new THREE.Box3().setFromObject(child)
      const size = box.getSize(new THREE.Vector3())
      console.log('External mesh:', child.name, 'size:', size.x.toFixed(1), size.y.toFixed(1), size.z.toFixed(1))

      const nameLower = child.name.toLowerCase()
      const isGiant   = size.x > 50 || size.y > 50 || size.z > 50
      const isBg      = HIDE_NAMES.some(n => nameLower.includes(n))

      if (isGiant || isBg) {
        child.visible = false
        console.log('  → hidden')
      }
    })

    // ── Step 2: center + normalize scale using only visible meshes ──
    const visBox = new THREE.Box3()
    fbx.traverse((child) => {
      if (child.isMesh && child.visible) visBox.expandByObject(child)
    })

    if (!visBox.isEmpty()) {
      const center = visBox.getCenter(new THREE.Vector3())
      const size   = visBox.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const scale  = 3.0 / maxDim          // normalize to fit 3 units tall
      fbx.position.sub(center)
      fbx.scale.setScalar(scale)
      console.log('Visible bbox size:', size, '→ scale:', scale)
    }

    // ── Step 3: clone materials on visible meshes only ──
    fbx.traverse((child) => {
      if (!child.isMesh || !child.visible) return
      const setup = (m) => {
        const c = m.clone()
        c.emissive          = new THREE.Color(0.4, 0, 0)
        c.emissiveIntensity = 0.3
        c.roughness         = 0.6
        c.metalness         = 0.1
        return c
      }
      child.material = Array.isArray(child.material)
        ? child.material.map(setup)
        : setup(child.material)

      const mats = Array.isArray(child.material) ? child.material : [child.material]
      visibleMats.current.push(...mats)
    })

    ready.current = true
  }, [fbx])

  useFrame((_, delta) => {
    if (!groupRef.current) return

    // Slow Y-only rotation — never touch X or Z
    groupRef.current.rotation.y += 0.002

    if (rPeak && !prevPeak.current) { phaseRef.current = 1; timerRef.current = 0 }
    prevPeak.current = rPeak
    timerRef.current += delta

    let targetScale = 1.0
    const t = timerRef.current

    if (phaseRef.current === 1) {
      targetScale = ATRIAL_SCALE
      if (t > 0.08) { phaseRef.current = 2; timerRef.current = 0 }
    } else if (phaseRef.current === 2) {
      const p = Math.min(t / 0.2, 1)
      targetScale = 1 + (VENTRICLE_SCALE - 1 + LV_EXTRA) * Math.sin(p * Math.PI)
      if (t > 0.2) { phaseRef.current = 3; timerRef.current = 0 }
    } else if (phaseRef.current === 3) {
      const p = Math.min(t / 0.3, 1)
      targetScale = 1 + (VENTRICLE_SCALE - 1 + LV_EXTRA) * (1 - p)
      if (t > 0.3) phaseRef.current = 0
    }

    const cur = groupRef.current.scale.x
    groupRef.current.scale.setScalar(cur + (targetScale - cur) * 0.25)

    // Pressure heatmap on visible mats only
    const pressure     = Math.min(Math.max(abp / 160, 0), 1)
    const isHighStrain = sbp > 140
    visibleMats.current.forEach(m => {
      m.emissive.setRGB(0.3 + pressure * 0.7, isHighStrain ? 0.15 + pressure * 0.2 : 0, 0)
      m.emissiveIntensity = 0.2 + pressure * 0.6
    })
  })

  return (
    <group ref={groupRef} position={position} rotation={[0.2, Math.PI * 0.15, 0]}>
      <primitive object={fbx} />
    </group>
  )
}
