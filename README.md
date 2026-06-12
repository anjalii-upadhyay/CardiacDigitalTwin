# Cardiac Digital Twin

A real-time digital twin of the human heart. A Python backend streams live ECG and ABP signals from a physiological dataset over WebSocket at 125 Hz, computing haemodynamic metrics on the fly. A React + Three.js frontend visualises the data as a beating 3D heart model, live waveform charts, and a derived metrics panel.

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
├── public/
│   └── Heart.fbx                  # 3D heart model asset
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

You need two terminals — one for the backend, one for the frontend.

### 1. Backend (Python WebSocket server)

```bash
cd d:\majorProject\python_backend
python -m venv venv
venv\Scripts\activate
pip install websockets mat73 numpy
python server.py
```

The server starts on `ws://localhost:8765` and begins streaming at 125 Hz.

### 2. Frontend (React + Vite)

```bash
cd d:\majorProject
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

> Both must be running at the same time. Start the backend first.

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

- **Frontend** — React 19, Vite, Three.js (`@react-three/fiber`), Chart.js, Tailwind CSS
- **Backend** — Python 3, `websockets`, `numpy`, `mat73`
- **Dataset** — `.mat` physiological recording (ECG Lead II + Arterial Blood Pressure at 125 Hz)
