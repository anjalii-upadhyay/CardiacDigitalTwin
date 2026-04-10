  // src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import socket from "./websocket";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import Heart3D from "./Heart3D";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

/*
  App.jsx - Screen 1: Professional dark dashboard layout (80 / 20 columns)
  - Left (80%): two charts (ECG, BP/HRV) side-by-side; below them large metric row
  - Right (20%): top 40% = beating 3D-style heart (SVG + CSS pulse tied to bpm)
                   middle 30% = patient details
                   bottom 30% = alerts
  - All styling uses Tailwind classes; a few custom keyframes are added in index.css
*/

function synthesizeECG(length = 600, bpm = 72) {
  // Generate a more realistic ECG-like trace for visualization:
  // Baseline sine + periodic sharp QRS spikes based on BPM
  const samplesPerSecond = 100; // resolution
  const total = length;
  const beatsPerSecond = bpm / 60;
  const interval = samplesPerSecond / beatsPerSecond;
  const data = new Array(total).fill(0).map((_, i) => {
    // baseline wander + small noise
    const t = i / samplesPerSecond;
    const baseline = 0.02 * Math.sin(2 * Math.PI * 0.2 * t);
    const noise = (Math.random() - 0.5) * 0.01;
    // add QRS spike at beat positions (narrow positive spike + small negative before)
    const beatIndex = Math.round(i % Math.round(interval));
    // more deterministic: compute distance to nearest beat
    const beatsPassed = Math.round((i / interval));
    const beatCenter = beatsPassed * interval;
    const dist = (i - beatCenter);
    let spike = 0;
    // narrow spike for |dist| < 1..3
    if (Math.abs(dist) < 1) spike = 1.0 * Math.exp(-Math.pow(dist / 0.3, 2));
    else if (Math.abs(dist) < 3) spike = 0.25 * Math.exp(-Math.pow(dist / 0.8, 2));
    // small P/T waves
    const pWave = 0.05 * Math.sin(2 * Math.PI * (t * 1.5));
    return Math.max(-1.2, Math.min(1.2, baseline + spike + pWave + noise));
  });
  return data;
}

function synthesizeBP(length = 200, meanSys = 120, meanDia = 80) {
  // Simulate systolic/diastolic trend for visualization (smooth noise)
  const data = new Array(length).fill(0).map((_, i) => {
    const t = i / 10;
    const sys = meanSys + 3 * Math.sin(t * 0.1) + (Math.random() - 0.5) * 2;
    const dia = meanDia + 2 * Math.sin(t * 0.12 + 1) + (Math.random() - 0.5) * 1.5;
    return { sys: Math.round(sys), dia: Math.round(dia) };
  });
  return data;
}

export default function App() {
  // simulated vitals (for screen 1 display)
  const [bpm, setBpm] = useState(72);
  const [spo2, setSpo2] = useState(98);
  const [temp, setTemp] = useState(36.8);
  const [bpLatest, setBpLatest] = useState("120/80");
  const [timeString, setTimeString] = useState(new Date().toLocaleString());


  // regenerate ECG when bpm changes
  const ecgPoints = useMemo(() => synthesizeECG(600, bpm), [bpm]);
  const bpSeries = useMemo(() => synthesizeBP(120, 120, 80), []);



  // simulate small drift in vitals every few seconds
  useEffect(() => {
    const iv = setInterval(() => {
      setTimeString(new Date().toLocaleString());
      // small natural variations
      setSpo2((s) => Math.max(88, Math.min(100, Math.round((s + (Math.random() - 0.5) * 0.3) * 10) / 10)));
      setTemp((t) => Math.round((t + (Math.random() - 0.5) * 0.02) * 10) / 10);
      // keep bpm mostly stable but occasionally vary
      setBpm((old) => {
        const delta = Math.random() < 0.02 ? (Math.round((Math.random() - 0.5) * 10)) : Math.round((Math.random() - 0.5) * 2);
        const next = Math.max(40, Math.min(140, old + delta));
        return next;
      });
      // update bp string from precomputed series (take latest random index)
      const idx = Math.floor(Math.random() * bpSeries.length);
      setBpLatest(`${bpSeries[idx].sys}/${bpSeries[idx].dia}`);
    }, 1800);
    return () => clearInterval(iv);
  }, [bpSeries]);

  // Chart.js datasets
  const ecgData = {
    labels: ecgPoints.map((_, i) => i),
    datasets: [
      {
        label: "ECG",
        data: ecgPoints,
        borderColor: "#06b6d4", // cyan
        borderWidth: 2,
        pointRadius: 0,
        tension: 0,
      },
    ],
  };

  const bpData = {
    labels: bpSeries.map((_, i) => i),
    datasets: [
      {
        label: "Systolic",
        data: bpSeries.map((p) => p.sys),
        borderColor: "#ef4444",
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
      },
      {
        label: "Diastolic",
        data: bpSeries.map((p) => p.dia),
        borderColor: "#60a5fa",
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.4,
      },
    ],
  };

  // Layout: title centered, two-column grid (left 4/5, right 1/5)
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b0b] to-[#111214] text-gray-100 p-8 font-inter">
      {/* centered title */}
      <header className="max-w-[1400px] mx-auto text-center mb-6">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-wide">Digital Twin of Heart — Patient: Rajveer Patil</h1>
        <div className="text-sm text-gray-400 mt-1">{timeString}</div>
      </header>

      {/* main content container */}
      <div className="max-w-[1400px] mx-auto grid grid-cols-5 gap-6">
        {/* LEFT: wide (4/5) */}
        <div className="col-span-5 md:col-span-4 space-y-6">
          {/* patient details */}
          <div className="bg-[#0f1315] border border-gray-800 rounded-xl p-4 shadow-md">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Patient</div>
                <div className="text-lg font-semibold">Rajveer Patil</div>
                <div className="text-sm text-gray-400 mt-1">Age: 58</div>
                <div className="text-sm text-gray-400">ID: 123456789</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Connected Devices</div>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>ECG Lead II — Active</li>
                  <li>PPG (SpO₂) — Active</li>
                  <li>Temp Sensor — Active</li>
                </ul>
              </div>
            </div>
          </div>

          {/* charts row: two charts side-by-side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#0f1315] border border-gray-800 rounded-xl p-4 shadow-md">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-medium text-gray-200">ECG (Lead II)</h2>
                <div className="text-sm text-gray-400">{bpm} BPM</div>
              </div>
              <div>
                <Line
                  data={ecgData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    elements: { line: { borderWidth: 2 } },
                    scales: {
                      x: { display: false },
                      y: {
                        display: true,
                        min: -1.2,
                        max: 1.2,
                        ticks: { color: "#94a3b8" },
                        grid: { color: "#0f1724" },
                      },
                    },
                  }}
                  height={220}
                />
              </div>
            </div>

            <div className="bg-[#0f1315] border border-gray-800 rounded-xl p-4 shadow-md">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-medium text-gray-200">Blood Pressure Trend</h2>
                <div className="text-sm text-gray-400">Last: {bpLatest}</div>
              </div>
              <div>
                <Line
                  data={bpData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: "#9ca3af" } } },
                    scales: {
                      x: { ticks: { color: "#94a3b8" }, grid: { color: "#0f1724" } },
                      y: { ticks: { color: "#94a3b8" }, grid: { color: "#0f1724" } },
                    },
                  }}
                  height={220}
                />
              </div>
            </div>
          </div>

          {/* large metrics row: big numbers with label below */}
          <div className="bg-[#0f1315] border border-gray-800 rounded-xl p-4 shadow-md">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-4xl md:text-5xl font-extrabold text-red-400">{bpm}</div>
                <div className="mt-1 text-sm text-gray-400">HEART RATE (BPM)</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-extrabold text-emerald-400">{bpLatest.split("/")[0]}</div>
                <div className="mt-1 text-sm text-gray-400">SYSTOLIC (mmHg)</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-extrabold text-yellow-400">{temp}</div>
                <div className="mt-1 text-sm text-gray-400">TEMPERATURE (°C)</div>
              </div>
              <div>
                <div className="text-4xl md:text-5xl font-extrabold text-sky-400">{spo2}</div>
                <div className="mt-1 text-sm text-gray-400">SpO₂ (%)</div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: narrow (1/5) */}
        <aside className="col-span-5 md:col-span-1 flex flex-col space-y-4">
          {/* 3D heart simulation */}
          <div className="h-[36vh] bg-[#0f1315] border border-gray-800 rounded-xl p-4 flex flex-col items-center justify-center shadow-md">
            <div className="text-sm text-gray-400 mb-2">3D Twin (Live)</div>

            {/* 3D Heart Model */}
            <div className="w-[140px] h-[140px]">
              <Heart3D bpm={bpm} />
            </div>

            <div className="mt-3 text-sm text-gray-300">Beating — Live (simulated)</div>
          </div>

          {/* alerts */}
          <div className="flex-1 bg-[#0f1315] border border-gray-800 rounded-xl p-4 shadow-md overflow-auto">
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Alerts</div>
            <div className="space-y-3">
              {/* Example alerts - you can populate dynamically */}
              <div className="p-2 rounded bg-[#2b0b0b] border border-[#4c1515]">
                <div className="text-sm text-red-300 font-semibold">Irregular Heartbeat Detected</div>
                <div className="text-xs text-gray-400">Detected at {timeString}</div>
              </div>

              <div className="p-2 rounded bg-[#1a1720] border border-[#2e2a36]">
                <div className="text-sm text-amber-300 font-semibold">High Blood Pressure</div>
                <div className="text-xs text-gray-400">Systolic exceeded threshold: {bpLatest.split("/")[0]} mmHg</div>
              </div>

              <div className="text-sm text-gray-400">No further active alerts.</div>
            </div>
          </div>
        </aside>
      </div>

      {/* Screen 2 - 3 Column Layout */}
      <div className="min-h-screen pt-20">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid grid-cols-10 gap-6 h-screen">
            {/* Left Column - Input Parameters (30%) */}
            <div className="col-span-3 space-y-6">
              <div className="bg-[#0f1315] border border-gray-800 rounded-xl p-6 shadow-md">
                <h3 className="text-lg font-semibold text-gray-200 mb-4">Heart Parameters</h3>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">Heart Rate (BPM)</label>
                    <input 
                      type="range" 
                      min="40" 
                      max="180" 
                      value={bpm} 
                      onChange={e => setBpm(Number(e.target.value))} 
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="text-right text-sm text-blue-400 font-semibold">{bpm}</div>
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">Blood Pressure</label>
                    <input 
                      type="text" 
                      value={bpLatest} 
                      onChange={e => setBpLatest(e.target.value)}
                      className="w-full bg-gray-700 text-gray-100 px-3 py-2 rounded-lg"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">Temperature (°C)</label>
                    <input 
                      type="number" 
                      value={temp} 
                      onChange={e => setTemp(Number(e.target.value))}
                      step="0.1"
                      className="w-full bg-gray-700 text-gray-100 px-3 py-2 rounded-lg"
                    />
                  </div>
                  
                  <div>
                    <label className="text-sm text-gray-400 mb-2 block">SpO₂ (%)</label>
                    <input 
                      type="number" 
                      value={Math.round(spo2)} 
                      onChange={e => setSpo2(Number(e.target.value))}
                      min="80"
                      max="100"
                      className="w-full bg-gray-700 text-gray-100 px-3 py-2 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Center Column - Large 3D Heart (40%) */}
            <div className="col-span-4 flex items-center justify-center">
              <div className="w-full h-[80vh] bg-[#0f1315] border border-gray-800 rounded-xl p-6 shadow-md flex flex-col items-center justify-center">
                <h2 className="text-2xl font-bold text-gray-200 mb-4">Digital Heart Twin</h2>
                <div className="w-full h-full">
                  <Heart3D bpm={bpm} size="large" />
                </div>
                <div className="text-lg text-gray-300 mt-4">Live Simulation - {bpm} BPM</div>
              </div>
            </div>

            {/* Right Column - Analysis Data (30%) */}
            <div className="col-span-3 space-y-6">
              <div className="bg-[#0f1315] border border-gray-800 rounded-xl p-6 shadow-md">
                <h3 className="text-lg font-semibold text-gray-200 mb-4">Cardiac Analysis</h3>
                
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Stroke Volume:</span>
                    <span className="text-emerald-400 font-semibold">{Math.round(70 + (bpm-72)*0.5)} mL</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-400">Cardiac Output:</span>
                    <span className="text-emerald-400 font-semibold">{((70 + (bpm-72)*0.5) * bpm / 1000).toFixed(1)} L/min</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-400">Ejection Fraction:</span>
                    <span className="text-emerald-400 font-semibold">{Math.max(50, Math.min(70, 60 + (72-bpm)*0.2)).toFixed(0)}%</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-400">Mean Arterial Pressure:</span>
                    <span className="text-emerald-400 font-semibold">{Math.round(80 + (bpm-72)*0.3)} mmHg</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-400">Oxygen Saturation:</span>
                    <span className={`font-semibold ${spo2 < 92 ? 'text-red-400' : 'text-emerald-400'}`}>{Math.round(spo2)}%</span>
                  </div>
                </div>
              </div>
              
              <div className="bg-[#0f1315] border border-gray-800 rounded-xl p-6 shadow-md">
                <h3 className="text-lg font-semibold text-gray-200 mb-4">Heart Status</h3>
                <div className="space-y-3">
                  <div className={`p-3 rounded-lg ${bpm > 100 ? 'bg-red-900/30 border border-red-700/50' : 'bg-green-900/30 border border-green-700/50'}`}>
                    <div className={`text-sm font-semibold ${bpm > 100 ? 'text-red-300' : 'text-green-300'}`}>
                      {bpm > 100 ? 'Tachycardia' : 'Normal Rhythm'}
                    </div>
                  </div>
                  
                  <div className={`p-3 rounded-lg ${spo2 < 92 ? 'bg-red-900/30 border border-red-700/50' : 'bg-green-900/30 border border-green-700/50'}`}>
                    <div className={`text-sm font-semibold ${spo2 < 92 ? 'text-red-300' : 'text-green-300'}`}>
                      {spo2 < 92 ? 'Low Oxygen' : 'Normal Oxygen'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
