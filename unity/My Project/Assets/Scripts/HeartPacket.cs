using System;
using UnityEngine;

[Serializable]
public class HeartPacket
{
    public float bpm;
    public float rr_interval;
    public float sbp;
    public float dbp;
    public float map;
    public float stroke_volume;
    public float cardiac_output;
    public float blood_flow;
    public float wall_stress;
    public float reynolds_number;
    public float cardiac_phase;

    public bool IsValid()
    {
        return bpm > 0f && cardiac_output >= 0f && blood_flow >= 0f;
    }
}
