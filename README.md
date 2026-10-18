# Cardiac Digital Twin

A real-time digital twin of the human heart. A Python backend streams ECG and ABP signals from a physiological dataset over WebSocket at 125 Hz, computing haemodynamic metrics on the fly.

There are **two independent frontends**, both fed by the same backend:

| Frontend | What it is | Docs |
|---|---|---|
| **Unity 3D twin** | Anatomical 3D heart beating **beat-for-beat** with the patient's ECG, with blood flowing through the real valve path. | **[unity/README.md](unity/README.md)** |
| **React dashboard** | Browser dashboard: waveform charts, derived metrics, risk panel. | this file |

> **Not a medical device.** Education/research visualization only — not for diagnosis or clinical decision-making.

---

## Project Structure

```
majorProject/
├── python_backend/
│   ├── server.py                  # Entry point — WebSocket server (run this)
│   ├── streams/
│   │   └── dataset_stream.py      # Loads .mat dataset, extracts per-window ECG/ABP signals
│   ├── processors/
│   │   ├── ecg_processor.py       # RR interval, cardiac phase
│   │   ├── hemodynamics.py        # MAP, SV, CO, PTT, wall stress, blood flow, Reynolds
│   │   └── risk_engine.py         # Weighted multi-factor cardiovascular risk classification
│   ├── models/
│   │   └── packet_model.py        # Assembles the JSON WebSocket packet sent each frame
│   └── utils/
│       └── constants.py           # Shared physical/physiological constants (compliance, viscosity, etc.)
├── src/
│   ├── App.jsx                    # Main dashboard layout
│   ├── Heart3D.jsx                # Three.js canvas — external + internal heart views
│   ├── HeartModel.jsx             # External 3D heart (FBX), beat animation, pressure heatmap
│   ├── InternalHeartView.jsx      # Internal cutaway heart view
│   ├── MetricsPanel.jsx           # Derived metrics cards
│   ├── RiskPanel.jsx              # Risk level display
│   ├── CardiacPhaseCard.jsx       # Cardiac cycle phase indicator
│   ├── ElectricalPulse.jsx        # ECG R-peak electrical pulse visual
│   ├── VerificationPage.jsx       # Verification tab with formula breakdowns
│   ├── verificationData.js        # Metric definitions, formulas, tooltips
│   ├── useSmoothedMetrics.js      # 3-stage smoothing hook for numeric displays
│   └── websocket.js               # WebSocket client connection manager
├── unity/                         # Unity 3D digital twin — see unity/README.md
│   └── CardiacDigitalTwin/
│       └── Assets/
│           ├── Scenes/SampleScene.unity    # open this, press Play
│           ├── Scripts/CardiacCycle.cs     # master cardiac clock (muscle + flow)
│           ├── Scripts/HeartDataClient.cs  # WebSocket client + packet validation
│           ├── Scripts/BloodFlowPath.cs    # blood droplets along the anatomical route
│           ├── Scripts/VitalsDisplay.cs    # patient-monitor overlay
│           └── Editor/BloodPathPlanner.cs  # Tools > Cardiac Twin > Plan Blood Paths
├── public/
│   └── Heart.fbx                  # 3D heart model asset (React frontend)
├── models/
│   └── internal_heart/beating-heart.glb    # cutaway heart used by the Unity twin
└── dataset/
    └── p000003.mat                # Physiological dataset (ECG + ABP waveforms)
```

---

## What Each Backend Module Does

| File | Purpose |
|---|---|
| `streams/dataset_stream.py` | Loads the `.mat` file, extracts ECG, ABP, R-peaks, SBP/DBP per window |
| `processors/ecg_processor.py` | Calculates RR interval and normalised cardiac phase (0→1 per beat) |
| `processors/hemodynamics.py` | Calculates MAP, pulse pressure, stroke volume (Windkessel), cardiac output, PTT, wall stress (Laplace), blood flow, blood velocity |
| `processors/risk_engine.py` | Scores 6 factors (MAP, wall stress, Reynolds, HR, CO, pulse pressure) with weighted points → Low / Moderate / High |
| `models/packet_model.py` | Builds the JSON dict sent over WebSocket every frame at 125 Hz |
| `utils/constants.py` | Arterial compliance, LV radius/wall thickness, blood density/viscosity, sampling rate |

---

## Running the Project

The backend is required by **both** frontends. Start it first, then pick a frontend.

### 1. Backend (Python WebSocket server) — always needed

```bash
cd python_backend
python3 -m venv venv                        # first time only
venv/bin/pip install -r requirements.txt    # first time only
venv/bin/python server.py
```

Windows: use `venv\Scripts\pip` and `venv\Scripts\python` instead.

Wait for this (dataset load takes a few seconds):

```
Total windows: 492  |  SBP range: 88.2–155.3
WebSocket server running on ws://localhost:8765
```

> Run it **from inside `python_backend/`** — the dataset path is relative.

### 2a. Unity 3D twin

Open `unity/CardiacDigitalTwin` in Unity **6000.4.1f1**, open
`Assets/Scenes/SampleScene.unity`, press **Play**.

Start order doesn't matter — Unity retries every 2 s and connects when the backend appears.
Full guide: **[unity/README.md](unity/README.md)**.

### 2b. React dashboard

Requires **Node.js 20.19+ or 22.12+** (Vite will refuse to start on older versions; with nvm: `nvm use 20`).

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

---

## Other Frontend Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |

---

## Tech Stack

- **Unity twin** — Unity 6000.4.1f1, Built-in render pipeline, glTFast
- **Frontend** — React 19, Vite, Three.js (`@react-three/fiber`), Chart.js, Tailwind CSS
- **Backend** — Python 3, `websockets`, `numpy`, `mat73` (pinned in `python_backend/requirements.txt`)
- **Dataset** — `.mat` physiological recording (ECG Lead II + Arterial Blood Pressure at 125 Hz)

---

## Data integrity notes

The backend was audited and corrected for clinical-grade rigour:

- **Blood pressures are measured**, per beat, from the real ABP waveform (max/min between R-peaks).
  An earlier version added `random.uniform()` noise to SBP/DBP — that is gone, as every derived
  value (MAP, PP, SV, CO, risk) flows from them.
- **`rr_interval` is the true beat-to-beat interval**, so `cardiac_phase` is exact.
- **`stroke_volume` is an estimate** (pulse pressure × arterial compliance), not a measured volume.
- Dataset window splices are flagged (`segment_break`) so a splice isn't rendered as a pathological pause.
- The stream labels its own provenance (`source: "replay p000003.mat"`) — consumers should never
  present it as live patient data.
- **Arterial compliance is fitted, not guessed** (`C = 1.72 mL/mmHg`): it reconciles the pulse-pressure
  stroke volume with the Windkessel volume `MAP·RR/R` to within 1%, gives `τ = R·C = 1.72 s` matching
  the measured diastolic decay, and a cardiac index of 3.2 L/min/m² for this subject.
- **Blood flow uses the 3-element (Westerhof) Windkessel** run in the inverse direction,
  `Q = (P − P_wk)/Zc`, integrated exactly per sample. Total resistance `R + Zc = 1.0 mmHg·s/mL`
  (= MAP/CO for this subject) is split into `Zc = 0.07` (literature ~7 %, an assumption — not
  identifiable from a single pressure channel) and `R = 0.93`. Median peak flow is 411 mL/s
  (physiological 300–600); the former 2-element inverse produced ±1300 mL/s derivative noise.
  The Windkessel pressure `P_wk` is streamed so any consumer can recompute `Q` exactly.
- **Blood velocity is physical** (`v = Q/A`, mean aortic, ~0.17 m/s at CO 5), replacing an empirical
  `CO/5` scaling that was ~6× too high; Reynolds thresholds were rescaled by the exact same factor.
- **Wall stress is in kPa** and documented as a fixed multiple of SBP (population `r/h`).
- **`ptt` is `null`**: it cannot be measured from a time-aligned PPG, and the former formula was a
  restatement of SBP.
- **Dataset:** PulseDB (Wang et al. 2023, Frontiers in Digital Health), derived from MIMIC-III /
  VitalDB — anonymised open data. Subject `p000003`: 75 y, F, 155.6 cm, 47 kg (BMI 19.4), 114 min.

All of the above is asserted on the full recording by `python_backend/tests/test_values.py`.
