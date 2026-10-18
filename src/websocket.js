// websocket.js — WebSocket client with auto-reconnect and connection status callbacks
// Connects to the modular Python backend (server.py) at ws://localhost:8765

const WS_URL         = "ws://localhost:8765";
const RECONNECT_MS   = 3000;   // delay before reconnect attempt

// Status values: "connecting" | "connected" | "disconnected"
let statusListeners  = [];
let messageListeners = [];
let socket           = null;
let reconnectTimer   = null;

// ── Debug counters ────────────────────────────────────────────────────────────
let packetCount      = 0;
let lastFreqLog      = Date.now();

setInterval(() => {
  const now     = Date.now();
  const elapsed = (now - lastFreqLog) / 1000;
  if (elapsed > 0) {
    console.debug(`[WS] Packet rate: ${(packetCount / elapsed).toFixed(1)} pkt/s`);
    packetCount  = 0;
    lastFreqLog  = now;
  }
}, 5000);

// ── Status broadcast ──────────────────────────────────────────────────────────
function setStatus(status) {
  statusListeners.forEach(fn => fn(status));
}

// ── Connect / reconnect ───────────────────────────────────────────────────────
function connect() {
  clearTimeout(reconnectTimer);
  console.log(`[WS] Connecting to ${WS_URL} …`);
  setStatus("connecting");

  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    console.log("[WS] Connected to Python backend (server.py)");
    setStatus("connected");
  };

  socket.onmessage = (event) => {
    packetCount++;
    const data = JSON.parse(event.data);

    // Log first packet of each second for schema verification
    if (packetCount === 1) {
      console.debug("[WS] Packet schema sample:", data);
    }

    messageListeners.forEach(fn => fn(data));
  };

  socket.onerror = (err) => {
    console.error("[WS] WebSocket error:", err);
  };

  socket.onclose = () => {
    console.warn(`[WS] Disconnected — reconnecting in ${RECONNECT_MS}ms …`);
    setStatus("disconnected");
    reconnectTimer = setTimeout(connect, RECONNECT_MS);
  };
}

// ── Public API ────────────────────────────────────────────────────────────────
export function onMessage(fn)       { messageListeners.push(fn); }
export function offMessage(fn)      { messageListeners = messageListeners.filter(f => f !== fn); }
export function onStatusChange(fn)  { statusListeners.push(fn); }
export function offStatusChange(fn) { statusListeners = statusListeners.filter(f => f !== fn); }

// Start connection immediately on import
connect();
