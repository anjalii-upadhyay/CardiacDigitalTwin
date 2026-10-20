using UnityEngine;
using UnityEngine.InputSystem;

public class WebSocketHeartReceiver : MonoBehaviour
{
    public HeartCycleManager heartCycle;

    public float heartRate;
    public float spo2;
    public float riskScore;

    void Start()
    {
        if(heartCycle==null)
        {
            heartCycle = FindFirstObjectByType<HeartCycleManager>();
        }
    }

    public void UpdateHeartData(
        float hr,
        float oxygen,
        float risk)
    {
        heartRate=hr;
        spo2=oxygen;
        riskScore=risk;

        heartCycle.heartRate=heartRate;

        UpdateVisuals();
    }

    void UpdateVisuals()
    {
        if(riskScore>.7f)
        {
            Debug.Log("High Risk");
        }

        if(spo2<94)
        {
            Debug.Log("Low Oxygen");
        }
    }

    void Update()
    {
        if (Keyboard.current != null &&
            Keyboard.current.hKey.wasPressedThisFrame)
        {
            UpdateHeartData(
                120f,   // HR
                90f,    // SpO2
                0.8f    // Risk
            );
        }
    }
}