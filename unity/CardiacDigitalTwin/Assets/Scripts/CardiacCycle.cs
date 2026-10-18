using UnityEngine;

// One coordinated cardiac cycle driving BOTH the muscle animation and the blood flow from a single clock.
//
// Live mode (HeartDataClient has fresh packets): the cycle is slaved beat-for-beat to the patient's ECG.
// The backend's cardiac_phase is 0 at each R-peak and 1 at the next, so every real beat — early, late or
// skipped — is reproduced exactly. Stroke volume scales contraction depth and ejection strength; cardiac
// output scales flow speed. On signal loss the heart falls back to an internal rhythm and says so.
//
// Phase timings are rate-dependent, not fixed fractions: ejection time and pre-ejection period follow the
// Weissler systolic-time-interval regressions (Weissler et al., Circulation 1968: LVET = 413 - 1.7*HR ms,
// QS2 = 546 - 2.1*HR ms), isovolumetric relaxation ~70 ms, atrial systole ~100 ms, rapid filling ~130 ms,
// with DIASTASIS absorbing the remainder — so at high heart rates diastole shortens first, as it really does.
[DefaultExecutionOrder(-50)]
public class CardiacCycle : MonoBehaviour
{
    public static CardiacCycle Main { get; private set; }

    [Header("Fallback rhythm (used only when no live data)")]
    [Range(40f, 180f)] public float beatsPerMinute = 72f;
    public string animationState = "test";

    [Header("Live data scaling (textbook resting references)")]
    public HeartDataClient data;                 // auto-found if left empty
    public float normalStrokeVolume = 70f;       // mL   (normal resting SV ~55-100)

    const float RestingBpm = 72f;
    const float MaxPursuit = 3.5f;               // cycles/s cap when catching up to an early beat (~210 bpm sweep)

    // Muscle clip poses sampled from the baked "test" clip: widest (relaxed) vs narrowest (contracted).
    const float ClipRelaxed = 0f, ClipContracted = 0.22f;

    public float Phase { get; private set; }        // 0..1; 0 = atrial systole onset, rPhase = R-peak
    public float EjectDrive { get; private set; }   // ventricle -> artery, 0..1
    public float FillDrive { get; private set; }    // atrium -> ventricle (passive fill + atrial kick), 0..1
    public float VenousDrive { get; private set; }  // vein -> atrium, always > 0
    public float Strength { get; private set; } = 1f; // 0.25..1.25 contraction/ejection strength from stroke volume
    public bool LiveDriven { get; private set; }

    // Live mode: 1 — heart rate already enters through the cycle rate and stroke volume through Strength, so an
    // extra cardiac-output factor would double-count both (flow would scale ~SV²·HR²). Fallback keeps bpm scaling.
    public float SpeedScale => LiveDriven ? 1f : beatsPerMinute / RestingBpm;

    // Dynamic phase boundaries (fractions of the current cycle), rebuilt each frame from RR.
    float rPhase = 0.12f;      // end of atrial systole = R-peak
    float icEnd = 0.18f;       // end of pre-ejection period (valves all shut)
    float ejEnd = 0.47f;       // end of ejection
    float irEnd = 0.55f;       // end of isovolumetric relaxation
    float rfEnd = 0.71f;       // end of rapid filling; then diastasis to 1.0

    public string PhaseName =>
        Phase < rPhase ? "atrial systole" :
        Phase < icEnd ? "isovolumetric contraction" :
        Phase < ejEnd ? "ventricular ejection" :
        Phase < irEnd ? "isovolumetric relaxation" :
        Phase < rfEnd ? "rapid filling" : "diastasis";

    float lvetSec = 0.29f;
    Animation anim;
    AnimationState state;

    void Awake() { Main = this; }

    void Start()
    {
        anim = GetComponentInChildren<Animation>();
        if (anim != null && !string.IsNullOrEmpty(animationState) && anim[animationState] != null)
        {
            anim.playAutomatically = false;
            anim.Play(animationState);
            state = anim[animationState];
            state.speed = 0f; // the pose is scrubbed from this clock, never free-running
        }
        if (data == null) data = FindFirstObjectByType<HeartDataClient>();
    }

    void Update()
    {
        float dt = Time.deltaTime;
        LiveDriven = data != null && data.HasData;

        float rr = LiveDriven ? data.Latest.rr_interval : 60f / beatsPerMinute;
        UpdateTimings(rr);

        if (LiveDriven)
        {
            var p = data.Latest;
            // Map ECG phase (0 at R) onto this cycle (R at rPhase). The ECG phase runs straight through, so
            // atrial systole (the last rPhase of the cycle here) plays in the lead-up to the expected next R —
            // the kick correctly PRECEDES the QRS. A late beat holds just before R; an early beat is chased at a
            // bounded rate so it plays as a visibly quick beat instead of a teleport.
            float target = Mathf.Repeat(rPhase + Mathf.Min(p.cardiac_phase, 0.995f), 1f);
            if (data.ConsumeSegmentBreak())
            {
                Phase = target; // dataset splice: resync instantly, never act it out as a pathological pause
            }
            else if (data.DataAge > 0.25f)
            {
                // Packet gap but not yet signal-loss: dead-reckon at the last known RR instead of freezing.
                Phase = Mathf.Repeat(Phase + dt / Mathf.Max(p.rr_interval, 0.2f), 1f);
            }
            else
            {
                float delta = Mathf.Repeat(target - Phase, 1f);
                if (delta < 0.9f) Phase = Mathf.Repeat(Phase + Mathf.Min(delta, dt * MaxPursuit), 1f);
            }

            float sv = Mathf.Clamp(p.stroke_volume / normalStrokeVolume, 0.25f, 1.25f);
            Strength = Mathf.Lerp(Strength, sv, 1f - Mathf.Exp(-dt * 3f));
        }
        else
        {
            Phase = Mathf.Repeat(Phase + dt * beatsPerMinute / 60f, 1f);
            Strength = Mathf.Lerp(Strength, 1f, 1f - Mathf.Exp(-dt * 3f));
        }

        ComputeDrives(Phase);
        // Ejection velocity ~ SV / LVET: weak pumping -> weak bolus; a hyperdynamic SV (>1) or a rate-shortened
        // LVET pushes the jet faster. HR itself enters only through the cycle rate.
        EjectDrive *= Mathf.Lerp(0.35f, 1f, Mathf.Min(Strength, 1f)) * Mathf.Max(1f, Strength)
                      * Mathf.Clamp(0.28f / lvetSec, 0.75f, 1.5f);
        PoseMuscle(Phase);
    }

    // Rate-dependent phase boundaries from the current RR interval.
    void UpdateTimings(float rr)
    {
        rr = Mathf.Clamp(rr, 0.27f, 3.5f); // 17-220 bpm
        float hr = Mathf.Min(60f / rr, 220f);
        float atrial = 0.10f;                                           // s, atrial contraction
        float lvet = Mathf.Max(0.10f, (413f - 1.7f * hr) / 1000f);      // s, Weissler ejection time (men)
        float pep = Mathf.Max(0.04f, (131f - 0.4f * hr) / 1000f);       // s, Weissler QS2 - LVET (men)
        float ivr = 0.07f;                                              // s, isovolumetric relaxation
        float rfill = 0.13f;                                            // s, rapid filling wave

        // Tachycardia shortens diastole FIRST: diastasis is already gone (it's the remainder), so next shrink the
        // filling wave and atrial kick (E/A fusion) down to floors, and only then compress systole itself.
        float budget = rr * 0.98f;
        float over = atrial + pep + lvet + ivr + rfill - budget;
        if (over > 0f)
        {
            float give = Mathf.Min(over, (rfill - 0.05f) + (atrial - 0.05f));
            float fromFill = Mathf.Min(rfill - 0.05f, give * (rfill - 0.05f) / Mathf.Max(1e-4f, (rfill - 0.05f) + (atrial - 0.05f)));
            rfill -= fromFill;
            atrial -= give - fromFill;
            over -= give;
        }
        float squeeze = over > 0f ? budget / (atrial + pep + lvet + ivr + rfill) : 1f;

        lvetSec = lvet * squeeze;
        rPhase = atrial * squeeze / rr;
        icEnd = rPhase + pep * squeeze / rr;
        ejEnd = icEnd + lvetSec / rr;
        irEnd = ejEnd + ivr * squeeze / rr;
        rfEnd = irEnd + rfill * squeeze / rr;                           // remainder (possibly ~0) is diastasis
    }

    void ComputeDrives(float p)
    {
        // Ejection: semilunar valves open only during LVET; velocity peaks early (rapid ejection phase).
        EjectDrive = p >= icEnd && p < ejEnd
            ? Mathf.Sin(Mathf.PI * Mathf.Pow(Norm(p, icEnd, ejEnd), 0.7f))
            : 0f;

        // Filling: atrial kick tops off the ventricle (~20-30% of filling at rest), AV valves shut through all
        // of ventricular systole, rapid passive filling once they reopen, tailing into diastasis.
        float kick = p < rPhase ? 0.6f * Mathf.Sin(Mathf.PI * Norm(p, 0f, rPhase)) : 0f;
        float rapid = p >= irEnd && p < rfEnd ? Mathf.Sin(Mathf.PI * Norm(p, irEnd, rfEnd)) : 0f;
        float diastasis = p >= rfEnd ? Mathf.Lerp(0.25f, 0.1f, Norm(p, rfEnd, 1f)) : 0f;
        FillDrive = Mathf.Max(kick, Mathf.Max(rapid, diastasis));
        bool avShut = p >= rPhase && p < irEnd;
        if (avShut) FillDrive = 0f;

        // Veins have no valves: continuous return, a little faster while the shut AV valve lets the atrium fill.
        VenousDrive = avShut ? 0.9f : 0.45f;
    }

    void PoseMuscle(float p)
    {
        if (state == null) return;
        // Contract over PEP+ejection, relax over the long diastole. Contraction DEPTH scales with Strength so a
        // low stroke volume visibly reduces the squeeze (hypokinesis). Note: SV here is the backend's
        // pulse-pressure surrogate (PP x compliance), not a contractility measurement.
        float contracted = Mathf.Lerp(ClipRelaxed + 0.35f * (ClipContracted - ClipRelaxed), ClipContracted, Mathf.Min(Strength, 1f));
        float x = Mathf.Repeat(p - rPhase, 1f);
        float contractSpan = ejEnd - rPhase;
        float clip = x < contractSpan
            ? Mathf.Lerp(ClipRelaxed, contracted, x / contractSpan)
            : Mathf.Lerp(contracted, 1f, (x - contractSpan) / (1f - contractSpan));
        state.normalizedTime = clip;
        anim.Sample();
    }

    static float Norm(float v, float a, float b) => Mathf.Clamp01((v - a) / (b - a));
}
