using UnityEngine;

[DefaultExecutionOrder(40)]
public class HeartCycleManager : MonoBehaviour
{
    [Header("Heart Data")]
    public float heartRate = 72f;

    [Header("Cycle Values")]
    public float cycleDuration;
    public float systoleDuration;
    public float diastoleDuration;

    [Header("Current State")]
    public bool isSystole;

    [Header("Live Backend")]
    public bool useLiveCardiacPhase;
    [Range(0f, 1f)]
    public float liveCardiacPhase;

    Animator animator;

    float timer;
    float lastHeartRate;

    void Start()
    {
        animator = GetComponent<Animator>();
        UpdateCycle();
        lastHeartRate = heartRate;
    }

    void Update()
    {
        if (!Mathf.Approximately(heartRate, lastHeartRate))
        {
            UpdateCycle();
            lastHeartRate = heartRate;
        }

        UpdateAnimation();

        timer += Time.deltaTime;

        if (cycleDuration > 0f && timer >= cycleDuration)
        {
            timer %= cycleDuration;
        }

        float systoleFraction = cycleDuration > 0f ? systoleDuration / cycleDuration : 0.35f;

        if (useLiveCardiacPhase)
        {
            isSystole = Mathf.Repeat(liveCardiacPhase, 1f) < systoleFraction;
        }
        else if (animator != null && animator.runtimeAnimatorController != null)
        {
            AnimatorStateInfo stateInfo = animator.GetCurrentAnimatorStateInfo(0);
            float normalizedLoopTime = Mathf.Repeat(stateInfo.normalizedTime, 1f);
            isSystole = normalizedLoopTime < systoleFraction;
        }
        else
        {
            isSystole = timer < systoleDuration;
        }
    }

    void UpdateCycle()
    {
        heartRate = Mathf.Max(heartRate, 0.01f);
        cycleDuration = 60f / heartRate;

        systoleDuration = cycleDuration * 0.35f;

        diastoleDuration = cycleDuration * 0.65f;
    }

    void UpdateAnimation()
    {
        if(animator!=null)
        {
            animator.speed = heartRate/72f;
        }
    }
}