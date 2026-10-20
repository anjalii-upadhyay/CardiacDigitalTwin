// One shared connection to the stream server's /control path (python_backend/server.py). The dashboard sends the
// selected patient (and simulated values in the simulator); the server streams that patient to the Unity heart.
// Reconnects forever and re-sends the latest selection after every reconnect.
import { useSyncExternalStore } from 'react'

const URL = 'ws://localhost:8765/control'
let ws = null
let latest = null          // last selection message sent (or waiting to be sent)
let status = { connected: false, selected: null }   // selected = id the server acknowledged
const listeners = new Set()

function set(next) {
  status = { ...status, ...next }
  listeners.forEach((l) => l())
}

function connect() {
  ws = new WebSocket(URL)
  ws.onopen = () => {
    set({ connected: true, selected: null })
    if (latest) ws.send(JSON.stringify(latest))
  }
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.type === 'selected') set({ selected: m.id })
    if (m.type === 'error') console.warn('twin server rejected selection:', m.error)
  }
  ws.onclose = () => {
    set({ connected: false, selected: null })
    setTimeout(connect, 2000)
  }
}

export function selectForTwin(msg) {
  latest = msg
  if (!ws) connect()
  else if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

export function useTwinStatus() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => status)
}
