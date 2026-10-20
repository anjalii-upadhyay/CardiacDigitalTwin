import { useEffect, useRef } from 'react'

// One shared tooltip for every element carrying data-tip.
export function useTooltip() {
  const ref = useRef(null)
  useEffect(() => {
    const place = (e) => {
      const tip = ref.current
      const w = tip.offsetWidth, h = tip.offsetHeight
      tip.style.left = `${Math.max(8, Math.min(e.clientX + 14, window.innerWidth - w - 8))}px`
      tip.style.top = `${e.clientY + 18 + h > window.innerHeight ? e.clientY - h - 12 : e.clientY + 18}px`
    }
    const over = (e) => {
      const tip = ref.current
      if (!tip) return
      const t = e.target.closest?.('[data-tip]')
      if (!t) { tip.hidden = true; return }
      tip.textContent = t.dataset.tip
      tip.hidden = false
      place(e)
    }
    const move = (e) => { if (ref.current && !ref.current.hidden) place(e) }
    const hide = () => { if (ref.current) ref.current.hidden = true }
    document.addEventListener('pointerover', over)
    document.addEventListener('pointermove', move)
    window.addEventListener('scroll', hide, { passive: true })
    return () => {
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointermove', move)
      window.removeEventListener('scroll', hide)
    }
  }, [])
  return ref
}
