using UnityEngine;

// Patient-monitor-style overlay for the digital twin: live vitals with units, explicit signal state (a clinical
// display must never show stale data as if it were live), beat-synchronous pulse mark, and risk alarm that also
// tints the heart itself. Includes the mandatory honesty line: this is an education/research visualization.
public class VitalsDisplay : MonoBehaviour
{
    public HeartDataClient data;
    public SkinnedMeshRenderer heartRenderer;

    static readonly Color Green = new Color(0.3f, 1f, 0.45f);
    static readonly Color Amber = new Color(1f, 0.75f, 0.15f);
    static readonly Color Red = new Color(1f, 0.25f, 0.2f);

    MaterialPropertyBlock block;
    GUIStyle label, big, small;

    void Start()
    {
        if (data == null) data = FindFirstObjectByType<HeartDataClient>();
        if (heartRenderer == null)
        {
            var heart = GameObject.Find("BeatingHeart");
            if (heart != null) heartRenderer = heart.GetComponentInChildren<SkinnedMeshRenderer>();
        }
        block = new MaterialPropertyBlock();
    }

    void Update()
    {
        if (heartRenderer == null) return;
        // Risk alarm on the organ itself: Moderate = steady amber wash, High = pulsing red wash (monitor-style
        // alarm), Low/no-data = none. Property block only — the material asset is never modified.
        string risk = data != null && data.HasData ? data.Latest.risk_level : null;
        Color emission = Color.black;
        if (risk == "Moderate" || risk == "Unknown") emission = Amber * 0.12f;
        else if (risk == "High") emission = Red * (0.10f + 0.14f * (0.5f + 0.5f * Mathf.Sin(Time.time * 6f)));
        block.SetColor("_EmissionColor", emission);
        heartRenderer.SetPropertyBlock(block);
    }

    void OnGUI()
    {
        if (label == null)
        {
            label = new GUIStyle(GUI.skin.label) { fontSize = 15, richText = true };
            big = new GUIStyle(GUI.skin.label) { fontSize = 26, fontStyle = FontStyle.Bold, richText = true };
            small = new GUIStyle(GUI.skin.label) { fontSize = 11, richText = true };
        }

        bool live = data != null && data.HasData;
        var p = live ? data.Latest : null;
        var cyc = CardiacCycle.Main;

        GUILayout.BeginArea(new Rect(12, 12, 380, 340), GUI.skin.box);

        if (live)
        {
            bool beatFlash = Time.unscaledTime - data.LastBeatTime < 0.18f;
            string src = string.IsNullOrEmpty(p.source) ? "STREAM" : p.source.ToUpper();
            GUILayout.Label($"<color=#ffbf26><b>{src}</b></color>  <color=#bbbbbb>t={p.time:0.0}s</color>" +
                            (data.RecentArtifact ? "   <color=#ffbf26>artifact rejected</color>" : ""), label);
            GUILayout.Label($"<color=#4cff73>{(beatFlash ? "♥" : "♡")} {p.bpm:0} bpm</color>" +
                            $"   <color=#bbbbbb>RR {p.rr_interval:0.00} s</color>", big);
            GUILayout.Label($"ABP  <b>{p.sbp:0}/{p.dbp:0}</b> mmHg   MAP {p.map:0} mmHg", label);
            GUILayout.Label($"SV*  <b>{p.stroke_volume:0}</b> mL     CO  <b>{p.cardiac_output:0.0}</b> L/min   CI  <b>{p.cardiac_index:0.0}</b> L/min/m²", label);
            GUILayout.Label($"Wall stress {p.wall_stress:0.0} kPa   Re {p.reynolds_number:0}", label);
            string riskHex = p.risk_level == "High" ? "#ff4033" : p.risk_level == "Low" ? "#4cff73" : "#ffbf26";
            bool blink = p.risk_level == "High" && Mathf.PingPong(Time.time * 2f, 1f) > 0.5f;
            GUILayout.Label($"Risk  <color={riskHex}><b>{(blink ? " " : p.risk_level.ToUpper())}</b></color>", big);
            if (cyc != null)
                GUILayout.Label($"Cycle: {cyc.PhaseName}   contraction {cyc.Strength * 100f:0}%", label);
        }
        else if (data != null && data.Connected && data.RecentArtifact)
        {
            // Connected and receiving, but the values fail physiological validation — the most dangerous case
            // must NOT be reported as a lost connection.
            var r = data.LastRejected;
            GUILayout.Label("<color=#ff4033><b>CONNECTED — VALUE OUT OF RANGE</b></color>", big);
            GUILayout.Label("Stream is alive but values failed physiological\nvalidation and are not being rendered:", label);
            if (r != null)
                GUILayout.Label($"<color=#ffbf26>HR {r.bpm:0}  ABP {r.sbp:0}/{r.dbp:0}  SV {r.stroke_volume:0}  CO {r.cardiac_output:0.0}</color>", label);
            GUILayout.Label("Check sensors/backend. Heart shows an internal\nrhythm, not this data.", label);
        }
        else
        {
            GUILayout.Label("<color=#ff4033><b>NO SIGNAL</b></color>", big);
            GUILayout.Label($"No stream from {(data != null ? data.url : "?")}\n" +
                            "Heart is running an internal demo rhythm —\nnothing shown is patient data.", label);
        }

        GUILayout.FlexibleSpace();
        GUILayout.Label("<color=#888888>*SV estimated from pulse pressure (PP×compliance), not measured.\n" +
                        "Education/research visualization — not a medical device.\n" +
                        "Not for diagnosis or clinical decision-making.</color>", small);
        GUILayout.EndArea();
    }
}
