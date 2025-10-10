// import React, { useEffect, useState, useRef } from 'react'
// import { Line } from 'react-chartjs-2'
// import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js'

// ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

// const generateECGPoint = (t, bpm) => {
//   const f = bpm / 60
//   const base = Math.sin(2 * Math.PI * f * t) * 0.5
//   const spike = (Math.sin(2 * Math.PI * f * t * 30) > 0.9999) ? 1.5 : 0
//   return base + spike
// }

// export default function App() {
//   const [bpm, setBpm] = useState(72)
//   const [bp, setBp] = useState('120/80')
//   const [spo2, setSpo2] = useState(98)
//   const [temp, setTemp] = useState(36.8)
//   const [time, setTime] = useState(0)

//   const [ecgData, setEcgData] = useState(Array.from({length: 200}, () => 0))
//   const [hrHistory, setHrHistory] = useState(Array.from({length: 30}, () => bpm))
//   const intervalRef = useRef(null)

//   useEffect(() => {
//     intervalRef.current = setInterval(() => {
//       setTime(t => {
//         const nt = t + 0.02

//         // ECG data
//         setEcgData(prev => {
//           const next = prev.slice(1)
//           next.push(generateECGPoint(nt, bpm))
//           return next
//         })

//         // HR history
//         setHrHistory(prev => {
//           const sliced = prev.length >= 30 ? prev.slice(1) : prev
//           return [...sliced, bpm]
//         })

//         // small random fluctuation
//         setSpo2(s => Math.max(85, Math.min(100, s + (Math.random()-0.5)*0.1)))
//         setTemp(t0 => Math.round((t0 + (Math.random()-0.5)*0.01)*10)/10)

//         return nt
//       })
//     }, 50)

//     return () => clearInterval(intervalRef.current)
//   }, [bpm])

//   // Alerts
//   const alerts = []
//   if (bpm > 100) alerts.push({level: 'warning', text: `Tachycardia detected: ${bpm} BPM`})
//   if (spo2 < 92) alerts.push({level: 'critical', text: `Low SpO₂: ${Math.round(spo2)}%`})

//   const ecgChart = {
//     labels: ecgData.map((_, i) => i),
//     datasets: [
//       {
//         label: 'ECG (simulated)',
//         data: ecgData,
//         borderWidth: 1,
//         pointRadius: 0,
//       }
//     ]
//   }

//   const hrChart = {
//     labels: hrHistory.map((_, i) => i),
//     datasets: [
//       {
//         label: 'Heart Rate (BPM)',
//         data: hrHistory,
//         borderWidth: 2,
//         tension: 0.3,
//       }
//     ]
//   }

//   return (
//     <div className="min-h-screen bg-gray-800 text-gray-100 p-6 font-inter">
//       {/* Header */}
//       <header className="text-center mb-8">
//         <h1 className="text-3xl font-bold text-gray-100 mb-2">Digital Twin of Heart — Patient: John Doe</h1>
//         <p className="text-sm text-gray-400">Last updated: {new Date().toLocaleString()}</p>
//         <div className="flex justify-center gap-4 mt-4">
//           <button className="bg-blue-600 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/25 px-4 py-2 rounded-lg transition-all duration-300">
//             Export Report
//           </button>
//           <button className="bg-gray-700 hover:bg-gray-600 hover:shadow-lg px-4 py-2 rounded-lg transition-all duration-300">
//             Settings
//           </button>
//         </div>
//       </header>

//       <main className="space-y-8">
//         {/* Vital Stats Grid */}
//         <section className="grid grid-cols-2 gap-6 max-w-4xl mx-auto">
//           <div className="bg-neutral-800 shadow-md rounded-xl p-4 text-center hover:scale-105 transition transform">
//             <div className="text-sm text-gray-400 mb-2">Heart Rate</div>
//             <div className={`text-3xl font-bold ${bpm>100? 'text-red-400':'text-red-400'}`}>{bpm} BPM</div>
//           </div>
//           <div className="bg-neutral-800 shadow-md rounded-xl p-4 text-center hover:scale-105 transition transform">
//             <div className="text-sm text-gray-400 mb-2">Blood Pressure</div>
//             <div className="text-3xl font-bold text-green-400">{bp}</div>
//           </div>
//           <div className="bg-neutral-800 shadow-md rounded-xl p-4 text-center hover:scale-105 transition transform">
//             <div className="text-sm text-gray-400 mb-2">SpO₂</div>
//             <div className={`text-3xl font-bold ${spo2<92? 'text-red-400':'text-blue-400'}`}>{Math.round(spo2)}%</div>
//           </div>
//           <div className="bg-neutral-800 shadow-md rounded-xl p-4 text-center hover:scale-105 transition transform">
//             <div className="text-sm text-gray-400 mb-2">Temperature</div>
//             <div className="text-3xl font-bold text-yellow-400">{temp}°C</div>
//           </div>
//         </section>

//         {/* Charts and Alerts Grid */}
//         <section className="grid grid-cols-3 gap-6">
//           {/* ECG Chart */}
//           <div className="bg-neutral-800 shadow-md rounded-xl p-6">
//             <h3 className="text-lg font-semibold text-gray-200 mb-4">ECG (live)</h3>
//             <Line data={ecgChart} options={{responsive:true, animation:false, scales:{x:{display:false}}}} />
//           </div>

//           {/* Heart Rate Chart */}
//           <div className="bg-neutral-800 shadow-md rounded-xl p-6">
//             <h3 className="text-lg font-semibold text-gray-200 mb-4">Heart Rate (30s)</h3>
//             <Line data={hrChart} options={{responsive:true, animation:false}} />
//           </div>

//           {/* Live Heart Preview + Alerts */}
//           <div className="space-y-6">
//             {/* Heart Preview */}
//             <div className="bg-neutral-800 shadow-md rounded-xl p-6 text-center">
//               <h3 className="text-lg font-semibold text-gray-200 mb-2">Live Heart Preview</h3>
//               <p className="text-xs text-gray-400 mb-4">Click to open full simulation</p>
//               <div className="flex justify-center">
//                 <svg viewBox="0 0 32 29.6" width="80" height="80" className="animate-pulse text-red-400">
//                   <path fill="currentColor" d="M23.6,0c-2.8,0-5.1,1.6-6.6,3.9C14.5,1.6,12.2,0,9.4,0C4.2,0,0,4.2,0,9.4c0,11.2,16,20.2,16,20.2 s16-9,16-20.2C32,4.2,27.8,0,23.6,0z" />
//                 </svg>
//               </div>
//             </div>

//             {/* Alerts */}
//             <div className="bg-neutral-800 shadow-md rounded-xl p-6">
//               <h3 className="text-lg font-semibold text-gray-200 mb-4">Alerts</h3>
//               <div className="space-y-3">
//                 {alerts.length === 0 ? (
//                   <div className="text-sm text-gray-400 p-3 bg-green-900/20 rounded-lg border border-green-700/30">
//                     ✓ No active alerts
//                   </div>
//                 ) : (
//                   alerts.map((a, i) => (
//                     <div key={i} className={`p-3 rounded-lg border ${
//                       a.level==='critical' 
//                         ? 'bg-red-900/30 text-red-300 border-red-700/50' 
//                         : 'bg-yellow-900/30 text-yellow-300 border-yellow-700/50'
//                     }`}>
//                       {a.text}
//                     </div>
//                   ))
//                 )}
//               </div>
//             </div>

//             {/* Quick Controls */}
//             <div className="bg-neutral-800 shadow-md rounded-xl p-6">
//               <button 
//                 className="w-full bg-blue-600 hover:bg-blue-500 hover:shadow-lg hover:shadow-blue-500/25 py-3 rounded-lg font-semibold mb-4 transition-all duration-300" 
//                 onClick={() => alert('Scroll to simulation (placeholder)')}
//               >
//                 Go to Simulation
//               </button>
//               <div className="text-sm text-gray-400 mb-3">Quick Controls</div>
//               <div className="space-y-2">
//                 <div className="flex items-center justify-between text-sm">
//                   <span className="text-gray-400">BPM:</span>
//                   <span className="text-blue-400 font-semibold">{bpm}</span>
//                 </div>
//                 <input 
//                   type="range" 
//                   min="40" 
//                   max="180" 
//                   value={bpm} 
//                   onChange={e => setBpm(Number(e.target.value))} 
//                   className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
//                 />
//               </div>
//             </div>
//           </div>
//         </section>

//         {/* Scroll CTA */}
//         <div className="flex justify-center mt-8">
//           <button className="bg-transparent border border-gray-600 hover:bg-gray-800 hover:border-gray-500 px-8 py-3 rounded-lg transition-all duration-300">
//             ↓ Scroll / Start Full Simulation
//           </button>
//         </div>
//       </main>
//     </div>
//   )
// }

// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
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
        <h1 className="text-3xl md:text-4xl font-semibold tracking-wide">Digital Twin of Heart — Patient: John Doe</h1>
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
                <div className="text-lg font-semibold">John Doe</div>
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
    </div>
  );
}
