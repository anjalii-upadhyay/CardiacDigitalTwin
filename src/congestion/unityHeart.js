// The Unity WebGL heart, loaded once and kept alive. Its canvas is moved into whichever heart slot is showing
// (Patient or Simulator tab), so switching tabs never reloads Unity.
// Build: in Unity, Tools > Cardiac Twin > Build WebGL for dashboard -> public/unity/ (build.json lists the files).
import { useSyncExternalStore } from 'react'

const BASE = '/unity/'
let canvas = null
let status = { phase: 'idle', progress: 0 }   // idle | loading | ready | missing | error
const listeners = new Set()

function set(next) {
  status = { ...status, ...next }
  listeners.forEach((l) => l())
}

async function load() {
  set({ phase: 'loading', progress: 0 })
  let build
  try {
    // Vite answers unknown paths with index.html, so a missing build shows up as a JSON parse failure
    build = await (await fetch(`${BASE}build.json`, { cache: 'no-store' })).json()
  } catch {
    set({ phase: 'missing' })
    return
  }
  try {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = BASE + build.loaderUrl
      s.onload = resolve
      s.onerror = () => reject(new Error('Unity loader failed to load'))
      document.body.appendChild(s)
    })
    await window.createUnityInstance(canvas, {
      dataUrl: BASE + build.dataUrl, frameworkUrl: BASE + build.frameworkUrl, codeUrl: BASE + build.codeUrl,
      productName: 'Cardiac Digital Twin', companyName: 'CardiacDigitalTwin', productVersion: build.version,
    }, (p) => set({ progress: p }))
    set({ phase: 'ready', progress: 1 })
  } catch (e) {
    console.error(e)
    set({ phase: 'error', message: String(e.message || e) })
  }
}

// Returns the single Unity canvas, starting the load on first use.
export function unityCanvas() {
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.id = 'unity-heart'
    canvas.className = 'hv-unity'
    canvas.tabIndex = -1
    load()
  }
  return canvas
}

export function useUnityStatus() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => status)
}
