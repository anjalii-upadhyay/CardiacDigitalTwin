import { useEffect, useRef } from 'react'

// One shared tooltip for every element carrying data-tip: follows the pointer on hover, sits under the element
// on keyboard focus, hides on any scroll (the list and the detail area scroll on their own).
export function useTooltip() {
  const ref = useRef(null)
  useEffect(() => {
    const show = (t, x, y) => {
      const tip = ref.current
      if (!tip) return
      tip.textContent = t.dataset.tip
      tip.hidden = false
      const w = tip.offsetWidth, h = tip.offsetHeight
      tip.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - w - 8))}px`
      tip.style.top = `${y + 18 + h > window.innerHeight ? y - h - 12 : y + 18}px`
    }
    const hide = () => { if (ref.current) ref.current.hidden = true }
    const over = (e) => {
      const t = e.target.closest?.('[data-tip]')
      if (t) show(t, e.clientX, e.clientY); else hide()
    }
    const move = (e) => {
      const t = e.target.closest?.('[data-tip]')
      if (t && ref.current && !ref.current.hidden) show(t, e.clientX, e.clientY)
    }
    const focus = (e) => {
      const t = e.target.closest?.('[data-tip]')
      if (!t) return hide()
      const r = t.getBoundingClientRect()
      show(t, r.left, r.bottom - 10)
    }
    document.addEventListener('pointerover', over)
    document.addEventListener('pointermove', move)
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', hide)
    document.addEventListener('scroll', hide, { passive: true, capture: true })
    return () => {
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('focusin', focus)
      document.removeEventListener('focusout', hide)
      document.removeEventListener('scroll', hide, { capture: true })
    }
  }, [])
  return ref
}
