using System;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

// Connects to the Python backend (python_backend/server.py) and keeps the newest 125 Hz packet available on the
// main thread. Reconnects forever, so the twin recovers when the backend restarts; with no data the heart falls
// back to its internal clock.
public class HeartDataClient : MonoBehaviour
{
    public string url = "ws://localhost:8765";

    // Field names match the backend JSON exactly (models/packet_model.py). "ppg" is null in the stream, so it is
    // deliberately not declared. risk_level is "Low" / "Moderate" / "High".
    [Serializable]
    public class HeartPacket
    {
        public float time;
        public float ecg;
        public float abp;
        public bool r_peak;
        public float bpm;
        public float rr_interval;
        public float cardiac_phase;   // 0 at R-peak (systole onset) -> 1 at next R-peak
        public float sbp;
        public float dbp;
        public float map;
        public float pulse_pressure;
        public float stroke_volume;   // mL
        public float cardiac_output;  // L/min
        public float ptt;
        public float wall_stress;
        public float blood_flow;
        public float dpdt;
        public float blood_velocity;
        public float reynolds_number;
        public string risk_level;
        public bool segment_break;    // true on the first sample after a dataset window splice
        public string source;         // provenance, e.g. "replay p000003" — shown verbatim on the overlay
    }

    public HeartPacket Latest { get; private set; }
    public bool Connected { get; private set; }
    public bool HasData => Latest != null && Time.unscaledTime - lastPacketTime < 1.5f;
    public float DataAge => Latest == null ? float.PositiveInfinity : Time.unscaledTime - lastPacketTime;
    public int BeatCount { get; private set; }
    public float LastBeatTime { get; private set; } = -10f;
    public int RejectedCount { get; private set; }
    public bool RecentArtifact => Time.unscaledTime - lastRejectTime < 1f;
    public HeartPacket LastRejected { get; private set; } // kept so an out-of-range state can show WHAT was rejected
    float lastRejectTime = -10f;
    bool segmentBreakPending;
    int lastWarnTick = int.MinValue;  // Environment.TickCount — Unity's Time API is main-thread-only
    int runGen;                       // generation guard: an old reconnect task must never touch the new one's state

    // One-shot: true once per dataset splice, so the cycle can resync instantly instead of acting out a fake pause.
    public bool ConsumeSegmentBreak()
    {
        bool b = segmentBreakPending;
        segmentBreakPending = false;
        return b;
    }

    readonly ConcurrentQueue<string> inbox = new ConcurrentQueue<string>();
    ClientWebSocket ws;
    CancellationTokenSource cts;
    float lastPacketTime = -10f;

    void OnEnable()
    {
        // Seed the warn throttle in the past WITHOUT int.MinValue: TickCount wraparound arithmetic would make
        // the first difference negative and silently suppress the very first warning.
        lastWarnTick = Environment.TickCount - 100000;
        cts = new CancellationTokenSource();
        _ = Run(cts.Token, ++runGen);
    }

    void OnDisable()
    {
        cts.Cancel();
        try { ws?.Dispose(); } catch { }
        cts.Dispose();
        Connected = false;
    }

    async Task Run(CancellationToken ct, int gen)
    {
        var buf = new byte[16384];
        while (!ct.IsCancellationRequested && gen == runGen)
        {
            var sock = new ClientWebSocket();
            try
            {
                ws = sock;
                await sock.ConnectAsync(new Uri(url), ct).ConfigureAwait(false);
                if (gen == runGen) Connected = true;
                var sb = new StringBuilder();
                // Watchdog: the stream is 125 Hz, so >2 s of silence means a dead or half-open connection —
                // the timeout token (re-armed per message, fires at most once per connection) aborts the
                // receive so we reconnect rather than hang forever looking "connected".
                using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct))
                {
                    while (sock.State == WebSocketState.Open && !ct.IsCancellationRequested && gen == runGen)
                    {
                        timeout.CancelAfter(2000);
                        var res = await sock.ReceiveAsync(new ArraySegment<byte>(buf), timeout.Token).ConfigureAwait(false);
                        if (res.MessageType == WebSocketMessageType.Close) break;
                        sb.Append(Encoding.UTF8.GetString(buf, 0, res.Count));
                        if (res.EndOfMessage) { inbox.Enqueue(sb.ToString()); sb.Clear(); }
                    }
                }
            }
            catch (OperationCanceledException) { /* shutdown or watchdog timeout — loop decides which */ }
            catch (Exception e)
            {
                // Never swallow failures invisibly; throttle to one line per 5 s. Environment.TickCount is
                // thread-safe (Unity's Time API is NOT legal on this thread-pool thread).
                int now = Environment.TickCount;
                if (unchecked(now - lastWarnTick) > 5000)
                {
                    lastWarnTick = now;
                    Debug.LogWarning($"HeartDataClient: {e.GetType().Name}: {e.Message} — retrying {url}");
                }
            }
            finally
            {
                try { sock.Dispose(); } catch { }
                if (ReferenceEquals(ws, sock)) ws = null;
            }
            if (gen == runGen) Connected = false;
            try { await Task.Delay(2000, ct).ConfigureAwait(false); } catch { break; }
        }
    }

    void Update()
    {
        // Drain everything that arrived since last frame; keep the newest packet but count every R-peak on the way
        // so no beat is missed between frames.
        while (inbox.TryDequeue(out var json))
        {
            HeartPacket p;
            try { p = JsonUtility.FromJson<HeartPacket>(json); }
            catch { RejectedCount++; lastRejectTime = Time.unscaledTime; continue; }
            if (p == null) { RejectedCount++; lastRejectTime = Time.unscaledTime; continue; }
            if (!Plausible(p)) { LastRejected = p; RejectedCount++; lastRejectTime = Time.unscaledTime; continue; }
            if (p.risk_level != "Low" && p.risk_level != "Moderate" && p.risk_level != "High")
                p.risk_level = "Unknown"; // never let an unexpected label render as "all clear"
            if (p.segment_break) segmentBreakPending = true;
            if (p.r_peak) { BeatCount++; LastBeatTime = Time.unscaledTime; }
            Latest = p;
            lastPacketTime = Time.unscaledTime;
        }
    }

    // Boundary validation: a clinical display must never act on artifact. Packets with non-finite or
    // physiologically impossible values are rejected whole; the last good packet stays in force.
    static bool Plausible(HeartPacket p)
    {
        if (!Finite(p.bpm) || !Finite(p.rr_interval) || !Finite(p.cardiac_phase) ||
            !Finite(p.sbp) || !Finite(p.dbp) || !Finite(p.stroke_volume) || !Finite(p.cardiac_output)) return false;
        if (p.bpm < 20f || p.bpm > 250f) return false;          // beyond survivable sinus/aberrant range
        if (p.rr_interval < 0.2f || p.rr_interval > 5f) return false; // 5 s admits a real sinus pause as data
        if (p.cardiac_phase < 0f || p.cardiac_phase > 1.0001f) return false;
        if (p.sbp < 40f || p.sbp > 300f || p.dbp < 20f || p.dbp > 200f || p.dbp >= p.sbp) return false;
        if (p.stroke_volume < 5f || p.stroke_volume > 250f) return false;
        if (p.cardiac_output < 0.3f || p.cardiac_output > 20f) return false;
        return true;
    }

    static bool Finite(float v) => !float.IsNaN(v) && !float.IsInfinity(v);
}
