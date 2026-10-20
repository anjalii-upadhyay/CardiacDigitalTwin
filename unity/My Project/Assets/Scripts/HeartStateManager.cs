using UnityEngine;

/// <summary>
/// Central bridge between live backend packets and existing simulation components.
/// WebSocket code should only call ApplyPacket() on this manager.
/// Blood emission gating is centralized here from valve booleans only.
/// </summary>
[DefaultExecutionOrder(100)]
public class HeartStateManager : MonoBehaviour
{
    [Header("Simulation Targets")]
    public HeartCycleManager heartCycle;
    public ValveManager valveManager;

    [Header("Blood Flow Baselines")]
    public float baselineBloodFlow = 410f;
    public float baselineCardiacOutput = 5.1f;

    [Header("Presentation")]
    public bool presentationMode = true;

    [Header("Modulation Limits")]
    public float minFlowMultiplier = 0.25f;
    public float maxFlowMultiplier = 2.5f;

    HeartPacket latestPacket;
    bool hasLiveData;
    BloodFlowController[] bloodFlowControllers;
    UnityWebSocketClient webSocketClient;

    public bool HasLiveData => hasLiveData;
    public HeartPacket LatestPacket => latestPacket;

    void Start()
    {
        ResolveReferences();
        CacheBloodFlowControllers();
        webSocketClient = FindFirstObjectByType<UnityWebSocketClient>();

        if (presentationMode)
        {
            ResetBloodFlowModulation();
            if (heartCycle != null)
            {
                // Match visible heart animation for valve timing during presentation.
                heartCycle.useLiveCardiacPhase = false;
            }
        }

        ApplyCentralizedBloodGating();
    }

    void LateUpdate()
    {
        ApplyCentralizedBloodGating();
    }

    public void ApplyPacket(HeartPacket packet)
    {
        if (packet == null || !packet.IsValid())
        {
            Debug.LogWarning("[HeartStateManager] Ignored invalid packet.");
            return;
        }

        if (heartCycle == null)
        {
            ResolveReferences();
        }

        if (heartCycle == null)
        {
            Debug.LogWarning("[HeartStateManager] HeartCycleManager not found.");
            return;
        }

        latestPacket = packet;
        hasLiveData = true;
        ApplyToSimulation(packet);
        LogPacketDebug(packet);
    }

    void ApplyToSimulation(HeartPacket packet)
    {
        heartCycle.heartRate = Mathf.Max(packet.bpm, 0.01f);
        heartCycle.liveCardiacPhase = Mathf.Repeat(packet.cardiac_phase, 1f);
        // Presentation: valve booleans follow animator (visual beat).
        // Live mode: valve booleans follow backend cardiac_phase.
        heartCycle.useLiveCardiacPhase = !presentationMode;

        if (bloodFlowControllers == null || bloodFlowControllers.Length == 0)
        {
            CacheBloodFlowControllers();
        }

        if (bloodFlowControllers == null)
        {
            return;
        }

        if (presentationMode)
        {
            ResetBloodFlowModulation();
            return;
        }

        float flowMultiplier = ComputeMultiplier(
            packet.blood_flow,
            baselineBloodFlow);
        float outputMultiplier = ComputeMultiplier(
            packet.cardiac_output,
            baselineCardiacOutput);
        float combinedMultiplier = Mathf.Clamp(
            (flowMultiplier + outputMultiplier) * 0.5f,
            minFlowMultiplier,
            maxFlowMultiplier);

        for (int i = 0; i < bloodFlowControllers.Length; i++)
        {
            BloodFlowController controller = bloodFlowControllers[i];
            if (controller == null) continue;

            // Write multipliers through the property setters.
            // These do NOT apply emission — ApplyCentralizedBloodGating() in
            // LateUpdate() calls ApplyValveGating(), which is the single place
            // that writes rateOverTime after reading the current valve state.
            controller.EmissionRateMultiplier = combinedMultiplier;
            controller.ParticleSpeedMultiplier = flowMultiplier;
        }
    }

    void ResetBloodFlowModulation()
    {
        for (int i = 0; i < bloodFlowControllers.Length; i++)
        {
            BloodFlowController controller = bloodFlowControllers[i];
            if (controller == null) continue;

            controller.EmissionRateMultiplier = 1f;
            controller.ParticleSpeedMultiplier = 1f;
        }
    }

    float ComputeMultiplier(float liveValue, float baseline)
    {
        if (baseline <= 0f)
        {
            return 1f;
        }

        return Mathf.Clamp(liveValue / baseline, minFlowMultiplier, maxFlowMultiplier);
    }

    void ResolveReferences()
    {
        if (heartCycle == null)
        {
            heartCycle = FindFirstObjectByType<HeartCycleManager>();
        }

        if (valveManager == null)
        {
            valveManager = FindFirstObjectByType<ValveManager>();
        }
    }

    void CacheBloodFlowControllers()
    {
        bloodFlowControllers = FindObjectsByType<BloodFlowController>(
            FindObjectsInactive.Exclude,
            FindObjectsSortMode.None);
    }

    void ApplyCentralizedBloodGating()
    {
        if (valveManager == null)
        {
            ResolveReferences();
        }

        if (valveManager == null)
        {
            return;
        }

        if (bloodFlowControllers == null || bloodFlowControllers.Length == 0)
        {
            CacheBloodFlowControllers();
        }

        if (bloodFlowControllers == null)
        {
            return;
        }

        for (int i = 0; i < bloodFlowControllers.Length; i++)
        {
            BloodFlowController controller = bloodFlowControllers[i];
            if (controller == null)
            {
                continue;
            }

            controller.ApplyValveGating(valveManager, presentationMode);
        }
    }

    void LogPacketDebug(HeartPacket packet)
    {
        string socketState = webSocketClient != null
            ? webSocketClient.ConnectionState
            : "Unknown";

        string valveStates = valveManager == null
            ? ""
            : $" mitral={valveManager.mitralOpen}" +
              $" tricuspid={valveManager.tricuspidOpen}" +
              $" aortic={valveManager.aorticOpen}" +
              $" pulmonary={valveManager.pulmonaryOpen}";

        string cycleState = heartCycle == null
            ? ""
            : $" isSystole={heartCycle.isSystole} livePhase={heartCycle.useLiveCardiacPhase}";

        Debug.Log(
            $"[HeartStateManager] bpm={packet.bpm:F1} " +
            $"cardiac_phase={packet.cardiac_phase:F2} " +
            $"blood_flow={packet.blood_flow:F1} " +
            $"websocket={socketState}" +
            $"{cycleState}" +
            $"{valveStates}");
    }
}
