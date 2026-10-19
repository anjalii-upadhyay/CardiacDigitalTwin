# Journey: decisions and reasons

A running record of every decision we make while building for the Digital Twin Challenge 2026, and why. Newest at the bottom.

Status: ✅ decided · 🟡 suggested, not decided yet

---

## Decisions

| ID | Date | Decision | Reason | Status |
|----|------|----------|--------|--------|
| D1 | 2026-10-18 | The digital twin organ is the **heart**. | It is your choice, and the project already has a working heart twin (3D heart driven by live signals). | ✅ |
| D2 | 2026-10-18 | **Restart the planning from scratch**, one step at a time. | A review of the project showed it had no early-warning prediction, which the challenge requires. You wanted a clean plan instead of building on earlier ideas. | ✅ |
| D3 | 2026-10-18 | **Working rules:** explain in plain language with the medical term in brackets; do one step at a time; finish one step before the next. | You are a computer science student, not a biology student, and want to understand every choice. | ✅ |
| D4 | 2026-10-18 | Keep three living documents: `pipeline_architecture.md`, `journey.md`, `troubleshooting.md`. | They record the build as we go and will feed the final README, slides, and video. | ✅ |
| D5 | 2026-10-18 | **Step 1 final:** warn about a sudden blood pressure crash (*hypotension*) about 10 minutes ahead, with three severity levels (mild, serious, critical). | It is the only option where real patients have both a history file and a live signal, and the right answer is measurable. Severity levels add clinical weight without needing a new dataset. | ✅ |
| D6 | 2026-10-18 | **Do not claim to forecast heart attacks.** | No free dataset follows signals forward to a later heart attack. Free data (PTB-XL) only supports detection, and an ESC review warns its scores look better than real life. A claim like that would not survive expert questions. | ✅ |
| D7 | 2026-10-18 | **No extra datasets or modules** (blood infection, heart-failure death risk, intensive-care shock, heart scans). | Each is either not about the heart, tiny, a different set of patients that cannot be combined with ours, or needs approval we do not have time for. Details are in `pipeline_architecture.md`. | ✅ |
| D8 | 2026-10-18 | Heart scans (MRI/CT) go on the **architecture diagram and a "future work" slide only**. | They show how a full twin would grow, but are not linked to our patients and need a graphics card. | ✅ |

## Suggestions on the table (not decided)

- Use TimesFM (Google's time-series model) as one component, tested against simpler models. *(Step 4)*
- Use VitalDB as the main data source. *(Step 2 confirms it.)*

## Open questions

- **Signature features (the "wow factor"):** which extra features make the project stand out? Being discussed.

---

## Facts we have established (not decisions)

- **Deadline:** 20 Oct 2026, 7:00 PM IST.
- **What the challenge requires:**
  - combine patient history (static) with live body signals (dynamic);
  - a working model that predicts a bad event ahead of time;
  - a doctor-style dashboard;
  - only anonymised, open, or synthetic data;
  - a README with team details, stack, licence, a 20-minute video, an architecture diagram, and slides.
- **What exists today:**
  - a Python server that replays a recorded patient at 125 readings per second;
  - a Unity 3D heart that beats with it;
  - a React web dashboard.
  - None of it predicts anything yet. The current "risk" label is a fixed set of rules about the present moment.
- **Our dataset:** `dataset/p000003.mat` is **VitalDB case 6198** (75-year-old woman, 155.6 cm, 47 kg, surgery patient). VitalDB is listed as CC BY 4.0, so we must credit it in the README.
- **VitalDB contents (checked 2026-10-18):**
  - 6,388 patients, of whom 3,643 have a blood-pressure recording plus heart rate and ECG.
  - 34 blood-test types, but none that measure heart-muscle damage.
  - Only 57 in-hospital deaths.
- **Other datasets we looked at and set aside:**
  - PTB-XL: 21,799 ECGs, 5,469 with heart attack, as 10-second snapshots.
  - MIT-BIH Sudden Cardiac Death: 23 recordings.
  - PhysioNet 2019 sepsis challenge: 40,336 intensive-care patients.
  - eICU: full database is credentialed; the open demo has about 2,500 stays.
  - UCI Heart Failure: 299 patients.
  - ACDC (heart MRI): 150 patients.
  - COCA (heart CT calcium): about 787 scans.
  - Only UK Biobank pairs scans with ECG on the same people, and it needs a formal application.
