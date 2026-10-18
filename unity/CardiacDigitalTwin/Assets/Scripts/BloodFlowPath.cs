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

    [Header("Peak speeds, m/s (scaled by heart rate)")]
    public float venousSpeed = 0.03f;
    public float fillSpeed = 0.15f;
    public float ejectSpeed = 0.6f;
    public float arterialCoast = 0.05f;

    Transform[] droplets;
    TrailRenderer[] trails;
    float[] dist, spin, jitter, cum;
    bool[] wasHidden;
    Vector3[] offsetDir, spinAxis;

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

        var mat = new Material(Shader.Find("Standard"));
        mat.SetFloat("_Glossiness", 0.5f);
        mat.EnableKeyword("_EMISSION");
        var trailMat = new Material(Shader.Find("Sprites/Default"));
        var block = new MaterialPropertyBlock();

        droplets = new Transform[dropletCount];
        trails = new TrailRenderer[dropletCount];
        dist = new float[dropletCount];
        spin = new float[dropletCount];
        jitter = new float[dropletCount];
        wasHidden = new bool[dropletCount];
        offsetDir = new Vector3[dropletCount];
        spinAxis = new Vector3[dropletCount];
        float total = cum[cum.Length - 1];
        for (int i = 0; i < dropletCount; i++)
        {
            var c = color * Random.Range(0.75f, 1.1f);
            c.a = 1f;

            var d = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            d.name = name + "_droplet" + i;
            d.transform.SetParent(transform, false);
            Destroy(d.GetComponent<Collider>());
            var mr = d.GetComponent<MeshRenderer>();
            mr.sharedMaterial = mat;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            block.SetColor("_Color", c);
            block.SetColor("_EmissionColor", c * 0.35f);
            mr.SetPropertyBlock(block);

            var tr = d.AddComponent<TrailRenderer>();
            tr.time = 0.14f;
            tr.minVertexDistance = 0.001f;
            tr.widthMultiplier = dropletScale * 0.7f;
            tr.widthCurve = AnimationCurve.Linear(0f, 1f, 1f, 0f);
            tr.sharedMaterial = trailMat;
            tr.startColor = c;
            tr.endColor = new Color(c.r, c.g, c.b, 0f);
            tr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            droplets[i] = d.transform;
            trails[i] = tr;
            dist[i] = total * i / dropletCount;
            offsetDir[i] = Random.insideUnitSphere;
            spinAxis[i] = Random.onUnitSphere;
            spin[i] = Random.Range(40f, 120f);
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
            droplets[i].position = root.TransformPoint(p + swirl * offsetDir[i] * spread);

            // Hidden while upstream or passing a seam; reappearing at a vessel opening starts a fresh trail so no
            // streak is ever drawn through a wall.
            bool hidden = d < 0f || seam;
            float fade = 1f;
            if (exitPoint >= 0 && d > cum[exitPoint]) fade = Mathf.Clamp01(1f - (d - cum[exitPoint]) / (total - cum[exitPoint]));
            // Shrink to fit tight spaces (the ~1.2mm valve orifices) so blood squeezes through the opening instead
            // of bulging through the leaflets, then swells back out in the chamber.
            float fit = Mathf.Clamp(clearance * 1.8f / dropletScale, 0.5f, 1f);
            float size = dropletScale * fade * fit;
            droplets[i].localScale = hidden ? Vector3.zero : Vector3.one * size;
            trails[i].widthMultiplier = size * 0.7f;
            trails[i].emitting = !hidden;
            if (wrapped || (wasHidden[i] && !hidden)) trails[i].Clear();
            wasHidden[i] = hidden;
        }
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
