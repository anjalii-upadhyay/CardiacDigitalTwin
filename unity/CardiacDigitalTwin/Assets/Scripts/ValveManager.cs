using UnityEngine;

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
        heartCycle = GetComponent<HeartCycleManager>();
    }

    void Update()
    {
        if(heartCycle.isSystole)
        {
            mitralOpen=false;
            tricuspidOpen=false;

            aorticOpen=true;
            pulmonaryOpen=true;
        }

        else
        {
            mitralOpen=true;
            tricuspidOpen=true;

            aorticOpen=false;
            pulmonaryOpen=false;
        }
    }
}