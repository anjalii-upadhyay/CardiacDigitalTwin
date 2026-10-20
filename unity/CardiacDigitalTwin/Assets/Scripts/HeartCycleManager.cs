using UnityEngine;

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

    Animator animator;

    float timer;

    void Start()
    {
        animator = GetComponent<Animator>();

        UpdateCycle();
    }

    void Update()
    {
        timer += Time.deltaTime;

        if(timer>=cycleDuration)
        {
            timer=0;
        }

        isSystole = timer < systoleDuration;

        UpdateAnimation();
    }

    void UpdateCycle()
    {
        cycleDuration = 60f/heartRate;

        systoleDuration = cycleDuration*0.35f;

        diastoleDuration = cycleDuration*0.65f;
    }

    void UpdateAnimation()
    {
        if(animator!=null)
        {
            animator.speed = heartRate/72f;
        }
    }
}