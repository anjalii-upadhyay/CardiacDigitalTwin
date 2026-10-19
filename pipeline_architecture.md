# Pipeline Architecture: Heart Digital Twin

**Challenge:** Happiest Health Digital Twin Challenge 2026
**Deadline:** 20 Oct 2026, 7:00 PM IST

How this file works: the overview below is fixed. Each step gets its detailed section under **Finalised steps** only after we have agreed on it.

Status legend: ⬜ not started · 🟡 in discussion · ✅ finalised

---

## The solution in simple words

Think of our heart project like a **monitoring and alerting system for a server**. The goal is to warn the doctor *before* the incident, not after it.

- **Digital twin** means a live virtual copy. Ours is a 3D heart that beats exactly like the patient's real heart, driven by their live signals. This part is already built.
- **What's missing is the "early warning brain".** Today the system only says "the heart is in trouble right now". The challenge wants it to say "trouble is coming in about 10 minutes", using two kinds of data together:
  - the patient's history file (age, past illnesses, lab reports; called the EHR, *electronic health record*), and
  - the live signals from the body (the heartbeat's electrical signal, called ECG, and blood pressure over time).
- **The doctor's screen** then shows the twin, the warning, and the reason for it.

---

## The workflow in 7 steps

| # | Step | What it means | Status |
|---|------|---------------|--------|
| 1 | Choose the problem | Which heart danger do we warn about? | ✅ finalised |
| 2 | Collect the data | Patient history files plus heart-signal recordings | ⬜ |
| 3 | Prepare the data | Cut the recordings into small pieces and mark where the danger really happened | ⬜ |
| 4 | Build and test the warning brain | Try simple models and TimesFM, tested fairly on patients the model never saw | ⬜ |
| 5 | Plug it into the twin | The 3D heart shows the live warning | ⬜ |
| 6 | Doctor's dashboard | Forecast, how early the warning came, and why | ⬜ |
| 7 | Submission pack | README, architecture diagram, slides, and the 20-minute video | ⬜ |

---

## Finalised steps

### Step 1: Choose the problem ✅ (2026-10-18)

**Decision:** warn about a **sudden blood pressure crash (*hypotension*)**, with **severity levels**.

**In simple words:** the system watches a patient's live heart signals together with their history file. About 10 minutes before a blood pressure crash, it warns the doctor. The warning has three levels: **mild**, **serious**, and **critical** (a deeper and longer crash is worse). The exact cut-off numbers and the exact "how far ahead" are fixed in Step 3 and tested in Step 4.

**Why this problem:**
- Real patient data exists with both kinds of information on the same people. The candidate is VitalDB (about 3,600 usable patients); Step 2 confirms it.
- The right answer can be measured. We can see when pressure really dropped, so accuracy can be checked honestly.
- It is a serious, well-known problem that doctors want early warning for.

**What we are not doing, and why:**

| Idea | Why not |
|------|---------|
| Heart-attack forecast (*myocardial infarction*) | No free dataset follows heart signals forward to a later heart attack. Free data only supports detecting one that has already happened. A forecast claim would not survive expert questions. |
| Sudden cardiac arrest | Only 23 recordings, and no patient history. |
| Irregular heartbeat (*atrial fibrillation*) | About 100 recordings, and no history file. |
| Home high blood pressure (*hypertension*) with made-up data | Any accuracy we report would prove very little. |
| Blood infection that makes organs fail (*sepsis*) | Not a heart disease. |
| Death in heart-weakening disease (*heart failure*) | Only 299 patients, no live signal, and different patients from our main data. |
| Intensive-care shock or arrest (eICU database) | Needs an approval that may take days. |
| Heart scans (MRI/CT) module | Different patients, needs a graphics card (GPU), and detects rather than forecasts. Kept as "future work" on the architecture diagram. |

---

## Open discussion

**Signature features (the "wow factor").** Not one of the 7 steps. We are deciding what makes the project stand out beyond correct calculations.
