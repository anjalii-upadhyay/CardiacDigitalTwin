using UnityEngine;

[DefaultExecutionOrder(50)]
public class ValveManager : MonoBehaviour
{
    HeartCycleManager heartCycle;

    [Header("Valve States")]
    public bool mitralOpen;
    public bool tricuspidOpen;

    public bool aorticOpen;
    public bool pulmonaryOpen;

    void Start()
    {
        ResolveHeartCycle();
    }

    void Update()
    {
        if (heartCycle == null)
        {
            ResolveHeartCycle();
        }

        if (heartCycle == null)
        {
            // Safe fallback when cycle source is unavailable.
            mitralOpen = true;
            tricuspidOpen = true;
            aorticOpen = false;
            pulmonaryOpen = false;
            return;
        }

        if (heartCycle.isSystole)
        {
            // Ventricles contracting

            mitralOpen = false;
            tricuspidOpen = false;

            aorticOpen = true;
            pulmonaryOpen = true;
        }
        else
        {
            // Ventricles relaxing

            mitralOpen = true;
            tricuspidOpen = true;

            aorticOpen = false;
            pulmonaryOpen = false;
        }
    }

    void ResolveHeartCycle()
    {
        heartCycle = GetComponent<HeartCycleManager>();
        if (heartCycle == null)
        {
            heartCycle = GetComponentInParent<HeartCycleManager>();
        }
        if (heartCycle == null)
        {
            heartCycle = FindFirstObjectByType<HeartCycleManager>();
        }
    }
}