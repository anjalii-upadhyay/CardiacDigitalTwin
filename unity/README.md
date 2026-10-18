# Cardiac Digital Twin — Unity 3D Heart

A 3D human heart that beats **beat-for-beat** with real patient data streamed from `python_backend/`.
Every contraction is driven by an actual R-peak in the ECG recording; blood flows through the real
anatomical path inside the model, pulsing in time with the cardiac cycle.

> **Not a medical device.** Education/research visualization only. Not for diagnosis or clinical
> decision-making. See *Honesty model* and *Known limitations* below.

---

## 1. Quick start

You need **two things running**: the Python backend (data source) and the Unity Editor (the twin).

### Step 1 — Start the backend

```bash
cd python_backend
python3 -m venv venv                        # first time only
venv/bin/pip install -r requirements.txt    # first time only
venv/bin/python server.py
```

Wait for:

```
Total windows: 492  |  SBP range: 88.2–155.3
WebSocket server running on ws://localhost:8765
```

Loading the dataset takes a few seconds. On Windows use `venv\Scripts\python server.py`.

### Step 2 — Open the twin in Unity

1. Unity Hub → **Open** → select `unity/CardiacDigitalTwin`
2. Editor version **6000.4.1f1** (Unity 6.4)
3. Open the scene: `Assets/Scenes/SampleScene.unity`
4. Press **Play**

You should see the heart beating with a vitals panel in the top-left reading
`REPLAY P000003.MAT`, live BPM, blood pressure, and risk level.

**Order doesn't matter.** If Unity starts first it retries every 2 s and connects automatically
once the backend appears.

### Step 3 — Stop

Stop Play mode in Unity, then `Ctrl+C` the backend. If a server was left running detached:

```bash
pkill -f "server.py"
```

---

## 2. What you should see

| Panel reads | Meaning |
|---|---|
| `REPLAY P000003.MAT` + vitals | Working. Heart is driven by the patient recording. |
| `NO SIGNAL` | Backend not running/reachable. Heart falls back to an internal 72 bpm demo rhythm — **that rhythm is not patient data**. |
| `CONNECTED — VALUE OUT OF RANGE` | Stream alive, but values failed physiological validation (shows the rejected numbers). Means sensor/backend trouble — *not* a lost connection. |

The heart tints **amber** at Moderate risk and pulses **red** at High risk.

---

## 3. Scene contents

```
SampleScene
├── Main Camera            framed on the heart
├── Directional Light
├── BeatingHeart           the glTF model + its skeleton
│   ├── CardiacCycle       master clock: drives muscle AND blood flow
│   ├── HeartDataClient    WebSocket client + packet validation
│   ├── VitalsDisplay      monitor overlay + risk tint
│   └── Animation ("test") the baked squeeze clip, scrubbed by CardiacCycle
├── RightHeartFlow         BloodFlowPath — blue, deoxygenated circuit
└── LeftHeartFlow          BloodFlowPath — red, oxygenated circuit
```

### Scripts

| File | Role |
|---|---|
| `Assets/Scripts/CardiacCycle.cs` | The single source of timing. Slaves the cycle to the patient's ECG, computes valve-gated flow drives, scrubs the muscle pose. |
| `Assets/Scripts/HeartDataClient.cs` | WebSocket client. Auto-reconnects, validates every packet, counts artifacts. |
| `Assets/Scripts/BloodFlowPath.cs` | Moves blood droplets along a pre-computed route, gated by the cycle. One per circuit. |
| `Assets/Scripts/VitalsDisplay.cs` | Patient-monitor overlay and the risk tint on the organ. |
| `Assets/Editor/BloodPathPlanner.cs` | **Editor tool.** Computes the blood routes through the model's hollow spaces. |

---

## 4. How the heartbeat is driven

The backend sends `cardiac_phase`: **0 at each R-peak, 1 at the next**. `CardiacCycle` maps that onto
its own cycle so that **atrial systole precedes the QRS**, as in a real heart. Because the phase comes
from actual detected R-peaks, irregular rhythms — early beats, late beats, pauses — reproduce exactly.

Cycle phases, in order (durations are **rate-dependent**, not fixed fractions):

1. **Atrial systole** — atria contract, the "atrial kick" tops off the ventricles
2. **Isovolumetric contraction** — all four valves shut, blood visibly holds still
3. **Ventricular ejection** — semilunar valves open, blood ejected as a bolus
4. **Isovolumetric relaxation** — all valves shut again
5. **Rapid filling** → **diastasis** — AV valves open, ventricles refill

Timings follow the **Weissler systolic-time-interval regressions**
(LVET = 413 − 1.7·HR ms, PEP = 131 − 0.4·HR ms). At high heart rates **diastole shortens first** —
diastasis vanishes, then the filling wave and atrial kick compress, and only then systole itself.

Data → visuals:

| Backend field | Drives |
|---|---|
| `cardiac_phase`, `r_peak` | When the heart beats (beat-for-beat) |
| `rr_interval` | Cycle length and all phase durations |
| `stroke_volume` | Contraction depth + ejection force (low SV → visible hypokinesis) |
| `risk_level` | Heart tint + alarm panel |

---

## 5. Blood flow

Two circuits follow the real anatomical path:

- **Blue (right):** vena cava → right atrium → **tricuspid valve** → right ventricle → **pulmonary valve** → pulmonary artery
- **Red (left):** pulmonary veins → left atrium → **mitral valve** → left ventricle → **aortic valve** → aorta

Routes are **pre-computed** by voxelising the heart mesh at 1 mm and path-finding only through hollow
space, so blood never crosses muscle. Both valves are required waypoints, so blood funnels through the
real ~1.2 mm orifices (droplets shrink to squeeze through, then swell back out).

### Re-planning routes

If you change the model, move a flow seed point, or the routes look wrong:

**Tools → Cardiac Twin → Plan Blood Paths**

It prints a report per circuit — route length, points passing through tissue (and how many are
*visible*, which should be **0**), and how close the route gets to each valve bone. The baked routes
are stored in the scene, so **save the scene afterwards**.

---

## 6. Data contract

One JSON packet per sample at 125 Hz. Fields consumed by Unity:

```jsonc
{
  "time": 12.5, "ecg": -0.04, "abp": 104.5,
  "r_peak": false,            // true on the sample at the R-peak
  "bpm": 66,                  // window mean (see limitations)
  "rr_interval": 0.912,       // TRUE beat-to-beat interval, seconds
  "cardiac_phase": 0.035,     // 0 at R-peak → 1 at next R-peak
  "sbp": 131.8, "dbp": 79.3,  // MEASURED per beat from the ABP waveform
  "map": 96.8, "pulse_pressure": 52.5,
  "stroke_volume": 78.8,      // mL — ESTIMATE: pulse pressure × compliance
  "cardiac_output": 5.2,      // L/min
  "wall_stress": 195.8, "reynolds_number": 5166,
  "risk_level": "Low",        // "Low" | "Moderate" | "High"
  "segment_break": false,     // true at a dataset window splice
  "source": "replay p000003.mat"
}
```

**To drive this from your own sensors** (e.g. ESP8266): emit this same schema over a WebSocket on
port 8765. Anything failing validation is rejected rather than rendered, so a partial/noisy feed
degrades safely instead of lying.

### Validation bounds (rejected if outside)

HR 20–250 bpm · RR 0.2–5 s · phase 0–1 · SBP 40–300 · DBP 20–200 (and DBP < SBP) ·
SV 5–250 mL · CO 0.3–20 L/min · any NaN/Infinity.

---

## 7. Honesty model

Deliberate design rules, so the twin never overstates what it knows:

- Labelled **REPLAY**, never "LIVE" — it's a looping recording, not a live patient.
- Stroke volume marked **`SV*` … estimated from pulse pressure**, because it is a surrogate, not a
  contractility measurement.
- Signal loss (>1.5 s) switches to a **clearly labelled** internal rhythm, never stale data shown as current.
- Out-of-range values get their **own alarm state** — a cardiac arrest reading must not be
  misreported as "connection lost".
- Unknown risk labels render **amber "UNKNOWN"**, never green/all-clear.
- Backend blood pressures are **measured from the real waveform** — no synthetic noise.

---

## 8. Known limitations

- **`bpm` is a window mean**, while `rr_interval` is the true per-beat value. The beat timing uses
  the accurate RR; the displayed BPM number is the window average.
- **PEP is measured from R**, not Q onset — aortic valve opening is drawn ~20–40 ms late.
- **Stroke volume is a Windkessel estimate** (PP × compliance), not a measured volume.
- **The aorta is hidden** behind the pulmonary trunk in this model and isn't cut open, so red blood
  disappears into the aortic valve and reappears leaving the arch — the climb up the aorta can't be shown.
- **The model's vein stubs are solid**; blood crosses two short hidden seams where it is invisible.
- **Coronary circulation is not modelled.**

---

## 9. Troubleshooting

**Heart imports as a grey/default asset, or blood flow breaks after reinstalling packages**

The glTF importer package (`com.unity.cloud.gltfast` 6.19.0) has an upstream bug: `MaterialExport.cs`
references `LitMaterialExport`, which only compiles with URP/HDRP installed. This project uses the
Built-in pipeline *with* Shader Graph, so the whole glTFast assembly fails to compile — and the
`.glb` then imports as a generic `DefaultAsset` instead of a 3D model.

A one-line patch was applied in the package cache:

```
Library/PackageCache/com.unity.cloud.gltfast@<hash>/Runtime/Scripts/Export/MaterialExport.cs
    #if UNITY_SHADER_GRAPH            →   #if UNITY_SHADER_GRAPH && USING_URP
```

⚠️ **`Library/` is regenerated by Unity.** If you delete `Library/`, reinstall or upgrade glTFast,
this patch is lost and the model breaks again. Re-apply it, then re-import the `.glb`.

**`NO SIGNAL` even though the backend is running**
Check the port: `ss -ltn | grep 8765`. Confirm `url` on the `HeartDataClient` component is
`ws://localhost:8765`. Connection failures are logged as warnings in the Console.

**Backend won't start — `ModuleNotFoundError`**
The venv isn't active. Use the venv's interpreter directly: `venv/bin/python server.py`.

**Dataset not found**
`server.py` resolves `../dataset/p000003.mat` relatively — run it **from inside `python_backend/`**.
