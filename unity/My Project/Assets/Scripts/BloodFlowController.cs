using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Controls particle emission for one blood-flow emitter group.
///
/// SINGLE SOURCE OF TRUTH GUARANTEE:
///   emission.rateOverTime is written in EXACTLY ONE place: ApplyEmitterGate().
///   No other method, coroutine, or external caller may write rateOverTime or
///   call ps.Play() / ps.Stop() / ps.Emit() on any managed emitter.
///
/// VALVE GATING CONTRACT:
///   - When the corresponding valve boolean is FALSE  → rateOverTime = 0 always.
///   - When the corresponding valve boolean is TRUE   → rateOverTime = flowRate
///     × emissionRateMultiplier (modulated by live backend data).
///   - emissionRateMultiplier and particleSpeedMultiplier are set by
///     HeartStateManager ONLY. They are private to prevent external writes.
///
/// EXECUTION ORDER:
///   HeartStateManager [DefaultExecutionOrder(100)] calls ApplyValveGating()
///   from LateUpdate(), which runs after ValveManager [DefaultExecutionOrder(50)]
///   has already updated valve booleans in Update(). This guarantees the gate
///   always reads the current-frame valve state.
///
/// PARTICLE SIMULATION:
///   Emitters use playOnAwake = false in the scene. They must stay in Playing
///   state with rateOverTime = 0 when closed. EnsureEmitterPlaying() starts
///   simulation once; gating only toggles rate after rate is forced to 0.
/// </summary>
public class BloodFlowController : MonoBehaviour
{
    public enum FlowGate
    {
        AutoByName,
        PulmonaryOpen,
        TricuspidOpen,
        MitralOpen,
        AorticOpen
    }

    public ValveManager valveManager;
    public FlowGate flowGate = FlowGate.AutoByName;

    public ParticleSystem emitterA;
    public ParticleSystem emitterB;
    public ParticleSystem emitterC;

    public float flowRate = 100f;

    [Header("Live Backend Modulation — written by HeartStateManager only")]
    // These fields are read by ApplyEmitterGate. HeartStateManager is the only
    // caller that writes them. No other script should assign these directly.
    [SerializeField] float emissionRateMultiplier = 1f;
    [SerializeField] float particleSpeedMultiplier = 1f;

    // Baseline values captured once from the Inspector configuration.
    readonly Dictionary<ParticleSystem, float> baseStartSpeeds     = new Dictionary<ParticleSystem, float>();
    readonly Dictionary<ParticleSystem, float> baseStartLifetimes = new Dictionary<ParticleSystem, float>();
    readonly Dictionary<ParticleSystem, float> baseEmissionRates  = new Dictionary<ParticleSystem, float>();

    // Transition logging — only log when open/closed state changes.
    readonly Dictionary<ParticleSystem, bool> lastEmitterOpenStates    = new Dictionary<ParticleSystem, bool>();
    readonly Dictionary<ParticleSystem, bool> emitterOpenInitialized   = new Dictionary<ParticleSystem, bool>();

    // ── Public accessors for HeartStateManager ────────────────────────────────
    // HeartStateManager writes multipliers through these properties.
    // The property setter does NOT apply emission — that happens only in
    // ApplyValveGating() called from HeartStateManager.LateUpdate().
    public float EmissionRateMultiplier
    {
        get => emissionRateMultiplier;
        set => emissionRateMultiplier = Mathf.Max(value, 0f);
    }

    public float ParticleSpeedMultiplier
    {
        get => particleSpeedMultiplier;
        set => particleSpeedMultiplier = Mathf.Max(value, 0f);
    }

    // ── Diagnostics ───────────────────────────────────────────────────────────
    // Prints emitter state every second. Remove after diagnosis is complete.
    float diagTimer;
    const float DiagInterval = 1f;

    void Update()
    {
        diagTimer += Time.deltaTime;
        if (diagTimer >= DiagInterval)
        {
            diagTimer = 0f;
            PrintDiagnostics();
        }
    }

    void PrintDiagnostics()
    {
        PrintEmitterDiag(emitterA);
        PrintEmitterDiag(emitterB);
        PrintEmitterDiag(emitterC);
    }

    void PrintEmitterDiag(ParticleSystem ps)
    {
        if (ps == null) return;

        FlowGate gate      = ResolveValveGate(ps);
        bool     valveOpen = valveManager != null && GetValveOpen(valveManager, gate);
        float    rate      = ps.emission.rateOverTime.constant;
        int      count     = ps.particleCount;
        string   label     = GateLabel(gate);
        string vmState = valveManager == null ? "ValveManager=NULL" : "ok";
        string valveStates = valveManager == null
            ? ""
            : $" M={valveManager.mitralOpen} T={valveManager.tricuspidOpen}" +
              $" A={valveManager.aorticOpen} P={valveManager.pulmonaryOpen}";

        Debug.Log(
            $"[DIAG] emitter={ps.gameObject.name}" +
            $" mappedValve={label}" +
            $" gate={gate}" +
            $" valveOpen={valveOpen}" +
            $" emission={rate:F1}" +
            $" particles={count}" +
            $" isPlaying={ps.isPlaying}" +
            $" speed={ps.main.startSpeed.constant:F2}" +
            $" lifetime={ps.main.startLifetime.constant:F2}" +
            $" valves[{valveStates}]" +
            $" vm={vmState}");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    void Awake()
    {
        // Capture inspector emission rates before first gate forces rate to 0.
        CacheEmitterBaselines(emitterA);
        CacheEmitterBaselines(emitterB);
        CacheEmitterBaselines(emitterC);

        // Zero all emitters immediately so the Inspector's default rateOverTime
        // never fires before the first ApplyValveGating() call.
        // The particle system stays in Playing state; rate = 0 = closed.
        ZeroEmitterRate(emitterA);
        ZeroEmitterRate(emitterB);
        ZeroEmitterRate(emitterC);

        EnsureEmitterPlaying(emitterA);
        EnsureEmitterPlaying(emitterB);
        EnsureEmitterPlaying(emitterC);
    }

    void Start()
    {
        ResolveValveManager();
        ResolveLocalEmitter();
        CacheEmitterBaselines(emitterA);
        CacheEmitterBaselines(emitterB);
        CacheEmitterBaselines(emitterC);

        EnsureEmitterPlaying(emitterA);
        EnsureEmitterPlaying(emitterB);
        EnsureEmitterPlaying(emitterC);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Public gate entry point — called ONLY by HeartStateManager.LateUpdate()
    // ─────────────────────────────────────────────────────────────────────────

    /// <summary>
    /// Apply valve gating to all managed emitters.
    /// This is the ONLY method that writes emission.rateOverTime.
    /// Must be called after ValveManager.Update() has set valve booleans.
    /// </summary>
    public void ApplyValveGating(ValveManager valves, bool presentationMode = false)
    {
        if (valves == null) return;

        ApplyEmitterValveGate(emitterA, valves, presentationMode);
        ApplyEmitterValveGate(emitterB, valves, presentationMode);
        ApplyEmitterValveGate(emitterC, valves, presentationMode);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Private gate implementation
    // ─────────────────────────────────────────────────────────────────────────

    void ApplyEmitterValveGate(ParticleSystem ps, ValveManager valves, bool presentationMode)
    {
        if (ps == null) return;

        FlowGate gate = ResolveValveGate(ps);
        if (gate == FlowGate.AutoByName)
        {
            // ROOT CAUSE WARNING: this emitter has no valve assignment.
            // Either rename the emitter/parent GameObject to include one of:
            //   "Tricuspid", "Mitral", "Pulmonary", "Aortic", "Aorta"
            // OR set the flowGate field on this BloodFlowController in the Inspector.
            // Until fixed, emission is forced to 0 every frame.
            Debug.LogWarning(
                $"[BloodFlowController] '{ps.gameObject.name}' has no valve mapping. " +
                $"Rename the GameObject or set flowGate in the Inspector. " +
                $"Emission will remain 0.");
            ApplyEmitterGate(ps, false, "Unassigned", presentationMode);
            return;
        }

        bool open = GetValveOpen(valves, gate);
        ApplyEmitterGate(ps, open, GateLabel(gate), presentationMode);
    }

    /// <summary>
    /// THE SINGLE PLACE that writes emission.rateOverTime.
    ///
    /// When open == false: rateOverTime is set to exactly 0.
    ///   No multiplier, no modulation, no exceptions.
    ///
    /// When open == true: rateOverTime = flowRate × emissionRateMultiplier.
    ///   Speed and lifetime are also modulated here.
    ///
    /// Particle system must be Playing for rateOverTime to spawn particles.
    /// </summary>
    void ApplyEmitterGate(ParticleSystem ps, bool open, string emitterLabel, bool presentationMode)
    {
        CacheEmitterBaselines(ps);
        EnsureEmitterPlaying(ps);

        float openRate = presentationMode
            ? GetInspectorEmissionRate(ps)
            : flowRate * emissionRateMultiplier;

        // Log only on state transitions to avoid log spam.
        if (!emitterOpenInitialized.TryGetValue(ps, out bool initialized)
            || !initialized
            || lastEmitterOpenStates[ps] != open)
        {
            Debug.Log(open
                ? $"[Emitter:{emitterLabel}] OPEN  rate={openRate:F1}"
                : $"[Emitter:{emitterLabel}] CLOSED rate=0");
            emitterOpenInitialized[ps] = true;
            lastEmitterOpenStates[ps]  = open;
        }

        // ── SINGLE WRITE TO rateOverTime ─────────────────────────────────────
        // Valve closed → exactly 0, unconditionally.
        // Valve open   → inspector rate (presentation) or flowRate × multiplier.
        var emission = ps.emission;
        emission.rateOverTime = open ? openRate : 0f;

        if (presentationMode)
        {
            RestoreInspectorParticleSettings(ps);
        }
        else
        {
            ApplyParticleSpeed(ps);
            ApplyParticleLifetime(ps, open);
        }
    }

    float GetInspectorEmissionRate(ParticleSystem ps)
    {
        if (baseEmissionRates.TryGetValue(ps, out float cachedRate) && cachedRate > 0f)
        {
            return cachedRate;
        }

        return flowRate;
    }

    void RestoreInspectorParticleSettings(ParticleSystem ps)
    {
        var main = ps.main;
        main.startSpeed = baseStartSpeeds[ps];
        main.startLifetime = baseStartLifetimes[ps];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secondary visual modulation (speed / lifetime)
    // ─────────────────────────────────────────────────────────────────────────

    void ApplyParticleSpeed(ParticleSystem ps)
    {
        var main = ps.main;
        main.startSpeed = baseStartSpeeds[ps] * particleSpeedMultiplier;
    }

    void ApplyParticleLifetime(ParticleSystem ps, bool open)
    {
        var main = ps.main;
        float baseLifetime = baseStartLifetimes[ps];
        // Shrink lifetime when closed so any already-emitted particles
        // (from the previous open frame) fade out quickly.
        main.startLifetime = open ? baseLifetime : baseLifetime * 0.05f;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    static void ZeroEmitterRate(ParticleSystem ps)
    {
        if (ps == null) return;
        var emission = ps.emission;
        emission.rateOverTime = 0f;
    }

    static void EnsureEmitterPlaying(ParticleSystem ps)
    {
        if (ps == null)
        {
            return;
        }

        if (!ps.isPlaying)
        {
            var emission = ps.emission;
            emission.rateOverTime = 0f;
            ps.Play(true);
        }
    }

    static bool GetValveOpen(ValveManager valves, FlowGate gate)
    {
        switch (gate)
        {
            case FlowGate.PulmonaryOpen:  return valves.pulmonaryOpen;
            case FlowGate.TricuspidOpen:  return valves.tricuspidOpen;
            case FlowGate.MitralOpen:     return valves.mitralOpen;
            case FlowGate.AorticOpen:     return valves.aorticOpen;
            default:                      return false;
        }
    }

    FlowGate ResolveValveGate(ParticleSystem ps)
    {
        Transform current = ps.transform;
        while (current != null)
        {
            FlowGate gate = MatchValveName(current.name);
            if (gate != FlowGate.AutoByName) return gate;
            current = current.parent;
        }

        return flowGate != FlowGate.AutoByName ? flowGate : FlowGate.AutoByName;
    }

    static FlowGate MatchValveName(string objectName)
    {
        if (objectName.IndexOf("Tricuspid", System.StringComparison.OrdinalIgnoreCase) >= 0)
            return FlowGate.TricuspidOpen;
        if (objectName.IndexOf("Mitral",    System.StringComparison.OrdinalIgnoreCase) >= 0)
            return FlowGate.MitralOpen;
        if (objectName.IndexOf("Pulmonary", System.StringComparison.OrdinalIgnoreCase) >= 0)
            return FlowGate.PulmonaryOpen;
        if (objectName.IndexOf("Aortic",    System.StringComparison.OrdinalIgnoreCase) >= 0 ||
            objectName.IndexOf("Aorta",     System.StringComparison.OrdinalIgnoreCase) >= 0)
            return FlowGate.AorticOpen;
        return FlowGate.AutoByName;
    }

    static string GateLabel(FlowGate gate)
    {
        switch (gate)
        {
            case FlowGate.PulmonaryOpen: return "Pulmonary";
            case FlowGate.TricuspidOpen: return "Tricuspid";
            case FlowGate.MitralOpen:    return "Mitral";
            case FlowGate.AorticOpen:    return "Aortic";
            default:                     return "Unassigned";
        }
    }

    void CacheEmitterBaselines(ParticleSystem ps)
    {
        if (ps == null) return;
        if (!baseStartSpeeds.ContainsKey(ps))
            baseStartSpeeds[ps] = ps.main.startSpeed.constant;
        if (!baseStartLifetimes.ContainsKey(ps))
            baseStartLifetimes[ps] = ps.main.startLifetime.constant;
        if (!baseEmissionRates.ContainsKey(ps))
        {
            float inspectorRate = ps.emission.rateOverTime.constant;
            baseEmissionRates[ps] = inspectorRate > 0f ? inspectorRate : flowRate;
        }
    }

    void ResolveLocalEmitter()
    {
        if (emitterA != null || emitterB != null || emitterC != null) return;
        ParticleSystem local = GetComponent<ParticleSystem>();
        if (local != null) emitterA = local;
    }

    void ResolveValveManager()
    {
        if (valveManager != null) return;
        valveManager = GetComponent<ValveManager>()
            ?? GetComponentInParent<ValveManager>()
            ?? FindFirstObjectByType<ValveManager>();
    }
}
