using UnityEngine;

// Pulsatile blood flow along a route baked through the heart's hollow spaces (Tools > Cardiac Twin > Plan Blood Paths):
// vein -> atrium -> AV valve -> ventricle -> semilunar valve -> artery. Zone speeds are gated by the shared
// CardiacCycle, so blood pools behind shut valves, is topped off by the atrial kick, pauses during the
// isovolumetric phases, then ejects as a bolus — all locked to the same clock that drives the muscle.
public class BloodFlowPath : MonoBehaviour
{
    [System.Serializable]
    public struct Node
    {
        public string bone;
        public Vector3 offset; // metres, root space
    }

    public Transform root;
    [Tooltip("Planner seeds, in order: vein end, atrium, AV valve, ventricle, semilunar valve, artery end, " +
             "and optionally the open vessel rim + a point outside it for a visible outlet")]
    public Node[] nodes;
    [Tooltip("Planner hint: the artery runs out of sight after its valve (e.g. the aorta behind the pulmonary trunk), " +
             "so the route must not wander back through visible chambers")]
    public bool hiddenOutflow;

    [HideInInspector] public Vector3[] bakedPath;    // root space
    [HideInInspector] public float[] bakedClearance; // metres from each point to the nearest wall / cut face
    [HideInInspector] public bool[] bakedSeam;       // inside a hidden seam (solid vein stub, capped aorta base)
    [HideInInspector] public int atriumPoint, avValvePoint, ventriclePoint, valvePoint;
    [HideInInspector] public int exitPoint = -1;     // vessel rim; beyond it blood leaves the heart and fades

    public int dropletCount = 80;
    public float dropletScale = 0.003f;
    public Color color = Color.red;
    [Tooltip("Kept clear of walls on top of the droplet radius — the muscle moves ~1.5mm per beat")]
    public float wallMargin = 0.0015f;
    [Tooltip("Seconds of motion each droplet is stretched over — streaks merge into a continuous jet when fast")]
    public float stretch = 0.025f;

    [Header("Peak speeds, m/s (scaled by heart rate)")]
    public float venousSpeed = 0.03f;
    public float fillSpeed = 0.15f;
    public float ejectSpeed = 0.6f;
    public float arterialCoast = 0.05f;

    const int MaxBalls = 128; // matches MAX_BALLS in Resources/BloodLiquid.shader

    float[] dist, spin, jitter, cum;
    Vector3[] offsetDir, spinAxis, prevPos, vel;
    bool[] wasHidden;
    Vector4[] balls, tails; // head + radius, tail + speed: tapered streaks smooth-unioned into one liquid by the shader
    Transform volume;
    MeshRenderer volumeRenderer;
    Material liquid;

    void Start()
    {
        if (bakedPath == null || bakedPath.Length < 2)
        {
            Debug.LogWarning(name + ": no baked route — run Tools > Cardiac Twin > Plan Blood Paths", this);
            enabled = false;
            return;
        }
        cum = new float[bakedPath.Length];
        for (int i = 1; i < bakedPath.Length; i++) cum[i] = cum[i - 1] + Vector3.Distance(bakedPath[i - 1], bakedPath[i]);

        if (dropletCount > MaxBalls)
        {
            Debug.LogWarning(name + ": dropletCount capped at " + MaxBalls, this);
            dropletCount = MaxBalls;
        }
        liquid = new Material(Shader.Find("CardiacTwin/BloodLiquid"));
        liquid.SetColor("_Color", color);
        balls = new Vector4[MaxBalls];
        tails = new Vector4[MaxBalls];
        liquid.SetVectorArray("_Balls", balls);
        liquid.SetVectorArray("_Tails", tails);

        // Raymarch volume, refitted around the droplets every frame. Unparented so it stays an axis-aligned box.
        var box = GameObject.CreatePrimitive(PrimitiveType.Cube);
        box.name = name + "_blood";
        Destroy(box.GetComponent<Collider>());
        volumeRenderer = box.GetComponent<MeshRenderer>();
        volumeRenderer.sharedMaterial = liquid;
        volumeRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        volume = box.transform;

        dist = new float[dropletCount];
        spin = new float[dropletCount];
        jitter = new float[dropletCount];
        offsetDir = new Vector3[dropletCount];
        spinAxis = new Vector3[dropletCount];
        prevPos = new Vector3[dropletCount];
        vel = new Vector3[dropletCount];
        wasHidden = new bool[dropletCount];
        float total = cum[cum.Length - 1];
        for (int i = 0; i < dropletCount; i++)
        {
            dist[i] = total * i / dropletCount;
            offsetDir[i] = Random.insideUnitSphere;
            spinAxis[i] = Random.onUnitSphere;
            spin[i] = Random.Range(6f, 18f); // slow drift: droplets keep coherent lanes so the mass streams, not churns
            jitter[i] = Random.Range(0.8f, 1.2f);
        }
    }

    void LateUpdate()
    {
        float dt = Time.deltaTime;
        if (dt <= 0f) return;

        // Gate every zone by the shared cardiac cycle so flow and muscle stay perfectly coordinated. During the
        // isovolumetric phases both fill and eject are ~0, so the blood visibly holds still (all valves shut).
        var cyc = CardiacCycle.Main;
        float fill = cyc ? cyc.FillDrive : 0.5f;
        float eject = cyc ? cyc.EjectDrive : 0.5f;
        float venous = cyc ? cyc.VenousDrive : 0.5f;
        float scale = cyc ? cyc.SpeedScale : 1f;

        float total = cum[cum.Length - 1];
        float worldScale = transform.lossyScale.x;
        float smooth = 1f - Mathf.Exp(-dt * 14f);
        Vector3 lo = Vector3.positiveInfinity, hi = Vector3.negativeInfinity;
        float dAtrium = cum[atriumPoint], dVentricle = cum[ventriclePoint], dValve = cum[valvePoint];

        for (int i = 0; i < dropletCount; i++)
        {
            float d = dist[i];
            float v = d < dAtrium ? venousSpeed * venous             // veins -> atrium (continuous)
                    : d < dVentricle ? fillSpeed * fill              // atrium -> AV valve -> ventricle (fill + kick)
                    : d < dValve ? ejectSpeed * eject                // ventricle -> semilunar valve (ejection)
                    : Mathf.Max(ejectSpeed * eject, arterialCoast);  // artery / outlet
            d += v * jitter[i] * scale * dt;
            // Re-enter the vein after a random delay (negative d = still upstream, hidden) so returning blood
            // arrives as a steady trickle rather than the previous beat's bolus.
            bool wrapped = d >= total;
            if (wrapped) d = -Random.Range(0f, venousSpeed);
            dist[i] = d;

            float clearance;
            bool seam;
            Vector3 p = Sample(Mathf.Max(d, 0f), out clearance, out seam);
            float spread = Mathf.Max(0f, clearance - dropletScale * 0.5f - wallMargin);
            var swirl = Quaternion.AngleAxis(Time.time * spin[i], spinAxis[i]);
            Vector3 pos = root.TransformPoint(p + swirl * offsetDir[i] * spread);

            // Hidden while upstream or passing a seam, so the liquid never shows through a wall.
            bool hidden = d < 0f || seam;
            float fade = 1f;
            if (exitPoint >= 0 && d > cum[exitPoint]) fade = Mathf.Clamp01(1f - (d - cum[exitPoint]) / (total - cum[exitPoint]));
            // Shrink to fit tight spaces (the ~1.2mm valve orifices) so blood squeezes through the opening instead
            // of bulging through the leaflets, then swells back out in the chamber.
            float fit = Mathf.Clamp(clearance * 1.8f / dropletScale, 0.5f, 1f);
            float size = dropletScale * fade * fit;
            float r = hidden ? 0f : size * 0.5f * worldScale;

            // Smoothed velocity stretches the droplet into a streak; reset on (re)appearing so no streak spans a jump.
            if (hidden || wasHidden[i] || wrapped) vel[i] = Vector3.zero;
            else vel[i] = Vector3.Lerp(vel[i], (pos - prevPos[i]) / dt, smooth);
            prevPos[i] = pos;
            wasHidden[i] = hidden;
            Vector3 tail = pos - Vector3.ClampMagnitude(vel[i] * stretch, r * 8f);

            balls[i] = new Vector4(pos.x, pos.y, pos.z, r);
            tails[i] = new Vector4(tail.x, tail.y, tail.z, vel[i].magnitude);
            if (r > 0f)
            {
                Vector3 pad = Vector3.one * r * 2.2f; // radius + the shader's merge distance
                lo = Vector3.Min(lo, Vector3.Min(pos, tail) - pad);
                hi = Vector3.Max(hi, Vector3.Max(pos, tail) + pad);
            }
        }

        bool any = lo.x <= hi.x;
        volumeRenderer.enabled = any;
        if (!any) return;
        volume.position = (lo + hi) * 0.5f;
        volume.localScale = hi - lo;
        liquid.SetVectorArray("_Balls", balls);
        liquid.SetVectorArray("_Tails", tails);
        liquid.SetInteger("_Count", dropletCount);
    }

    void OnDestroy()
    {
        if (volume) Destroy(volume.gameObject);
        if (liquid) Destroy(liquid);
    }

    Vector3 Sample(float d, out float clearance, out bool seam)
    {
        int i = 0;
        while (i < cum.Length - 2 && cum[i + 1] < d) i++;
        float segLen = cum[i + 1] - cum[i];
        float t = segLen > 0f ? Mathf.Clamp01((d - cum[i]) / segLen) : 0f;
        clearance = Mathf.Lerp(bakedClearance[i], bakedClearance[i + 1], t);
        seam = bakedSeam != null && bakedSeam.Length == bakedPath.Length && (bakedSeam[i] || bakedSeam[i + 1]);
        return Vector3.Lerp(bakedPath[i], bakedPath[i + 1], t);
    }
}
