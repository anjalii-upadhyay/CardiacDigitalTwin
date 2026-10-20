# Journey: decisions and reasons

A running record of every decision we make while building for the Digital Twin Challenge 2026, and why.
Decisions are listed oldest first. **Nothing is deleted**: when a later decision replaces an earlier one,
the earlier one stays, with its status changed and a pointer to what replaced it.

Status: ✅ decided · 🟡 pending or suggested · ⏪ superseded (kept for the record) · ◐ partly superseded

Last updated: 2026-10-19, about 23:30 IST. **Deadline: 20 Oct 2026, 7:00 PM IST (about 19 hours left).**
Branch: **`wip`** (work continues here, not on `main`).

---

## 1. Where we are in one paragraph

On 18 Oct the plan was a heart twin that warns of a sudden blood-pressure crash (hypotension) about
10 minutes ahead. On 19 Oct the problem was **changed** to heart-failure **fluid accumulation
(congestion)**: a chest patch's signals feed a model that estimates how much pressure is backing up
behind a weak heart, shown on the existing 3D heart, with an alert and a medicine what-if for the
doctor. The open chest-patch dataset (SCG-RHC) is **downloaded** (83 recordings). The model type is
decided (**Support Vector Regression**). **No model has been trained yet.** The training plan is
waiting for approval (section 8).

---

## 2. Decisions (oldest first)

### 2a. Decisions of 2026-10-18 (hypotension plan)

| ID | Date | Decision | Reason | Status |
|----|------|----------|--------|--------|
| D1 | 2026-10-18 | The digital twin organ is the **heart**. | It is your choice, and the project already has a working heart twin (3D heart driven by live signals). | ✅ Still valid |
| D2 | 2026-10-18 | **Restart the planning from scratch**, one step at a time. | A review of the project showed it had no early-warning prediction, which the challenge requires. You wanted a clean plan instead of building on earlier ideas. | ✅ Still valid |
| D3 | 2026-10-18 | **Working rules:** explain in plain language with the medical term in brackets; do one step at a time; finish one step before the next. | You are a computer science student, not a biology student, and want to understand every choice. | ✅ Still valid (extended by D16) |
| D4 | 2026-10-18 | Keep three living documents: `pipeline_architecture.md`, `journey.md`, `troubleshooting.md`. | They record the build as we go and will feed the final README, slides, and video. | ✅ Still valid. The other two documents still describe the hypotension plan and need updating (P13). |
| D5 | 2026-10-18 | **Step 1 final:** warn about a sudden blood pressure crash (*hypotension*) about 10 minutes ahead, with three severity levels (mild, serious, critical). | It is the only option where real patients have both a history file and a live signal, and the right answer is measurable. Severity levels add clinical weight without needing a new dataset. | ⏪ **Superseded by D17** (problem changed to fluid accumulation). Kept for the record; the analysis behind it stays in `pipeline_architecture.md`. |
| D6 | 2026-10-18 | **Do not claim to forecast heart attacks.** | No free dataset follows signals forward to a later heart attack. Free data (PTB-XL) only supports detection, and an ESC review warns its scores look better than real life. A claim like that would not survive expert questions. | ✅ Still valid (same spirit as the honesty rules in section 9) |
| D7 | 2026-10-18 | **No extra datasets or modules** (blood infection, heart-failure death risk, intensive-care shock, heart scans). | Each is either not about the heart, tiny, a different set of patients that cannot be combined with ours, or needs approval we do not have time for. Details are in `pipeline_architecture.md`. | ◐ **Partly superseded.** The fluid plan is itself a heart-failure plan, so heart-failure data is now in scope. The discipline of not adding modules without need stays. The UCI heart-failure risk model is only an option under P3. |
| D8 | 2026-10-18 | Heart scans (MRI/CT) go on the **architecture diagram and a "future work" slide only**. | They show how a full twin would grow, but are not linked to our patients and need a graphics card. | ✅ Still valid (matches D10) |

### 2b. Decisions of 2026-10-19 (fluid accumulation plan)

| ID | Date | Decision | Reason | Status |
|----|------|----------|--------|--------|
| D9 | 2026-10-19 | Keep the existing 3D heart design and drive it with **real signals**. | The heart is already built and reacts to ECG. | ✅ |
| D10 | 2026-10-19 | **Drop MRI/CT personalisation** completely. | No open dataset links a scan to the signals of the same person, so a scan-built heart would be a mixed-up composite, not a twin. | ✅ |
| D11 | 2026-10-19 | Use the **chest-patch dataset (PhysioNet SCG-RHC)** as the signal source. | Real heart-failure patients, a wearable patch recording, and catheter-measured pressures from the same people. | ✅ Downloaded (section 5) |
| D12 | 2026-10-19 | Steps 7, 8 and 9 do not depend on the dataset (visualisation, an LLM call, a simulation). | They use the model's outputs, guidelines and literature. | ✅ |
| D13 | 2026-10-19 | **Evidence principle:** no invented thresholds. Use values learned from real data, or clinically accepted values with citations. | You asked for evidence-backed numbers only. | ✅ |
| D14 | 2026-10-19 | Synthetic data is allowed by the rules, but every synthetic or simulated piece is labelled. | Honest labelling protects us under expert questions. | ✅ |
| D15 | 2026-10-19 | Keep the existing blood-pressure pipeline for now. | It still drives the demo, and removing it can wait. | ✅ |
| D16 | 2026-10-19 | Working rules extended: **discuss first, get approval, then change code.** Plain language, minimal medical terms. | You want control over every change. | ✅ (extends D3) |
| D17 | 2026-10-19 | **The problem is now heart-failure fluid accumulation (congestion).** The combined journey continues from this plan. | Your decision after comparing options. It offers a stronger story and a real-data backbone (catheter pressures). | ✅ Supersedes D5 |
| D18 | 2026-10-19 | The prediction model is **Support Vector Regression (SVR)**. | Your decision. It suits a small dataset (63 to 83 recordings). Neural networks would overfit; foundation models such as TimesFM do not fit this task. | ✅ |
| D19 | 2026-10-19 | **Work continues on branch `wip`, not `main`.** | `wip` carries the newer hemodynamics model, tests and `requirements.txt`. `main` keeps its 6 commits untouched. | ✅ Done (see section 7) |
| D20 | 2026-10-19 | **Keep both journeys combined in this one file.** | Earlier decisions are still important. | ✅ This file |
| D21 | 2026-10-19 | Large datasets are stored on the **D: drive, outside the git repo**. | Keeps gigabytes out of GitHub and off the C: drive. | ✅ `D:\CardiacDigitalTwin_data\` |
| D22 | 2026-10-20 | **Improve the model before moving on**; the dashboard is built by a teammate. Every variant is fixed before running and every result is logged (section 12). | The model is the problem-solving core; logging all variants avoids fooling ourselves. | ✅ |
| D23 | 2026-10-20 | **Compare other model types** against SVR with the same honest testing. | Your request: find the most accurate model, not just tune one. | ✅ Running (R3) |
| D25 | 2026-10-20 | **Download the full recordings of the 63 clean recordings (3.37 GB)**, after first fetching their artery and right-atrium slices for V4. | Your request: more signal per patient. The full files take about 12-16 h at PhysioNet's speed, so they finish after the submission deadline but remain useful for the jury round. Runs as a detached process (PID logged in the session). | ✅ Running |
| D24 | 2026-10-20 | **TimesFM is not used for the wedge-pressure model.** | It forecasts a series forward; our task estimates a hidden number from one recording. A possible use for steps 5/9 on MIMIC demo daily series is P17. | ✅ |

### 2c. Suggestions and open questions from 2026-10-18

| Item | Status |
|---|---|
| Use TimesFM (Google's time-series model) as one component | ⏪ Discussed 2026-10-19 and **not adopted**: it only continues numeric series, does not fit our data, and saves little time. An optional baseline later. |
| Use VitalDB as the main data source | ⏪ Replaced by D11 (chest-patch dataset). |
| **Signature features (the "wow factor"):** what makes the project stand out? | 🟡 Current candidate: a sticker that estimates catheter-grade heart pressure from real patients, shown next to the real catheter number. |

---

## 3. The problem and the idea

- **Condition:** in heart failure the heart cannot pump enough. Blood backs up and fluid builds in the lungs
  and body, often unnoticed until a breathing emergency and hospital readmission.
- **India angle:** patients discharged to small towns often lose follow-up care.
- **Idea:** a wearable patch sends ECG and chest-motion signals. A model estimates how congested the heart is.
  The doctor sees it on the 3D twin, gets an alert, and can test a medicine change on the twin first.
- **What the model outputs:** estimated **wedge pressure** (back-pressure into the lungs), **right-side pressure**
  (back-pressure toward the body), **lung-artery pressure**, and **stroke volume** (blood pumped per beat).
  High filling pressure is the measurable cause of fluid leaking into tissue. It is **not** a measurement of litres
  of fluid or of the exact place it sits.

## 4. Workflow (current version)

Evidence label key: **R** = model learned from real patients, **G** = taken from published guidelines
(with citations), **S** = simulation, clearly labelled.

| # | Step | Data source | Label | Status |
|---|---|---|---|---|
| 1 | ~~Heart rebuilt from MRI/CT~~ | none | n/a | **Dropped** (D10). The existing 3D heart is kept. |
| 2 | Real signals drive the heart | Chest-patch dataset (ECG, 3-axis motion, temperature) | R | Data ready |
| 3 | Model learns what signal patterns mean for congestion | Chest-patch signals plus catheter pressures | R | Model type decided (SVR); not trained |
| 4 | Severity and where | Severity from predicted pressure. Left side (wedge) versus right side (right atrial pressure). | R | Partly: "where" is coarse, "how much" is a pressure, not litres |
| 5 | "Serious in N days" | none found | S or R-elsewhere | **Not supported by open data.** See P3. |
| 6 | Alert to the doctor | App logic | n/a | Easy |
| 7 | Doctor view: heart plus full-body visual of fluid | Outputs of steps 3 and 4 | R and S | Visualisation only |
| 8 | Medicine / dose recommendation | Guidelines (an LLM call) | G | Independent of the dataset |
| 9 | Apply a recommendation and see the effect on the twin | Literature dose-response | S | Independent of the dataset |

Data flow:

```
chest-patch signals ──> feature extraction ──> SVR ──> pressure + severity ──┐
patient record (EHR) ─────────────────────────────────────────────────────────┼──> twin state ──> alert + 3D heart + body view
guideline rules / simulation ─────────────────────────────> steps 8 and 9 ────┘
```

Two ways the heart is personalised (shown side by side, so model error is visible):
- **Measured:** the patient's own catheter numbers (stroke volume, cardiac output, pressures).
- **Estimated:** the model's estimate from the patch signals alone (only for patients the model never trained on).

---

## 5. Facts we have established (not decisions)

### The challenge (official text)
| Item | Requirement |
|---|---|
| Condition | One chronic or lifestyle condition prevalent in India |
| Data fusion | Static simulated EHR (demographics, diagnoses, labs, genetic markers) plus dynamic open-source or simulated wearable/IoT time series |
| Model | A working algorithmic model that ingests both streams and predicts an adverse event |
| UI | A conceptual doctor dashboard |
| Data rules | Anonymised, open-source or synthetic data only (Synthea and MIMIC-IV are named examples) |
| README must contain | Team and college details, title, problem and use case, tech stack and AI/ML details, video of at least 20 minutes (PowerPoint recording or unlisted YouTube), open-source licence details, architecture diagram (PDF/PPT), presentation (PDF/PPT) |
| Repo | Public GitHub repo; folder name `Team Name_College Name`; submit only leader name, phone, email and repo link |
| Stages | Jury picks top 10 (the page also says top 5 in one place), virtual jury round, top 5 present at the Bengaluru summit on 20 Nov 2026 |

No scoring rubric is published.

### What existed before the fluid plan
- A Python server that replays a recorded patient at 125 readings per second; a Unity 3D heart that beats with it;
  a React web dashboard (3D heart in Three.js: `Heart3D.jsx`, `HeartModel.jsx`, `InternalHeartView.jsx`).
- None of it predicted anything. The "risk" label was a fixed set of rules about the present moment.
- The old dataset `dataset/p000003.mat` is **VitalDB case 6198** (75-year-old woman, 155.6 cm, 47 kg, surgery patient).
  VitalDB is listed as CC BY 4.0, so we must credit it in the README.
- VitalDB contents (checked 2026-10-18): 6,388 patients, of whom 3,643 have a blood-pressure recording plus heart rate
  and ECG; 34 blood-test types, none measuring heart-muscle damage; only 57 in-hospital deaths.

### The chest-patch dataset: PhysioNet SCG-RHC (open, ODC-By), downloaded
- 83 recordings from 73 patients (65 patients have one recording, 7 have two, 1 has four). All have a heart-failure
  diagnosis. Age 26-84 (mean 54.9), 55 men and 28 women, mostly NYHA class 3. 67 outpatients, 16 inpatients.
- Each recording: 16 channels at 500 Hz. Patch channels: ECG, 3-axis accelerometer, humidity, air pressure, skin
  temperature. The other channels (catheter pressure, hospital ECG leads, finger pulse) are **not** model inputs.
  No impedance.
- Per recording, catheter values for all 83. Means (ranges): wedge pressure 17.0 mmHg (2-35), pulmonary artery mean
  28.6 (9-55), right atrial mean 8.2 (1-27), stroke volume 64.8 mL (28-115), cardiac output 4.7 L/min (2.0-13.6).
- Labels: physiological decompensation 39 yes / 44 no; clinical decompensation 30 yes / 53 no. Mean wedge pressure is
  23.3 in decompensated versus 11.5 in compensated recordings.
- **"Decompensated" is a heart-pressure label, not a fluid label.** The notes read "low CI" (low pumping output),
  "elevated pressures" and "high PCW". None mention fluid or swelling.
- 30 recordings include a vasodilator challenge. For 31 patients with wedge values before and after, the mean change
  was -4.7 mmHg (range -25 to +20).
- **Cannot support:** multi-day trends (one snapshot per recording, dates scrambled), fluid location or volume,
  "days until critical".

**Downloaded:** one 80-second slice per recording (69 wedge-position, 11 artery-position, 1 right-atrium, 2 middle),
207 MB, about 108 minutes of signal, in `D:\CardiacDigitalTwin_data\scg-rhc\` (windows, labels, headers, download
script). Layout verified against the file headers.

**How many data points:** 83 recordings from 73 patients. A stricter clean set (fine time alignment, no
heart-transplant or assist-device patients, no heart-support drips) has **63 recordings from 59 patients**
(32 decompensated, 31 not). The ~8,000 heartbeats are not independent data points. Effective sample size is
63 to 83 recordings, which is small.

**Download notes:** PhysioNet caps total speed at about 60 to 80 KB/s whatever the number of connections, and drops
new connections when too many are open (16 steady connections worked). There is no cloud copy of this dataset.
The laptop slept for about 5 hours (17:56 to 22:55 on 19 Oct) and froze the download: keep it awake.

### Other datasets looked at
| Dataset | Finding | Use |
|---|---|---|
| MIMIC-IV-Ext Cardiac Disease (friend's suggestion) | 4,761 patients, 1,420 heart-failure cases; notes, first labs, imaging and ECG text reports (no waveforms); credentialed (CITI plus agreement, days to ~2 weeks) | Not available in time |
| MIMIC-IV clinical demo (open, ODbL) | 100 patients; 24 heart-failure patients with 61 admissions; all 32 heart-failure ICU stays have fluid-in and fluid-out; 356 loop-diuretic prescription rows over 49 admissions; 21 of 24 had 2 or more admissions, 16 readmitted within 30 days, 6 died in hospital; 17 have 2 or more outpatient weights; ICU weights on all 32 stays (13 with 3 or more daily weights), hourly heart rate on all 32, NT-proBNP on 13 admissions (5 with a trend). No ECG waveforms. | Option for a real-patient timeline panel (P2); too small to train on |
| MIMIC-IV-ECG (open, ODbL) | About 800,000 10-second ECGs, linked by subject id; index file 70 MB supports partial downloads | Optional ECG snapshots for MIMIC demo patients |
| UCI Heart Failure Clinical Records | 299 patients, follow-up time and death event, CC BY 4.0 | Option for a real risk-over-time model (P3) |
| BIDMC CHF database | 15 severe heart-failure patients, about 20 h ECG, automated beat labels, no fluid labels | Optional |
| ACDC cardiac MRI | 150 patients with expert measurements | Dropped with MRI (D10) |
| HeartCycle | 17 healthy volunteers (from an external chat's snippet; not verified by me) | Not suitable |
| PTB-XL, MIT-BIH Sudden Cardiac Death, PhysioNet 2019 sepsis, eICU, COCA, UK Biobank | Set aside on 2026-10-18 (see D6, D7). UK Biobank is the only one pairing scans with ECG on the same people and needs a formal application. | Not used |

**No open dataset found with impedance + ECG + activity + decompensation events.**

### Corrections to the external AI chat's advice
- Invented thresholds (10% impedance drop, 40% step drop, "scar above 20%") are not evidence.
- UK Biobank MRI is not open (needs an approved application, as far as I know).
- The "1,420 heart-failure cases" figure was correct, but that dataset is credentialed and text-based.
- The names and college in that chat (Om Kolte, MITAOE) are unverified placeholders.
- "Perfect match" and "high probability of winning" were flattery, not evaluation.

### What the dataset's authors did
The authors' feasibility study (Shandhi et al., 2022, IEEE TBME, doi 10.1109/TBME.2022.3147066) used machine-learning
regression on 20 patients to estimate **changes** in pulmonary artery and wedge pressure after a vasodilator.
I could not read its accuracy figures. Our task (absolute pressure across patients) is probably harder than their
within-patient change, so expect modest results.

---

## 6. Decisions pending

| # | Question | Options and my view |
|---|---|---|
| P1 | ~~Commit to this problem?~~ | **Resolved by D17.** |
| P2 | Which "patient" do we show? | (a) A real single-person twin from a chest-patch patient. (b) A real MIMIC demo patient with records and fetched ECGs. (c) A matched composite persona, which is a **virtual patient**, not a twin. I lean toward (a) or (b). |
| P3 | What does step 5 become? | "Current congestion level plus risk over time from patient records" (UCI), a clearly labelled "if untreated" simulation, or retrospective timing checks on the 24 MIMIC demo patients. "Serious in N days" cannot be learned from open data. |
| P4 | ~~Which model?~~ | **Resolved by D18 (SVR).** Open sub-choices are P14. |
| P5 | Chest impedance: drop it or show a simulated, labelled one? | Dropping is safer. No open real data. |
| P6 | Step 8: an LLM call grounded in cited guidelines. Which model, which guideline, how to word dose suggestions safely? | Suggest "for the doctor to decide", cite sources, avoid specific doses without review. |
| P7 | Step 9 simulation: what dose-response source and how much to build? | Needs literature values; always labelled "simulation". The 31 real before-and-after vasodilator pairs can anchor it. |
| P8 | How coarse can "where is the fluid" be? | Left versus right congestion from wedge versus right atrial pressure, drawn as lungs versus body. |
| P9 | Do you or your friend already have **PhysioNet credentialed access**? | Unanswered. Decides whether full MIMIC-IV is possible. |
| P10 | ~~Download plan~~ | **Resolved:** done (section 5). Optional extras (full recordings, post-medicine slices) not fetched. |
| P11 | Is there a **doctor or mentor** who can review clinical wording? | Unanswered. Strongly recommended. |
| P12 | Team and college details for the README and folder name | Unanswered. |
| P13 | Update `pipeline_architecture.md` and `troubleshooting.md` to the fluid plan (D4) | Not yet reviewed against this plan. |
| P14 | Training choices (section 8): targets, label, exclusions, "show it only if" rule | Proposed in section 8, awaiting approval. |
| P15 | Approve installing scikit-learn and scipy into the project's venv, the `hf_twin` code folder, and starting the signal check and feature extraction | Awaiting approval. Packages were dry-run checked and install on Python 3.14. |
| P17 | Use TimesFM-3 (your demo in `OpsRabbit\TimesFM-Demo`) to forecast a MIMIC demo patient's weight or fluid trend for steps 5/9, labelled exploratory? | Possible (about 2-3 h); weights are non-commercial licence. Not decided. |
| P16 | Re-apply the main-branch edits kept in the stash (rename of "majorproject" to "CardiacDigitalTwin", dataset-path fixes) onto `wip`? | Three of those files also differ on `wip`, so merging them needs care. |

---

## 7. Branch and storage notes

- **Branch:** `wip` (tracking `origin/wip`), three commits by anjalii-upadhyay, latest `ad2dfbe` (19 Oct). It shares
  no history with `main`. `main` is untouched.
- **Stash:** `stash@{0}` holds the uncommitted `main` edits plus the untracked `PROJECT_EXPLAINED.md` and the fluid
  journey that this file replaces. Backups: `D:\CardiacDigitalTwin_backup\`.
- **Data:** `D:\CardiacDigitalTwin_data\scg-rhc\` (outside the repo).
- **Environment:** the project's venv is on D: (`python_backend/venv`, Python 3.14, numpy only so far).

## 8. Model plan (proposed, awaiting approval)

- **Inputs (about 18 per recording), from the patch only plus basic record facts:** heart rate and its variability
  (RMSSD, SDNN, pNN50); heart-vibration features (strength, squeeze-phase energy, delays to two peaks, beat-to-beat
  variation); breathing rate and depth; body tilt; skin temperature (optional); age, sex, BMI, systolic and diastolic BP.
  Excluded: the catheter pressure channel, hospital ECG and finger-pulse channels, every catheter number, and the labels.
- **Outputs:** estimated wedge, right-side, lung-artery pressure and stroke volume (one SVR each). "Congested yes/no" is
  derived from the wedge estimate with a clinically accepted cut-off that we cite (D13).
- **Model:** scaled inputs into SVR (RBF kernel), settings tuned by cross-validation. Baselines: always-the-average guess
  and ridge regression; also a signals-only versus signals-plus-record comparison.
- **Testing:** whole patients held out (grouped, nested cross-validation), real error in mmHg, bootstrap intervals.
  **Success rule, fixed before seeing results:** the model counts as meaningful only if it beats the naive guess with the
  95% interval excluding zero improvement. Otherwise it is shown as exploratory.
- **Time:** about 6 hours, most of it feature extraction. Training itself takes seconds.

## 9. Honesty rules

1. Split by patient, never by recording, when testing models.
2. Compare every model with a naive guess and report the real errors.
3. Accuracy numbers come only from real-data models.
4. Label every synthetic or simulated piece on screen and in the README.
5. Call composites "virtual patients". A twin must be one specific person, personalised from their own data and
   checked against their own later data.
6. Medicine suggestions are decision support. A clinician decides.

## 10. Proposed next steps (not yet approved)

1. Approve P15, then check the signals and extract features (see section 8).
2. Train and test the SVR, then save the model with its results.
3. Wire the heart to measured and estimated values side by side.
4. Build the alert, the body view, then simple steps 8 and 9.
5. Idea-independent repo clean-up: check whether `wip` already fixes the ignored `models/` folder; confirm a `LICENSE`;
   untrack Unity cache files; remove the fake patient name and the "AD8232" sensor claim; check dataset
   redistribution terms before keeping data files in the public repo.
6. Deliverables: README sections, architecture diagram, slide deck, 20-minute video (about 3 to 4 hours).

## 12. Model results log (reproducible)

Every training or testing run is logged here, including the ones that did not help. Code: `hf_twin/ml_training/`.
Run commands from the repo root with `python_backend/venv/Scripts/python.exe -m <module>`.
Data: SCG-RHC slices in `D:\CardiacDigitalTwin_data\scg-rhc\` (one 80 s slice per recording, chosen in the order
wedge position, artery, right atrium, middle).

### Common setup (unless a run says otherwise)
- **Rows:** clean set, signal check passed, baseline slices only = **63 recordings from 59 patients**.
- **Honest testing:** patients split into 10 groups; each group is predicted by a model trained without it
  (a patient's recordings always stay together). Settings tuned inside the training part only (5-fold, by patient).
- **Naive guess:** the training patients' average. **Success rule:** the model's average error must be lower than the
  naive guess with the 95% bootstrap interval (resampling patients) above zero.
- **AUROC:** how well the estimate separates physiologically decompensated from compensated recordings
  (0.5 = coin flip). For reference, the real catheter wedge value scores 0.98.

### Input sets
- **Record (5):** age, male, BMI, systolic BP, diastolic BP (from the label file; -1 = missing).
- **Signals v1 (15):** rhythm (heart rate, RMSSD, SDNN, pNN50, irregular-beat share using the 20% rule);
  front-to-back vibration v1 (strength, early energy, time to first and second peak and their gap, beat-to-beat
  variation); breathing rate and depth (0.1-0.7 Hz); body tilt; skin temperature (Fahrenheit converted, out-of-range =
  missing).
- **Vibration v2 (16):** strength, early energy and time to first peak on each axis (side-to-side, head-to-foot,
  front-to-back, combined), plus front-to-back shape: second/first peak ratio, beat consistency, low-band (1-10 Hz)
  and mid-band (10-20 Hz) energy share.

### R1. First real training (2026-10-20, about 01:05)
`hf_twin.ml_training.scripts.train_svr`, one patient split (seed 42). Results, wedge pressure (mmHg; naive 6.68):

| Inputs | Model | Typical error | r | R² | Gain vs naive [95% CI] | Rule | AUROC |
|---|---|---|---|---|---|---|---|
| record only | ridge | 6.19 | 0.24 | 0.04 | +0.49 [-0.22, +1.18] | no | |
| record only | SVR | 5.73 | 0.45 | 0.19 | +0.95 [+0.03, +1.87] | yes | 0.74 |
| signals only | ridge | 6.28 | 0.21 | -0.05 | +0.41 [-0.58, +1.39] | no | |
| signals only | SVR | 6.17 | 0.23 | -0.02 | +0.51 [-0.41, +1.39] | no | 0.67 |
| signals + record | ridge | 6.25 | 0.30 | 0.04 | +0.43 [-0.41, +1.22] | no | |
| **signals + record** | **SVR** | **5.50** | **0.47** | **0.22** | **+1.18 [+0.40, +1.96]** | **yes** | **0.76** |

Right-atrial pressure (naive 4.31), lung-artery pressure (naive 9.16) and stroke volume (naive 17.12): **no model
beat the naive guess** with any input set. Details: `artifacts/metrics.json`, `artifacts/oof_predictions.csv`.
(Earlier smoke tests on 8 recordings only checked the code ran; their numbers are meaningless and not used.)

### R2. Pre-registered improvements V0-V3 (2026-10-20, about 09:05)
`hf_twin.ml_training.scripts.run_experiments wedge_mmHg`, 3 patient splits (seeds 42, 7, 2026) averaged.
Naive 6.61.

| Variant | Inputs | Model | Typical error (per split) | r | Gain vs naive [95% CI] | Rule | AUROC |
|---|---|---|---|---|---|---|---|
| V0 current | signals v1 + record (20) | SVR | **5.30** (5.50, 5.31, 5.15) | 0.52 | **+1.31 [+0.56, +2.08]** | **yes** | **0.79** |
| V1 rich vibration | + vibration v2 (36) | SVR | 5.42 (5.61, 5.45, 5.32) | 0.52 | +1.19 [+0.54, +1.85] | yes | 0.77 |
| V2 + input selection | 36, best k chosen in-fold | SVR | 5.87 (5.97, 5.84, 6.06) | 0.42 | +0.74 [-0.01, +1.52] | no | 0.74 |
| V3 + after-medicine rows | as V2, plus 16 after-medicine rows in training only | SVR | 5.97 (6.04, 6.13, 6.07) | 0.36 | +0.64 [-0.00, +1.28] | no | 0.72 |

(V3 was run at about 09:15, after the 19 after-medicine slices finished downloading; 16 pass the clean set and signal
check. V0-V2 gave identical numbers in that re-run.)

**Reading:** the richer vibration features did not improve the estimate; letting SVR pick its inputs made it worse;
adding after-medicine rows as extra training data made it worse again. **V0 remains the best.**
Details: `artifacts/experiments.json`, `artifacts/experiments_oof_wedge_mmHg.csv`.

### R3. Model comparison (2026-10-20, about 09:15)
`hf_twin.ml_training.scripts.compare_models wedge_mmHg`, same testing as R2 (3 splits averaged). Naive 6.61.
Sorted by typical error within each input set:

| Inputs | Model | Typical error (per split) | r | R² | Gain vs naive [95% CI] | Rule | AUROC |
|---|---|---|---|---|---|---|---|
| v1 (20) | **SVR** | **5.30** (5.50, 5.31, 5.15) | +0.52 | +0.27 | +1.31 [+0.56, +2.08] | yes | **0.79** |
| v1 (20) | **extra trees** | **5.31** (5.52, 5.21, 5.21) | **+0.57** | **+0.31** | +1.30 [+0.59, +2.04] | yes | 0.77 |
| v1 (20) | Gaussian process | 5.44 (5.71, 5.41, 5.30) | +0.45 | +0.20 | +1.17 [+0.43, +1.92] | yes | 0.77 |
| v1 (20) | ensemble (SVR + GP + RF) | 5.46 | +0.49 | +0.23 | +1.15 [+0.48, +1.85] | yes | 0.78 |
| v1 (20) | gradient boosting | 5.54 (5.86, 5.32, 5.61) | +0.46 | +0.20 | +1.07 [+0.17, +2.01] | yes | 0.76 |
| v1 (20) | nearest neighbours | 5.64 (6.09, 5.73, 5.38) | +0.45 | +0.20 | +0.97 [+0.26, +1.69] | yes | 0.75 |
| v1 (20) | elastic net | 5.77 (5.94, 5.66, 5.80) | +0.42 | +0.18 | +0.84 [+0.13, +1.57] | yes | 0.77 |
| v1 (20) | random forest | 5.83 (6.04, 5.73, 5.74) | +0.42 | +0.17 | +0.78 [+0.19, +1.35] | yes | 0.75 |
| v1 (20) | ridge | 5.94 (6.25, 5.83, 6.17) | +0.34 | +0.10 | +0.67 [-0.10, +1.45] | no | 0.72 |
| v1+v2 (36) | SVR | 5.42 (5.61, 5.45, 5.32) | +0.52 | +0.25 | +1.19 [+0.54, +1.85] | yes | 0.77 |
| v1+v2 (36) | Gaussian process | 5.48 (5.79, 5.39, 5.48) | +0.48 | +0.23 | +1.13 [+0.43, +1.84] | yes | 0.75 |
| v1+v2 (36) | extra trees | 5.52 (5.81, 5.41, 5.38) | +0.54 | +0.27 | +1.09 [+0.48, +1.78] | yes | 0.76 |
| v1+v2 (36) | ensemble (SVR + GP + RF) | 5.60 | +0.49 | +0.22 | +1.01 [+0.41, +1.61] | yes | 0.76 |
| v1+v2 (36) | elastic net | 5.63 (5.73, 5.58, 5.78) | +0.48 | +0.23 | +0.98 [+0.29, +1.73] | yes | 0.79 |
| v1+v2 (36) | ridge | 5.73 (5.84, 5.77, 5.90) | +0.44 | +0.20 | +0.88 [+0.20, +1.57] | yes | 0.76 |
| v1+v2 (36) | gradient boosting | 5.75 (5.97, 5.69, 5.77) | +0.42 | +0.17 | +0.86 [+0.08, +1.76] | yes | 0.72 |
| v1+v2 (36) | random forest | 6.02 (6.17, 5.87, 6.08) | +0.37 | +0.13 | +0.59 [+0.09, +1.13] | yes | 0.71 |
| v1+v2 (36) | nearest neighbours | 6.06 (6.26, 6.05, 6.08) | +0.28 | +0.06 | +0.55 [-0.13, +1.26] | no | 0.67 |

**Reading:** nearly every model lands between 5.3 and 6.0 mmHg, so the limit is the information in the inputs, not
the model type. **SVR on v1 inputs (V0) and extra trees on v1 are tied best**; SVR separates decompensated recordings
slightly better (AUROC 0.79), extra trees explains slightly more of the spread (R² 0.31). The extra v2 vibration
features do not help any model. The 8 models were not adjusted after seeing results; with this many comparisons,
differences under about 0.2 mmHg should be treated as noise. Details: `artifacts/model_comparison.json`,
`artifacts/model_comparison_oof_wedge_mmHg.csv`.

### R4. Change model (2026-10-20, about 09:15)
`hf_twin.ml_training.scripts.change_model`: 16 patients with a clean slice before and after the vasodilator. Target:
change in wedge pressure (mean -7.4 mmHg, range -19 to 0). Inputs: change in each signal feature. Testing: leave one
patient out (models use mid-grid settings; too few rows to tune). Naive (average change of the others): 4.18.

| Inputs | Model | Typical error | r | Gain vs naive [95% CI] | Rule |
|---|---|---|---|---|---|
| signals v1 | ridge | 4.92 | -0.24 | -0.74 [-2.29, +0.62] | no |
| signals v1 | SVR | 4.03 | -0.09 | +0.16 [-0.46, +0.71] | no |
| signals v1 | Gaussian process | 4.41 | -0.10 | -0.23 [-0.67, +0.28] | no |
| signals v1+v2 | ridge | 5.17 | -0.07 | -0.98 [-2.84, +0.67] | no |
| signals v1+v2 | SVR | 3.91 | +0.28 | +0.28 [-0.26, +0.76] | no |
| signals v1+v2 | Gaussian process | 3.88 | +0.19 | +0.30 [-0.52, +1.12] | no |

**Reading:** with 16 pairs, no model predicts the size of the drop better than "the average drop" (-7.4 mmHg). For
step 9 the honest evidence is that average real response and its range, not a learned per-patient prediction.
Details: `artifacts/change_model.json`, `artifacts/change_model_oof.csv`.

### R5. V4 more signal per patient (pre-registered 2026-10-20 about 09:35, results pending)
`hf_twin.ml_training.scripts.run_v4_multi_slice`. Same as V0 (signals v1 + record), but each recording's signal
features are averaged over all its baseline slices (wedge, artery, right-atrium positions) that pass the signal check.
Tested with SVR and extra trees (tied best in R3), compared side by side with the one-slice V0, same testing and
success rule. Needs the artery and right-atrium slices of the 63 clean recordings (downloading, about 240 MB).

## 11. Sources

- Challenge: https://unstop.com/hackathons/crp-digital-twin-challenge-2026-happiest-health-1757873
- SCG-RHC: https://www.physionet.org/content/scg-rhc-wearable-database/1.0.0/
- Dataset authors' study: https://doi.org/10.1109/TBME.2022.3147066
- MIMIC-IV-Ext Cardiac Disease: https://physionet.org/content/mimic-iv-ext-cardiac-disease/
- MIMIC-IV demo: https://www.physionet.org/content/mimic-iv-demo/
- MIMIC-IV-ECG: https://physionet.org/content/mimic-iv-ecg/1.0/
- MIMIC access guide: https://mimic.mit.edu/docs/faq/how-to-get-access.html
- UCI heart failure records: https://archive.ics.uci.edu/dataset/519/heart-failure-clinical-records
- BIDMC CHF database: https://physionet.org/content/chfdb/
- ACDC: https://astro.paperswithcode.com/dataset/acdc
- TimesFM: https://github.com/google-research/timesfm
