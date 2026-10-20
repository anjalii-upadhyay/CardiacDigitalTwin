using System.Text;
using NativeWebSocket;
using UnityEngine;

// Receives the selected heart-failure patient from python_backend/server.py (/stream, 60 Hz) and keeps the newest
// packet for the main thread. NativeWebSocket works both in the editor and in the WebGL build shown on the doctor
// dashboard. Reconnects forever; with no fresh data the heart freezes (CardiacCycle), it never fakes a rhythm.
public class HeartDataClient : MonoBehaviour
{
    public string url = "ws://localhost:8765/stream";

    // Field names match the server packet exactly (python_backend/server.py, packet()).
    [System.Serializable]
    public class HeartPacket
    {
        public string patient_id;
        public string source;            // "SCG-RHC replay"
        public float time;               // s into the patient's 80 s chest-patch slice
        public bool r_peak;              // true on the packet of a real R-peak
        public float rr_interval;        // s, current real beat-to-beat interval
        public float bpm;
        public float cardiac_phase;      // 0 at a real R-peak -> 1 at the next
        public float stroke_volume;      // mL, catheter-measured
        public string congestion_state;  // congested | uncertain | not_congested (or the simulated state)
        public string lean;              // congested | not_congested (chance >= 0.5; simulated in the simulator)
        public float wedge_mmHg;
        public float chance;
        public bool simulated;
    }

    public HeartPacket Latest { get; private set; }
    public bool Connected => ws != null && ws.State == WebSocketState.Open;
    public bool HasData => DataAge < 1.5f;
    public float DataAge => Time.unscaledTime - lastRx;   // infinite until the first real packet arrives
    public int BeatCount { get; private set; }
    public float LastBeatTime { get; private set; } = -10f;
    public int RejectedCount { get; private set; }

    WebSocket ws;
    float lastRx = float.NegativeInfinity, retryAt;
    bool connecting;

    void OnEnable() => retryAt = 0f;

    async void Connect()
    {
        connecting = true;
        var sock = new WebSocket(url);
        ws = sock;
        sock.OnMessage += bytes => Receive(Encoding.UTF8.GetString(bytes));
        sock.OnClose += _ => { if (ReferenceEquals(ws, sock)) { ws = null; retryAt = Time.unscaledTime + 2f; } connecting = false; };
        sock.OnError += e => Debug.LogWarning($"HeartDataClient: {e} — retrying {url}");
        sock.OnOpen += () => connecting = false;
        try { await sock.Connect(); }   // editor: returns when the socket closes; WebGL: returns at once
        catch (System.Exception e)
        {
            Debug.LogWarning($"HeartDataClient: {e.Message} — retrying {url}");
            if (ReferenceEquals(ws, sock)) { ws = null; retryAt = Time.unscaledTime + 2f; }
            connecting = false;
        }
    }

    void Update()
    {
#if !UNITY_WEBGL || UNITY_EDITOR
        ws?.DispatchMessageQueue();
#endif
        if (ws == null && !connecting && Time.unscaledTime >= retryAt) Connect();
    }

    void Receive(string json)
    {
        HeartPacket p;
        try { p = JsonUtility.FromJson<HeartPacket>(json); }
        catch { RejectedCount++; return; }
        // Boundary validation: a clinical display must never act on artifact; the last good packet stays in force.
        if (p == null || !Plausible(p)) { RejectedCount++; return; }
        if (p.r_peak) { BeatCount++; LastBeatTime = Time.unscaledTime; }
        Latest = p;
        lastRx = Time.unscaledTime;
    }

    static bool Plausible(HeartPacket p)
    {
        if (!Finite(p.bpm) || !Finite(p.rr_interval) || !Finite(p.cardiac_phase) || !Finite(p.stroke_volume)) return false;
        if (p.bpm < 20f || p.bpm > 250f || p.rr_interval < 0.2f || p.rr_interval > 5f) return false;
        if (p.cardiac_phase < 0f || p.cardiac_phase > 1.0001f) return false;
        if (p.stroke_volume < 5f || p.stroke_volume > 250f) return false;
        return p.lean == "congested" || p.lean == "not_congested";
    }

    static bool Finite(float v) => !float.IsNaN(v) && !float.IsInfinity(v);

    async void OnDisable()
    {
        var sock = ws;
        ws = null;
        connecting = false;
        if (sock != null && sock.State == WebSocketState.Open) await sock.Close();
    }
}
