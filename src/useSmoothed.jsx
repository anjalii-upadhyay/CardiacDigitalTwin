// useSmoothed.js — Rolling average + trend + sparkline for a numeric metric stream
import { useRef, useCallback } from 'react'

const N = 8  // rolling window size

/**
 * Returns a push(value) function and a read() function.
 * read() → { current, avg, trend: '↑'|'↓'|'→', delta, spark: number[] }
 *
 * Usage:
 *   const mapSmooth = useSmoothed()
 *   mapSmooth.push(newMap)          // call on every incoming packet
 *   const { current, avg, trend, delta, spark } = mapSmooth.read()
 */
export function useSmoothed() {
  const buf = useRef([])

  const push = useCallback((val) => {
    const v = typeof val === 'number' ? val : parseFloat(val)
    if (isNaN(v)) return
    buf.current = [...buf.current, v].slice(-N)
  }, [])

  const read = useCallback(() => {
    const b = buf.current
    if (b.length === 0) return { current: 0, avg: 0, trend: '→', delta: 0, spark: [] }
    const current = b[b.length - 1]
    const avg     = parseFloat((b.reduce((s, x) => s + x, 0) / b.length).toFixed(1))
    const prev    = b.length >= 3 ? b.slice(-3, -1).reduce((s, x) => s + x, 0) / 2 : avg
    const delta   = parseFloat((current - prev).toFixed(1))
    const trend   = Math.abs(delta) < 0.5 ? '→' : delta > 0 ? '↑' : '↓'
    return { current, avg, trend, delta, spark: [...b] }
  }, [])

  return { push, read }
}

/**
 * Tiny inline SVG sparkline — no dependencies.
 * props: data (number[]), width, height, color
 */
export function Sparkline({ data, width = 60, height = 18, color = '#34d399' }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
