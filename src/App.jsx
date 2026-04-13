// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import socket from "./websocket";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Filler, Tooltip, Legend,
} from "chart.js";

import Heart3D            from "./Heart3D";
import MetricsPanel       from "./MetricsPanel";
import RiskPanel          from "./RiskPanel";
import CardiacPhaseCard   from "./CardiacPhaseCard";
import BlockageGauge, { computeBlockageScore } from "./BlockageGauge";
import { PredictionPanel, PhysioExplainer } from "./PredictionPanel";
import ConditionSimulator from "./ConditionSimulator";
import { useSmoothedMetrics } from "./useSmoothedMetrics";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const CHART_BASE = {
  responsive: true, maintainAspectRatio: false, animation: false,
  plugins: { legend: { display: false } },
  elements: { line: { borderWidth: 2 } },
  scales: { x: { display: false }, y: { ticks: { color: "#94a3b8" }, grid: { color: "#0f1724" } } },
};

export default function App() {
  // ── Smoothing hook — drives all numeric card displays ───────────────────
  const { display: smooth, push: pushSmooth } = useSmoothedMetrics()

  // ── Live data from WebSocket ──────────────────────────────────────────────
  const [live, setLive] = useState({
    bpm: 72, sbp: 120, dbp: 80, abp: 100, spo2: 99,
    rPeak: false, map: 93, pulsePressure: 40, strokeVolume: 70,
    cardiacOutput: 5.0, ptt: 200, wallStress: 150, reynolds: 1200,
    riskLevel: "Low", cardiacPhase: 0, bloodFlow: 0, bloodVelocity: 0,
  });

  // ── Condition simulator override ──────────────────────────────────────────
  const [simActive,   setSimActive]   = useState(null);
  const [simOverride, setSimOverride] = useState({});
  const arrhythmiaRef = useRef(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [temp,       setTemp]       = useState(36.8);
  const [timeString, setTimeString] = useState("");
  const [ecgFlash,   setEcgFlash]   = useState(false);
  const [rawBpm, setRawBpm] = useState(72);
  const [rawSbp,  setRawSbp] = useState(120);
  const [rawDbp,  setRawDbp] = useState(80);

  // ── History buffers ───────────────────────────────────────────────────────
  const [ecgHistory, setEcgHistory] = useState([]);
  const [abpHistory, setAbpHistory] = useState([]);
  const [bpHistory,  setBpHistory]  = useState([]);

  // Merged display values:
  // - charts use raw `live` values (real-time)
  // - numeric cards use `smooth` values (3-stage smoothed)
  // - simulator overrides both when active
  const d = {
    ...live,
    // Override numeric display with smoothed values
    bpm:           simOverride.bpm           ?? smooth.bpm,
    sbp:           simOverride.sbp           ?? smooth.sbp,
    dbp:           simOverride.dbp           ?? smooth.dbp,
    map:           simOverride.map           ?? smooth.map,
    pulsePressure: simOverride.pulsePressure ?? smooth.pulsePressure,
    strokeVolume:  simOverride.strokeVolume  ?? smooth.strokeVolume,
    cardiacOutput: simOverride.cardiacOutput ?? smooth.cardiacOutput,
    ptt:           simOverride.ptt           ?? smooth.ptt,
    wallStress:    simOverride.wallStress    ?? smooth.wallStress,
    reynolds:      simOverride.reynolds      ?? smooth.reynolds,
    bloodVelocity: smooth.bloodVelocity,
    bloodFlow:     smooth.bloodFlow,
    riskLevel:     simOverride.riskLevel     ?? smooth.riskLevel ?? live.riskLevel,
    blockage:      smooth.blockage ?? 0,
    // Keep raw values for charts and 3D heart
    abp:    live.abp,
    rPeak:  live.rPeak,
    spo2:   simOverride.spo2 ?? live.spo2,
    cardiacPhase: live.cardiacPhase,
  };

  // ── WebSocket handler ─────────────────────────────────────────────────────
  useEffect(() => {
    socket.onmessage = (event) => {
      const p = JSON.parse(event.data);
      setLive(prev => ({
        bpm: p.bpm, sbp: p.sbp, dbp: p.dbp, abp: p.abp, spo2: prev.spo2,
        rPeak: p.r_peak, map: p.map, pulsePressure: p.pulse_pressure,
        strokeVolume: p.stroke_volume, cardiacOutput: p.cardiac_output,
        ptt: p.ptt, wallStress: p.wall_stress, reynolds: p.reynolds_number,
        riskLevel: p.risk_level, cardiacPhase: p.cardiac_phase,
        bloodFlow: p.blood_flow, bloodVelocity: p.blood_velocity,
      }));

      // Push raw values into smoother — charts stay real-time, cards use smooth
      const blockageRaw = computeBlockageScore(p.sbp, p.wall_stress, p.reynolds_number, prev => prev.spo2 ?? 99)
      pushSmooth(
        {
          bpm: p.bpm, sbp: p.sbp, dbp: p.dbp, map: p.map,
          pulsePressure: p.pulse_pressure, strokeVolume: p.stroke_volume,
          cardiacOutput: p.cardiac_output, ptt: p.ptt,
          wallStress: p.wall_stress, reynolds: p.reynolds_number,
          bloodVelocity: p.blood_velocity, bloodFlow: p.blood_flow,
        },
        computeBlockageScore(p.sbp, p.wall_stress, p.reynolds_number, 99),
        p.risk_level,
        [],  // explanations built in PhysioExplainer from smooth values
      )
      // Instant updates for chart labels
      setRawSbp(p.sbp);
      setRawDbp(p.dbp);
      setRawBpm(p.bpm);
      setTimeString(new Date().toLocaleString());
      setEcgHistory(prev => [...prev, p.ecg].slice(-250));
      setAbpHistory(prev => [...prev, p.abp].slice(-200));
      setBpHistory(prev  => [...prev, { sys: p.sbp, dia: p.dbp }].slice(-120));
      if (p.r_peak) {
        setEcgFlash(true);
        setTimeout(() => setEcgFlash(false), 120);
      }
    };
  }, []);

  // ── Arrhythmia simulation ─────────────────────────────────────────────────
  useEffect(() => {
    if (simActive === "Arrhythmia") {
      arrhythmiaRef.current = setInterval(() => {
        setSimOverride(prev => ({ ...prev, bpm: 55 + Math.floor(Math.random() * 70) }));
      }, 600);
    } else {
      clearInterval(arrhythmiaRef.current);
    }
    return () => clearInterval(arrhythmiaRef.current);
  }, [simActive]);

  // ── Simulator handlers ────────────────────────────────────────────────────
  function handleSimulate(values, label) {
    const o = {};
    if (values.sbp  != null) o.sbp  = values.sbp;
    if (values.dbp  != null) o.dbp  = values.dbp;
    if (values.bpm  != null) o.bpm  = values.bpm;
    if (values.spo2 != null) o.spo2 = values.spo2;
    if (values.sbp && values.dbp) {
      const pp = values.sbp - values.dbp;
      o.pulsePressure = pp;
      o.strokeVolume  = Math.round(pp * 1.5);
      o.map           = Math.round(values.dbp + pp / 3);
      o.wallStress    = Math.round((values.sbp * 3.0) / 2.0);
      o.riskLevel     = values.sbp > 160 ? "High" : values.sbp > 140 ? "Moderate" : "Low";
    }
    setSimOverride(o);
    setSimActive(label);
  }

  function handleReset() { setSimOverride({}); setSimActive(null); }

  // ── Chart datasets ────────────────────────────────────────────────────────
  const ecgData = {
    labels: ecgHistory.map((_, i) => i),
    datasets: [{ label: "ECG", data: ecgHistory, borderColor: "#06b6d4", borderWidth: 2, pointRadius: 0, tension: 0 }],
  };
  const abpData = {
    labels: abpHistory.map((_, i) => i),
    datasets: [{ label: "ABP", data: abpHistory, borderColor: "#f97316", borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true, backgroundColor: "rgba(249,115,22,0.08)" }],
  };
  const bpData = {
    labels: bpHistory.map((_, i) => i),
    datasets: [
      { label: "Systolic",  data: bpHistory.map(p => p.sys), borderColor: "#ef4444", borderWidth: 4, pointRadius: 0, tension: 0.45, fill: false },
      { label: "Diastolic", data: bpHistory.map(p => p.dia), borderColor: "#60a5fa", borderWidth: 4, pointRadius: 0, tension: 0.45, fill: false },
    ],
  };
  const bpChartOptions = {
    ...CHART_BASE, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#9ca3af" } } },
    scales: {
      x: { display: false },
      y: {
        min: bpHistory.length ? Math.min(...bpHistory.map(p => p.dia)) - 5 : 70,
        max: bpHistory.length ? Math.max(...bpHistory.map(p => p.sys)) + 5 : 140,
        ticks: { color: "#94a3b8" }, grid: { color: "#0f1724" },
      },
    },
  };
  const abpChartOptions = {
    ...CHART_BASE, maintainAspectRatio: false,
    scales: { x: { display: false }, y: { min: 40, max: 180, ticks: { color: "#94a3b8" }, grid: { color: "#0f1724" } } },
  };

  const turbulence = d.reynolds > 5000 ? "critical" : d.reynolds > 4000 ? "warning" : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b0b] to-[#111214] text-gray-100 p-6">

      {/* Header */}
      <header className="max-w-[1400px] mx-auto text-center mb-6">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-wide">
          Digital Twin of Heart — Patient: Rajveer Patil
        </h1>
        <div className="text-sm text-gray-400 mt-1">{timeString}</div>
        {simActive && (
          <div className="mt-2 inline-block px-3 py-1 rounded-full bg-yellow-900/40 border border-yellow-600/50 text-yellow-300 text-xs">
            ⚡ Simulating: {simActive}
          </div>
        )}
      </header>

      {/* ══ SCREEN 1 — charts + vitals ══ */}
      <div className="max-w-[1400px] mx-auto grid grid-cols-5 gap-5 mb-6">

        {/* Left 4/5 */}
        <div className="col-span-5 md:col-span-4 space-y-5">

          {/* Patient info */}
          <div className="bg-[#0f1315] border border-gray-800 rounded-xl p-4 shadow-md">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Patient</div>
                <div className="text-lg font-semibold">Rajveer Patil</div>
                <div className="text-sm text-gray-400">Age: 58 &nbsp;|&nbsp; ID: 123456789</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Connected Devices</div>
                <ul className="text-sm text-gray-300 space-y-0.5">
                  <li>ECG Lead II — Active</li><li>PPG (SpO₂) — Active</li><li>Arterial Line (ABP) — Active</li>
                </ul>
              </div>
            </div>
          </div>

          {/* ECG + ABP */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* ECG with R-peak flash — BPM label is raw live.bpm, not smoothed */}
            <div className={`bg-[#0f1315] border rounded-xl p-4 shadow-md overflow-hidden transition-all duration-100 ${ecgFlash ? "border-red-500/70 shadow-red-900/40 shadow-lg" : "border-gray-800"}`}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-medium text-gray-200">ECG (Lead II)</h2>
                <div className="flex items-center gap-2">
                  {ecgFlash && <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />}
                  <span className="text-sm text-gray-400">{rawBpm} BPM</span>
                </div>
              </div>
              <div className="h-[220px]">
                <Line data={ecgData} options={{ ...CHART_BASE, maintainAspectRatio: false, scales: { x: { display: false }, y: { min: -1.2, max: 1.2, ticks: { color: "#94a3b8" }, grid: { color: "#0f1724" } } } }} />
              </div>
            </div>

            {/* ABP */}
            <div className="bg-[#0f1315] border border-gray-800 rounded-xl p-4 shadow-md overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-medium text-gray-200">Arterial Blood Pressure</h2>
                <div className="text-sm text-orange-400">{Math.round(d.abp)} mmHg</div>
              </div>
              <div className="h-[220px]">
                <Line data={abpData} options={abpChartOptions} />
              </div>
            </div>
          </div>

          {/* BP Trend — label uses raw live.sbp/dbp, not smoothed */}
          <div className="bg-[#0f1315] border border-gray-800 rounded-xl p-4 shadow-md overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-medium text-gray-200">Blood Pressure Trend</h2>
              <div className="text-sm text-gray-400">{Math.round(rawSbp)}/{Math.round(rawDbp)} mmHg</div>
            </div>
            <div className="h-[180px]">
              <Line data={bpData} options={bpChartOptions} />
            </div>
          </div>

          {/* Big vitals */}
          <div className="bg-[#0f1315] border border-gray-800 rounded-xl p-4 shadow-md">
            <div className="grid grid-cols-4 gap-4 text-center">
              {[
                [live.bpm,           "HEART RATE (BPM)", "text-red-400"],
                [Math.round(d.sbp), "SYSTOLIC (mmHg)",  "text-emerald-400"],
                [temp,               "TEMPERATURE (°C)", "text-yellow-400"],
                [Math.round(d.spo2), "SpO₂ (%)",         "text-sky-400"],
              ].map(([val, label, color]) => (
                <div key={label}>
                  <div className={`text-4xl md:text-5xl font-extrabold ${color}`}>{val}</div>
                  <div className="mt-1 text-sm text-gray-400">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 1/5 — mini heart + alerts */}
        <aside className="col-span-5 md:col-span-1 flex flex-col space-y-4">
          <div className={`h-[36vh] bg-[#0f1315] border rounded-xl p-4 flex flex-col items-center justify-center shadow-md transition-all duration-100 ${ecgFlash ? "border-red-500/60 shadow-red-900/30 shadow-md" : "border-gray-800"}`}>
            <div className="text-sm text-gray-400 mb-2">3D Twin (Live)</div>
            <div className="w-[140px] h-[140px]">
              <Heart3D bpm={d.bpm} rPeak={d.rPeak} sbp={d.sbp} dbp={d.dbp} abp={d.abp} />
            </div>
            <div className="mt-2 text-xs text-gray-400">Beating — Live</div>
          </div>

          {turbulence && (
            <div className={`rounded-xl p-3 border ${turbulence === "critical" ? "bg-red-900/40 border-red-500/60" : "bg-yellow-900/30 border-yellow-600/50"}`}>
              <div className={`text-xs font-bold ${turbulence === "critical" ? "text-red-300" : "text-yellow-300"}`}>
                🌀 {turbulence === "critical" ? "Critical" : "Possible"} Turbulent Flow
              </div>
              <div className="text-xs text-gray-400 mt-1">Re = {d.reynolds}</div>
            </div>
          )}

          <div className="flex-1 bg-[#0f1315] border border-gray-800 rounded-xl p-4 shadow-md overflow-auto">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Alerts</div>
            <div className="space-y-2">
              {d.sbp > 140 && <div className="p-2 rounded bg-orange-900/30 border border-orange-700/50"><div className="text-xs text-orange-300 font-semibold">⚠ Elevated SBP: {Math.round(d.sbp)} mmHg</div></div>}
              {d.bpm > 100 && <div className="p-2 rounded bg-red-900/30 border border-red-700/50"><div className="text-xs text-red-300 font-semibold">💓 Tachycardia: {d.bpm} BPM</div></div>}
              {d.bpm < 60  && <div className="p-2 rounded bg-yellow-900/30 border border-yellow-700/50"><div className="text-xs text-yellow-300 font-semibold">💓 Bradycardia: {d.bpm} BPM</div></div>}
              {d.spo2 < 92 && <div className="p-2 rounded bg-purple-900/30 border border-purple-700/50"><div className="text-xs text-purple-300 font-semibold">💨 Low SpO₂: {Math.round(d.spo2)}%</div></div>}
              {d.riskLevel === "Low" && d.bpm <= 100 && d.sbp <= 140 && d.spo2 >= 92 && (
                <div className="text-xs text-gray-500">No active alerts.</div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ══ SCREEN 2 — 3-column: left | 3D twin | right ══ */}
      <div className="max-w-[1400px] mx-auto pb-8">
        <div className="grid grid-cols-10 gap-5">

          {/* Left column */}
          <div className="col-span-3 space-y-4">
            <div className="bg-[#0f1315] border border-gray-800 rounded-xl p-4 shadow-md">
              <h3 className="text-sm font-semibold text-gray-200 mb-3">Heart Parameters</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Heart Rate (BPM)</label>
                  <input type="range" min="40" max="180" value={d.bpm}
                    onChange={e => setSimOverride(p => ({ ...p, bpm: Number(e.target.value) }))}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                  <div className="text-right text-xs text-blue-400 font-semibold">{d.bpm}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Temperature (°C)</label>
                  <input type="number" value={temp} onChange={e => setTemp(Number(e.target.value))}
                    step="0.1" className="w-full bg-gray-700 text-gray-100 px-2 py-1.5 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">SpO₂ (%)</label>
                  <input type="number" value={Math.round(d.spo2)}
                    onChange={e => setSimOverride(p => ({ ...p, spo2: Number(e.target.value) }))}
                    min="80" max="100" className="w-full bg-gray-700 text-gray-100 px-2 py-1.5 rounded-lg text-sm" />
                </div>
              </div>
            </div>

            <ConditionSimulator onSimulate={handleSimulate} onReset={handleReset} active={simActive} />
            <MetricsPanel bpm={d.bpm} sbp={d.sbp} dbp={d.dbp} abp={d.abp} spo2={d.spo2}
              map={d.map} strokeVolume={d.strokeVolume} cardiacOutput={d.cardiacOutput}
              ptt={d.ptt} wallStress={d.wallStress} reynolds={d.reynolds} riskLevel={d.riskLevel} />
          </div>

          {/* Center — large 3D twin */}
          <div className="col-span-4 space-y-4">
            <div className={`w-full h-[500px] bg-[#0f1315] border rounded-xl p-4 shadow-md flex flex-col overflow-hidden transition-all duration-100 ${ecgFlash ? "border-red-500/40 shadow-red-900/20 shadow-lg" : "border-gray-800"}`}>
              <h2 className="text-xl font-bold text-gray-200 mb-2 text-center">Digital Heart Twin</h2>
              <div className="flex-1">
                <Heart3D bpm={d.bpm} rPeak={d.rPeak} sbp={d.sbp} dbp={d.dbp} abp={d.abp} size="large" />
              </div>
              <div className="text-center text-xs text-gray-500 mt-1">
                Left: External &nbsp;|&nbsp; Right: Internal cutaway
              </div>
            </div>

            {/* Cardiac Phase + Blockage Gauge */}
            <div className="grid grid-cols-2 gap-4">
              <CardiacPhaseCard cardiacPhase={d.cardiacPhase} />
              <BlockageGauge score={Math.round(d.blockage)} />
            </div>
          </div>

          {/* Right column */}
          <div className="col-span-3 space-y-4">
            <RiskPanel riskLevel={d.riskLevel} sbp={d.sbp} wallStress={d.wallStress} reynolds={d.reynolds} />

            {/* Derived Metrics */}
            <div className="bg-[#0f1315] border border-gray-800 rounded-xl p-4 shadow-md">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-3">Derived Metrics</div>
              <div className="space-y-1.5">
                {[
                  ["MAP",            `${d.map} mmHg`],
                  ["Pulse Pressure", `${d.pulsePressure} mmHg`],
                  ["Stroke Volume",  `${d.strokeVolume} mL`],
                  ["Cardiac Output", `${d.cardiacOutput} L/min`],
                  ["PTT",            `${d.ptt} ms`],
                  ["Wall Stress",    `${d.wallStress} mmHg-eq`],
                  ["Blood Flow",     `${d.bloodFlow} mL/s`],
                  ["Blood Velocity", `${d.bloodVelocity} m/s`],
                  ["Reynolds No.",   `${d.reynolds}`],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between items-center py-0.5 border-b border-gray-800/60">
                    <span className="text-gray-400 text-xs">{label}</span>
                    <span className="text-emerald-400 font-semibold text-xs">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            <PredictionPanel sbp={d.sbp} bpm={d.bpm} wallStress={d.wallStress}
              reynolds={d.reynolds} spo2={d.spo2} cardiacOutput={d.cardiacOutput} />

            <PhysioExplainer sbp={d.sbp} ptt={d.ptt} reynolds={d.reynolds}
              cardiacOutput={d.cardiacOutput} wallStress={d.wallStress} spo2={d.spo2} />
          </div>

        </div>
      </div>
    </div>
  );
}
