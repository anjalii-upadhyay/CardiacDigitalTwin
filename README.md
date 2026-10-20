# A Patient-Specific Digital Twin for Early Cardiac Congestion Prediction

**Team name:** AO Rhythm
**College:** MIT Academy of Engineering, Alandi - Pune
**Team leader:** Anjali Upadhyay
**Team members:** Anjali Upadhyay, Om Kolte, Gunjan Dhakate, Kamakhya Kanzade
**Challenge:** Happiest Health Digital Twin Challenge 2026, Phase 1

> **Not a medical device.** This is a student prototype for learning and research. Do not use it to diagnose or treat anyone.

---

## Problem statement

Heart failure can cause fluid to accumulate in and around the lungs and other parts of the body. If this buildup is not detected early, the patient's condition can become critical and require emergency treatment. Current monitoring methods may not always identify these changes in time.

Our project aims to develop a cardiac digital twin that uses ECG and bioimpedance sensors to detect early signs of fluid buildup, predict the risk of the patient's condition worsening, and help doctors visualize the heart's condition and explore possible treatment scenarios before the patient reaches a critical stage.

In India, many towns do not have a cardiologist (heart specialist) nearby. People who live there often cannot get regular heart check-ups.

After a heart attack or heart surgery, many patients go back to their home towns to recover. Once they leave the city hospital, the hospital loses sight of them. This is a blind spot: the doctors who treated them cannot easily see how their heart is doing at home.

The first 30 days after heart treatment are the most critical period, and this is when doctors worry most about monitoring. Fluid buildup can make the patient's condition worse. If it is not caught in time, it can lead to death.

## Healthcare use case

Remote Monitoring and Early Detection of Fluid Buildup in Heart Failure Patients

Heart failure can cause dangerous fluid buildup in and around the lungs and other parts of the body. If not detected early, it can lead to serious complications and emergency hospitalization. Our cardiac digital twin uses ECG and bioimpedance sensors to monitor patients remotely, detect early signs of fluid buildup, and estimate the risk of their condition becoming critical. Doctors can remotely monitor the patient's cardiac condition, visualize changes over time, and explore potential treatment scenarios to support timely medical decisions and reduce the risk of complications.

**Who it helps:** heart patients who live far from a heart specialist, especially in small towns, and who go home after a heart attack or heart surgery.

**How it would help in the first 30 days:**

- The patient would wear a chest patch at home.
- The digital twin would estimate the lung pressure and the chance of fluid buildup (called congestion).
- The doctor would see a list of patients and check first the ones with a high chance of congestion, even from far away.
- The doctor could explore treatment options on the digital heart.
- Early warning gives doctors time to act before the patient becomes critical and needs emergency care.

## What the prototype does today

The problem statement and use case above describe the full plan. This is what the prototype does now:

- Uses real recordings from 73 heart failure patients (83 recordings, from the open PhysioNet SCG-RHC dataset). Each patient also has a pressure measured with a catheter, a thin tube placed inside the heart. The catheter value is the true answer the model learns from.
- Reads three things from a chest patch: the ECG (the heart's electrical signal), chest movement (from a 3-direction motion sensor), and skin temperature. Breathing and body tilt are worked out from the motion sensor.
- Estimates the pressure in the lung blood vessels (pulmonary wedge pressure) and the chance of congestion. Congestion means this pressure is above 18 mmHg, the cut-off in the Cardiological Society of India (CSI) 2018 heart failure guideline.
- Shows a doctor dashboard with a patient list, patient details, and a medicine what-if simulator.
- Shows a 3D heart that beats with the patient's heartbeat.

**Not in the prototype yet:**

- **Bioimpedance sensor.** The prototype does not use it. No open dataset has bioimpedance together with ECG, activity and congestion data, so it was left out.
- **Live data.** The prototype replays recorded data. It is not connected to a live device.
- **Trends over time.** Each patient has one reading for now.
- **Patient records.** Only age, sex, BMI and blood pressure are used. Diagnoses, lab results and genetic markers are not used yet.
- **Forecasting.** The model estimates the present state. It does not yet predict an event before it happens.
- **Medicine suggestions.** The simulator shows what a change might do. Guideline-based suggestions are planned and need doctor review.

## Technical stack

| What it does | Tool |
|---|---|
| Model and data code | Python 3 |
| Machine learning model | scikit-learn |
| Number and signal maths | NumPy, SciPy |
| Saves the trained model | joblib |
| Charts for reports | matplotlib |
| Sends data to the 3D heart | websockets (Python) |
| Doctor dashboard (web page) | React 19, with Vite as the build tool |
| 3D heart | Unity 6000.4.1f1 (C#), shown in the dashboard as a WebGL build |
| Open data | PhysioNet SCG-RHC |

## AI / ML model details

**Model:** Support Vector Regression (SVR), from the scikit-learn library. It is a classic machine learning model. It works well with small amounts of data, like ours.

**Inputs: 20 numbers per patient**

- From the chest patch (15): heart rate, how steady the heartbeat is, the heart's vibration on each beat, breathing rate and depth, body tilt, skin temperature.
- From the patient record (5): age, sex, BMI, and the two blood pressure numbers.

**Outputs**

1. The estimated lung pressure in mmHg, with an error range.
2. The chance of congestion in percent. A simple curve turns the estimate into a chance.

**How we tested it**

- The model was trained on 63 clean recordings from 59 patients.
- The patients were split into 10 groups. Each group was tested by a model that had never seen those patients.
- All recordings from one patient always stay in the same group.

**Results**

| Measure | Our model | Simple average guess |
|---|---|---|
| Typical error in lung pressure | 5.3 mmHg | 6.5 mmHg |
| Error range for 8 out of 10 patients | about −8 to +9 mmHg | not measured |
| Congestion ranking (AUROC) | 0.75 | 0.5 means guessing |

In plain words: when we compare one congested patient with one patient who is not congested, the model gives the congested patient a higher chance about 3 times out of 4.

**Limits:** only 59 patients were used, so the model is not precise for one person. It does not predict stroke volume, cardiac output or right-side pressures, because it did no better than a guess on those.

**Settings (for engineers):** SVR with RBF kernel, `C = 10`, `epsilon = 0.768`, `gamma = "scale"`.

**Where the model is:** `hf_twin/ml_training/artifacts/final/` (the model file and its model card).

## Demo video

[ADD UNLISTED YOUTUBE LINK HERE, 15 to 20 minutes]

## Architecture diagram and presentation

- Architecture diagram (PDF): HF Congestion Twin Architecture.pdf
- Presentation (PDF): A-Patient-Specific-Digital-Twin-for-Early-Cardiac-Congestion-Prediction.pdf

## Open-source licence

- **Our code:** Apache License 2.0. See [LICENSE](LICENSE).
- **Dataset:** PhysioNet SCG-RHC wearable database, Open Data Commons Attribution License (ODC-By) 1.0. The data is not included in this repository. Download it from PhysioNet and credit its authors.
- **Libraries and tools:** each one has its own open-source licence.

## How to run

**Doctor dashboard**

1. Install Node.js version 20 or newer.
2. In this folder, run `npm install`.
3. Run `npm run dev`.
4. Open the address it shows, usually `http://localhost:5173`.

The patient list and estimates come from a file in the repository, so the dashboard works without the Python server.

**3D heart (optional)**

The heart beats only when the Python data server is running:

```bash
cd python_backend
python3 -m venv venv
venv/bin/pip install -r requirements.txt
venv/bin/python server.py
```

Without the server, the heart stays still and shows "Twin not connected".

## Folder guide

- `src/congestion/`: doctor dashboard code
- `public/`: dashboard data and the 3D heart web build
- `unity/`: 3D heart project (Unity)
- `python_backend/`: data server for the 3D heart
- `hf_twin/`: model code, training, and the final model
- `journey.md`: log of decisions and the reasons for them

## Important limits

- This is a learning and research prototype. It has not been checked by doctors and is not a medical device.
- Decisions about blood flow use only measured values, never the model's estimates.
