using UnityEngine;

// Tints the heart by the selected patient's congestion LEAN (chance of congestion >= 50%; the simulated lean in the
// dashboard's medicine simulator): leans congested = pulsing red glow, otherwise none. No data = none.
// Property block only — the material asset is never modified.
public class CongestionTint : MonoBehaviour
{
    public HeartDataClient data;
    public SkinnedMeshRenderer heartRenderer;

    static readonly Color Red = new Color(1f, 0.25f, 0.2f);
    MaterialPropertyBlock block;

    void Start()
    {
        if (data == null) data = FindAnyObjectByType<HeartDataClient>();
        if (heartRenderer == null)
        {
            var heart = GameObject.Find("BeatingHeart");
            if (heart != null) heartRenderer = heart.GetComponentInChildren<SkinnedMeshRenderer>();
        }
    }

    void Update()
    {
        if (heartRenderer == null) return;
        block ??= new MaterialPropertyBlock();   // lazily: survives an editor script reload during Play mode
        bool congested = data != null && data.HasData && data.Latest.lean == "congested";
        Color emission = congested ? Red * (0.10f + 0.14f * (0.5f + 0.5f * Mathf.Sin(Time.time * 6f))) : Color.black;
        block.SetColor("_EmissionColor", emission);
        heartRenderer.SetPropertyBlock(block);
    }
}
