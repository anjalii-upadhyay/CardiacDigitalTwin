# Cardiac Digital Twin — Project Handoff

As of 2026-10-13.

## 1. Overview

A real-time "digital twin" of a human heart, built for an educational/demo context (explicitly **not** a clinical tool — see `risk_engine.py`'s disclaimer).

- A **Python backend** (`python_backend/server.py`) replays a real patient's ECG + arterial blood pressure (ABP) recording from a `.mat` dataset over WebSocket at 125 Hz, computing derived haemodynamic metrics and a risk score per sample.
- A **React + Three.js frontend** (`src/`) visualizes the stream live: waveform charts, a beating 3D heart model, derived-metrics panels, and a risk panel.
- The "live" data is a dataset looped on repeat, not a real device — all derived metrics are computed from formulas, not measured.

## 2. Architecture / Data Flow

```
dataset/p000003.mat
      │  (loaded once at startup)
      ▼
streams/dataset_stream.py  ──►  per-window ECG, ABP, R-peaks, SBP/DBP, BPM
      ▼
server.py (main loop, 125 Hz)
      │
      ├─► processors/ecg_processor.py   → RR interval, cardiac phase (0→1 per beat)
      ├─► processors/hemodynamics.py    → MAP, pulse pressure, stroke volume, cardiac
      │                                   output, PTT, wall stress, blood flow, velocity
      ├─► processors/risk_engine.py     → weighted multi-factor risk score + reasons
      └─► models/packet_model.py        → assembles one JSON packet
      ▼
websockets.serve(...)  ws://localhost:8765
      ▼
src/websocket.js  (client, pub/sub: onMessage / onStatusChange)
      ▼
src/App.jsx  (owns live state + smoothing)
      ├─► useSmoothedMetrics.js  → 3-stage smoothing for numeric displays
      ├─► Heart3D.jsx / HeartModel.jsx / InternalHeartView.jsx  → 3D beating heart
      ├─► MetricsPanel.jsx, RiskPanel.jsx, CardiacPhaseCard.jsx, ElectricalPulse.jsx
      └─► VerificationPage.jsx (+ verificationData.js)  → formula/definition reference tab
```

Each WebSocket packet carries: `time, ecg, abp, r_peak, bpm, rr_interval, cardiac_phase, sbp, dbp, map, pulse_pressure, stroke_volume, cardiac_output, ptt, wall_stress, blood_flow, dpdt, blood_velocity, reynolds_number, risk_level`.

## 3. Backend (`python_backend/`)

| File | Role |
|---|---|
| `server.py` | **Current entry point.** Loads the dataset once, loops forever over its windows, streams one packet/sample at 125 Hz to every connected client. Logs packet schema + rolling debug stats once/sec. |
| `streams/dataset_stream.py` | Loads the `.mat` file (`mat73`), exposes `load_dataset()` and `get_window_signals(subj, win_idx)` — per-window ECG, time, ABP, R-peak indices, BPM. |
| `processors/ecg_processor.py` | `calc_rr_interval(bpm)`, `calc_cardiac_phase(t, last_r_peak_t, rr)` — normalises position in the cardiac cycle (0 = R-peak, 1 = next R-peak). |
| `processors/hemodynamics.py` | `calc_map`, `calc_pulse_pressure`, `calc_stroke_volume` (Windkessel: SV ≈ PP × arterial compliance), `calc_cardiac_output` (CO = SV×HR/1000), `calc_ptt` (estimated from SBP, no real PPG channel), `calc_wall_stress` (Laplace's law, σ = P·r/2h), `calc_blood_flow` (2-element Windkessel, Q = P/R + C·dP/dt), `calc_blood_velocity` (empirical CO/5 scaling). |
| `processors/risk_engine.py` | `calc_reynolds` (Re = ρvD/μ) + **weighted multi-factor** risk scoring (`calc_risk_with_reasons`): 6 factors (MAP, wall stress, Reynolds, HR, CO, pulse pressure) each score 0–3 points; total ≥6 → High, ≥3 → Moderate, else Low. Returns human-readable reason strings per triggered factor. Has an explicit educational-use disclaimer and documents *why* it replaced an older OR-gate design (see docstring). |
| `models/packet_model.py` | `build_packet(...)` — assembles the JSON dict sent over the wire each frame. |
| `utils/constants.py` | Shared constants: sampling rate (125 Hz), `DELAY`, arterial compliance, LV radius/wall thickness, peripheral resistance, blood density/viscosity, aorta diameter. |
| `tests/test_hemodynamics.py` | Unit tests for the hemodynamics formulas. |
| `check_packets.py`, `inspect_dataset.py` | Standalone debug/inspection scripts (not part of the running server). |

**Stale/superseded files (not used by the running system):**
- `websocket_server.py` — an earlier **monolithic** version of `server.py` (all logic in one file, older OR-gate risk model). Superseded by the `streams/processors/models/utils` split.
- `stream_ecg.py` — an even earlier prototype that just prints ECG samples to the console (no WebSocket, no ABP, no derived metrics).

These two look like dead code left over from incremental development — safe to delete once confirmed unused, or worth keeping only as historical reference.

## 4. Frontend (`src/`)

| File | Role |
|---|---|
| `main.jsx` | React entry point. |
| `App.jsx` | Main dashboard layout/state owner: WebSocket subscription, smoothing, chart data prep, tab switching (Dashboard / Verification). |
| `websocket.js` | WebSocket client — connects to `ws://localhost:8765`, exposes `onMessage/offMessage`, `onStatusChange/offStatusChange` pub/sub. |
| `useSmoothedMetrics.js` | Hook that smooths incoming numeric packet values over time so UI numbers don't jitter frame-to-frame. |
| `useSmoothed.jsx` | Related smoothing hook/utility (check for overlap with `useSmoothedMetrics.js` — possible duplication worth consolidating). |
| `Heart3D.jsx` | Three.js canvas wrapper — renders external + internal heart views side by side. |
| `HeartModel.jsx` | External 3D heart (FBX model from `public/Heart.fbx`), beat animation driven by BPM/R-peak, pressure-based heatmap coloring. |
| `InternalHeartView.jsx` | Internal cutaway heart view. |
| `BloodFlowParticles.jsx` | Particle effect visualizing blood flow in the 3D scene. |
| `ElectricalPulse.jsx` | Visual pulse effect synced to ECG R-peaks (electrical conduction animation). |
| `BlockageGauge.jsx` | Gauge visual, likely for a "blockage %" derived/simulated metric. |
| `ConditionSimulator.jsx` | UI to simulate different cardiac conditions/scenarios. |
| `CardiacPhaseCard.jsx` | Displays current position in the cardiac cycle (systole/diastole phase). |
| `MetricsPanel.jsx` | Card grid of derived metrics (MAP, SV, CO, PTT, wall stress, blood flow/velocity, Reynolds). |
| `RiskPanel.jsx` | Displays current risk level (Low/Moderate/High) with contributing factors. |
| `PredictionPanel.jsx` | Likely a forward-looking/predictive metrics display — purpose should be confirmed with whoever added it. |
| `VerificationPage.jsx` + `verificationData.js` | Second tab showing the formulas/definitions behind each metric, for auditability/explainability. |
| `App.css`, `index.css` | Global styles (Tailwind). |

**3D assets:** `public/Heart.fbx`, `public/beating-heart.glb`, plus `models/external_heart/` and `models/internal_heart/` — multiple heart model assets exist; worth confirming which are actually referenced vs. leftover alternatives.

**`unity/CardiacDigitalTwin/`** — a separate Unity project exists in the repo. Its relationship to the React app (alternative visualization? prototype? abandoned?) isn't documented — flag this for the incoming owner to clarify with whoever added it.

## 5. Dataset

- `dataset/p000003.mat` (+ its source `.zip`) — a physiological recording with ECG Lead II and Arterial Blood Pressure, sampled at 125 Hz, windowed into segments (`Subj_Wins` struct: `ECG_Record_F`, `T`, `ECG_RPeaks`, `ABP_Raw`, `SegSBP`, `SegDBP`). Loaded via `mat73` since the file uses MATLAB v7.3 format.
- Only one subject's recording is bundled; the server loops it indefinitely, which is why SBP/DBP get small random jitter added per-sample (`server.py`) — otherwise every loop iteration would be bit-identical.

## 6. Running the Project

Two terminals, backend first:

```bash
cd python_backend
python -m venv venv
venv\Scripts\activate        # or `source venv/bin/activate` on Linux/Mac
pip install websockets mat73 numpy
python server.py             # ws://localhost:8765
```

```bash
npm install
npm run dev                  # http://localhost:5173
```

Other frontend commands: `npm run build`, `npm run preview`, `npm run lint`.

## 7. Known Issues / Tech Debt

- **Dead/duplicate backend files**: `websocket_server.py` and `stream_ecg.py` are superseded prototypes still sitting in `python_backend/` — confusing for a new contributor trying to find the "real" entry point. Recommend deleting or clearly marking as archived.
- **Possible duplicate frontend hooks**: `useSmoothed.jsx` vs `useSmoothedMetrics.js` — confirm whether both are live or one is leftover.
- **Unity folder** (`unity/CardiacDigitalTwin/`) has no documentation tying it to the rest of the project.
- **Single patient/dataset**: only `p000003.mat` is bundled; no obvious mechanism to swap datasets or support multiple patients.
- **No authentication/CORS hardening** on the WebSocket server — fine for local demo, not production-ready.
- **README says Windows paths** (`d:\majorProject\...`) — written for a Windows dev environment; Linux/Mac users need to adapt `venv` activation commands (README does cover this loosely but the structure section is Windows-flavored).
- Risk engine and hemodynamics formulas are explicitly **non-clinical approximations** (documented in `risk_engine.py`'s docstring) — important context if this is ever pitched as more than a demo.

## 8. Testing

- `python_backend/tests/test_hemodynamics.py` — unit tests for the hemodynamics formulas.
- No tests found for `ecg_processor.py`, `risk_engine.py`, `packet_model.py`, or the dataset loader.
- No frontend tests (no test runner configured in `package.json`).

## 9. Suggested Next Steps

1. Decide fate of `websocket_server.py` / `stream_ecg.py` (archive or delete).
2. Clarify the Unity project's purpose and whether it's still maintained.
3. Confirm which 3D model assets (`Heart.fbx` vs `beating-heart.glb` vs `models/external_heart` / `models/internal_heart`) are actually in use.
4. Add test coverage for `risk_engine.py` (it's the most complex/consequential logic) and `ecg_processor.py`.
5. If this moves beyond a demo, revisit the hardcoded single-patient dataset and the lack of WebSocket auth.
