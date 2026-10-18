// src/App.jsx
import React, { useEffect, useState } from "react";
import { onMessage, offMessage, onStatusChange, offStatusChange } from "./websocket";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Filler, Tooltip, Legend,
} from "chart.js";

import Heart3D            from "./Heart3D";
import MetricsPanel       from "./MetricsPanel";
import RiskPanel          from "./RiskPanel";
import CardiacPhaseCard   from "./CardiacPhaseCard";

import { useSmoothedMetrics } from "./useSmoothedMetrics";
import VerificationPage from "./VerificationPage";

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

  // ── WebSocket connection status ──────────────────────────────────────────
  const [wsStatus, setWsStatus] = useState("connecting");

  // ── Live data from WebSocket ──────────────────────────────────────────────
  const [live, setLive] = useState({
    bpm: 72, sbp: 120, dbp: 80, abp: 100, spo2: 99,
    rPeak: false, map: 93, pulsePressure: 40, strokeVolume: 70,
    cardiacOutput: 5.0, ptt: 200, wallStress: 150, reynolds: 1200,
    riskLevel: "Low", cardiacPhase: 0, bloodFlow: 0, bloodVelocity: 0,
  });

  // ── UI state ──────────────────────────────────────────────────────────────
  const [timeString, setTimeString] = useState("");
  const [ecgFlash,   setEcgFlash]   = useState(false);
  const [rawBpm, setRawBpm] = useState(72);
  const [rawSbp,  setRawSbp] = useState(120);
  const [rawDbp,  setRawDbp] = useState(80);

  // ── History buffers ───────────────────────────────────────────────────────
  const [ecgHistory, setEcgHistory] = useState([]);
  const [abpHistory, setAbpHistory] = useState([]);
  const [bpHistory,  setBpHistory]  = useState([]);

  const d = {
    ...live,
    bpm:           smooth.bpm,
    sbp:           smooth.sbp,
    dbp:           smooth.dbp,
    map:           smooth.map,
    pulsePressure: smooth.pulsePressure,
    strokeVolume:  smooth.strokeVolume,
    cardiacOutput: smooth.cardiacOutput,
    ptt:           smooth.ptt,
    wallStress:    smooth.wallStress,
    reynolds:      smooth.reynolds,
    bloodVelocity: smooth.bloodVelocity,
    bloodFlow:     smooth.bloodFlow,
    riskLevel:     smooth.riskLevel ?? live.riskLevel,
    blockage:      smooth.blockage ?? 0,
    abp:    live.abp,
    rPeak:  live.rPeak,
    spo2:   live.spo2,
    cardiacPhase: live.cardiacPhase,
  };

  // ── WebSocket handler ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleMessage = (p) => {
      const spo2Live = live.spo2 ?? 99;
      setLive(prev => ({
        bpm: p.bpm, sbp: p.sbp, dbp: p.dbp, abp: p.abp, spo2: prev.spo2,
        rPeak: p.r_peak, map: p.map, pulsePressure: p.pulse_pressure,
        strokeVolume: p.stroke_volume, cardiacOutput: p.cardiac_output,
        ptt: p.ptt, wallStress: p.wall_stress, reynolds: p.reynolds_number,
        riskLevel: p.risk_level, cardiacPhase: p.cardiac_phase,
        bloodFlow: p.blood_flow, bloodVelocity: p.blood_velocity,
      }));

      pushSmooth(
        {
          bpm: p.bpm, sbp: p.sbp, dbp: p.dbp, map: p.map,
          pulsePressure: p.pulse_pressure, strokeVolume: p.stroke_volume,
          cardiacOutput: p.cardiac_output, ptt: p.ptt,
          wallStress: p.wall_stress, reynolds: p.reynolds_number,
          bloodVelocity: p.blood_velocity, bloodFlow: p.blood_flow,
        },
        0,
        p.risk_level,
        [],
      );

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

    const handleStatus = (s) => setWsStatus(s);

    onMessage(handleMessage);
    onStatusChange(handleStatus);
    return () => {
      offMessage(handleMessage);
      offStatusChange(handleStatus);
    };
  }, []);

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

  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b0b] to-[#111214] text-gray-100 p-6">

      {/* Header */}
      <header className="max-w-[1400px] mx-auto text-center mb-4">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-wide">
          Digital Twin of Heart — Patient: Rajveer Patil
        </h1>
        <div className="flex items-center justify-center gap-3 mt-1">
          <div className="text-sm text-gray-400">{timeString}</div>
          <div className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${
            wsStatus === "connected"    ? "bg-green-900/30 border-green-600/50 text-green-300" :
            wsStatus === "connecting"   ? "bg-yellow-900/30 border-yellow-600/50 text-yellow-300" :
                                          "bg-red-900/30 border-red-600/50 text-red-300"
          }`}>
            <span>{wsStatus === "connected" ? "✅" : wsStatus === "connecting" ? "⏳" : "❌"}</span>
            <span className="capitalize">{wsStatus}</span>
          </div>
        </div>

      </header>

      {/* ── Tab navigation ── */}
      <div className="max-w-[1400px] mx-auto mb-6">
        <div className="flex gap-2 border-b border-gray-800 pb-0">
          {[
            { id: "dashboard",    label: "🫀 Dashboard"    },
            { id: "verification", label: "🔬 Verification" },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-500 text-indigo-300 bg-indigo-950/30"
                  : "border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600"
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Verification tab ── */}
      {activeTab === "verification" && (
        <VerificationPage spo2={d.spo2} />
      )}

      {/* ── Dashboard tab ── */}
      {activeTab !== "verification" && <>

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
                [36.8,               "TEMPERATURE (°C)", "text-yellow-400"],
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
            <div className="w-full flex-1">
              <Heart3D bpm={d.bpm} rPeak={d.rPeak} sbp={d.sbp} dbp={d.dbp} abp={d.abp} height="100%" />
            </div>
            <div className="mt-2 text-xs text-gray-400">Beating — Live</div>
          </div>

          <div className="flex-1 bg-[#0f1315] border border-gray-800 rounded-xl p-4 shadow-md">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Alerts</div>
            <div className="text-xs text-gray-500">No active alerts.</div>
          </div>

        </aside>
      </div>

      {/* ══ SCREEN 2 — 3-column: left | 3D twin | right ══ */}
      <div className="max-w-[1400px] mx-auto pb-8">
        <div className="grid grid-cols-10 gap-5">

          {/* Left column */}
          <div className="col-span-3 space-y-4">
            <MetricsPanel bpm={d.bpm} sbp={d.sbp} dbp={d.dbp} abp={d.abp} spo2={d.spo2}
              riskLevel={d.riskLevel}
              mMap={smooth._raw?.map}  mPP={smooth._raw?.pulsePressure}
              mSV={smooth._raw?.strokeVolume}  mCO={smooth._raw?.cardiacOutput}
              mPTT={smooth._raw?.ptt}  mWS={smooth._raw?.wallStress}
              mRe={smooth._raw?.reynolds}  mBF={smooth._raw?.bloodFlow}
              mBV={smooth._raw?.bloodVelocity} />
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

            {/* Cardiac Phase */}
            <div className="grid grid-cols-1 gap-4">
              <CardiacPhaseCard cardiacPhase={d.cardiacPhase} />
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


          </div>

        </div>
      </div>
      </> }
    </div>
  );
}
