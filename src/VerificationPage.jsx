// VerificationPage.jsx
// Scientific verification dashboard — validates every physiological parameter
// against its formula, normal range, and data source.
// Updates live from WebSocket packets. No backend changes required.
//
// WHY VALUES WERE SHIMMERING:
//   The WebSocket fires at 125 Hz. Every packet called setPacket(), triggering
//   a full re-render of all 17 ParamRow components 125×/s. Two compounding issues:
//     1. Numeric strings change character width between frames ("87.3" → "102.45"),
//        causing layout shifts even with font-mono because cells had no fixed width.
//     2. React re-diffing 17 rows × 9 cells × 125/s ≈ 19 000 DOM comparisons/s
//        on the main thread, causing visible frame drops and text shimmer.
//
// STABILIZATION STRATEGY (verification tab only — no other files changed):
//   1. Display throttle at 4 Hz (250 ms): a pendingPacket ref absorbs all 125
//      incoming packets per second; a setInterval flushes one snapshot to React
//      state every 250 ms.
//   2. React.memo on ParamRow: each row only re-renders when the packet snapshot
//      reference changes (every 250 ms), not on every WebSocket message.
//   3. <Num> component: fixed minWidth + font-variant-numeric:tabular-nums ensures
//      all digits occupy equal width, preventing column-width layout shifts entirely.
//
// BLOOD FLOW VERIFICATION:
//   The backend sends dpdt (dP/dt in mmHg/s) in every packet — the exact value
//   it used when computing blood_flow. The frontend formulaFn uses p.dpdt directly,
//   making verification deterministic with <1% error.

import React, { useState, useEffect, useRef, memo } from "react"
import { onMessage, offMessage } from "./websocket"
import {
  PARAMETERS, TYPE, TYPE_COLOR,
  getStatus, STATUS_STYLE,
} from "./verificationData"

// ── Filter options ────────────────────────────────────────────────────────────
const FILTERS = ["All", TYPE.SENSOR, TYPE.CALC, TYPE.MODEL]

// ── Stable numeric cell ───────────────────────────────────────────────────────
// Fixed minWidth prevents column-width shifts when digit count changes.
// tabular-nums makes every digit the same advance width, eliminating sub-pixel
// jitter caused by proportional digit spacing (e.g. "1" vs "8" in most fonts).
function Num({ value, decimals = 2, className = "" }) {
  if (value == null || isNaN(value))
    return (
      <span
        className="text-gray-600"
        style={{ display: "inline-block", minWidth: "5.5ch" }}
      >—</span>
    )
  return (
    <span
      className={className}
      style={{ display: "inline-block", minWidth: "5.5ch", fontVariantNumeric: "tabular-nums" }}
    >
      {parseFloat(value).toFixed(decimals)}
    </span>
  )
}

// ── Tooltip popup ─────────────────────────────────────────────────────────────
function Tooltip({ tooltip }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block ml-1">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(v => !v)}
        className="w-4 h-4 rounded-full bg-gray-700 text-gray-400 text-[10px] font-bold
                   hover:bg-gray-600 hover:text-white transition-colors leading-none
                   flex items-center justify-center"
        aria-label="Info"
      >i</button>
      {open && (
        <div className="absolute z-50 left-6 top-0 w-64 bg-[#1a1f2e] border border-gray-700
                        rounded-lg p-3 shadow-xl text-xs space-y-1.5 pointer-events-none">
          <div><span className="text-blue-400 font-semibold">What: </span>
            <span className="text-gray-300">{tooltip.what}</span></div>
          <div><span className="text-green-400 font-semibold">Why: </span>
            <span className="text-gray-300">{tooltip.why}</span></div>
          {tooltip.note && (
            <div><span className="text-yellow-400 font-semibold">Note: </span>
              <span className="text-gray-400">{tooltip.note}</span></div>
          )}
        </div>
      )}
    </span>
  )
}

// ── Expanded model detail card ────────────────────────────────────────────────
function DetailCard({ detail }) {
  return (
    <div className="mt-2 mx-2 mb-1 p-3 bg-purple-950/30 border border-purple-800/40
                    rounded-lg text-xs text-purple-200 leading-relaxed">
      <span className="text-purple-400 font-semibold mr-1">Model Detail:</span>
      {detail}
    </div>
  )
}

// ── Single parameter row — memoized ──────────────────────────────────────────
// React.memo prevents re-render unless the packet reference changes.
// Combined with the 4 Hz display throttle, each row re-renders ~4×/s instead
// of 125×/s, eliminating the bulk of unnecessary DOM reconciliation work.
const ParamRow = memo(function ParamRow({ param, packet, spo2 }) {
  const [expanded, setExpanded] = useState(false)

  const backendVal = param.backendKey
    ? (packet?.[param.backendKey] ?? null)
    : (param.id === "spo2" ? spo2 : null)

  const formulaVal = packet ? param.formulaFn({ ...packet, spo2 }) : null

  const errorPct = (formulaVal != null && backendVal != null && formulaVal !== 0)
    ? Math.abs((backendVal - formulaVal) / formulaVal * 100)
    : null

  const checkVal = backendVal ?? formulaVal
  const status   = param.range
    ? getStatus(checkVal, param.range.lo, param.range.hi, param.range.warnLo, param.range.warnHi)
    : "unknown"
  const st = STATUS_STYLE[status]
  const tc = TYPE_COLOR[param.type]
  const decimals = (param.id === "rr_interval" || param.id === "cardiac_phase") ? 3 : 2

  return (
    <>
      <tr className={`border-b border-gray-800/60 hover:bg-white/[0.02] transition-colors
                      ${expanded ? "bg-white/[0.03]" : ""}`}>

        {/* Parameter name + tooltip */}
        <td className="py-3 px-3 min-w-[160px]">
          <div className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full shrink-0 ${tc.dot}`} />
            <span className="text-gray-200 text-sm font-medium">{param.name}</span>
            <Tooltip tooltip={param.tooltip} />
            {param.expandable && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="ml-1 text-purple-400 hover:text-purple-300 text-[10px] font-bold
                           border border-purple-800/50 rounded px-1 transition-colors"
              >{expanded ? "▲" : "▼"}</button>
            )}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5 pl-3">{param.unit || "dimensionless"}</div>
        </td>

        {/* Data type badge */}
        <td className="py-3 px-3">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${tc.badge}`}>
            {param.type}
          </span>
        </td>

        {/* Source */}
        <td className="py-3 px-3 text-xs text-gray-400" style={{ overflow: "hidden" }}>
          <span className="block truncate">{param.source}</span>
        </td>

        {/* Formula */}
        <td className="py-3 px-3" style={{ overflow: "hidden" }}>
          <code className="text-[11px] text-cyan-300 bg-cyan-950/30 px-1.5 py-0.5 rounded
                           font-mono leading-relaxed block truncate">
            {param.formula}
          </code>
        </td>

        {/* Backend value — Num gives fixed width, no column shimmer */}
        <td className="py-3 px-3 text-center">
          <Num value={backendVal} decimals={decimals}
               className="text-emerald-400 font-mono font-semibold text-sm" />
        </td>

        {/* Frontend recomputed — Num gives fixed width */}
        <td className="py-3 px-3 text-center">
          <Num value={formulaVal} decimals={decimals}
               className="text-sky-400 font-mono font-semibold text-sm" />
        </td>

        {/* Error % — fixed width prevents column bounce */}
        <td className="py-3 px-3 text-center">
          {errorPct == null
            ? <span className="text-gray-600 text-xs"
                    style={{ display: "inline-block", minWidth: "5ch" }}>—</span>
            : <span
                className={`text-xs font-semibold font-mono ${
                  errorPct < 1 ? "text-green-400" :
                  errorPct < 5 ? "text-yellow-400" : "text-red-400"
                }`}
                style={{ display: "inline-block", minWidth: "5ch", fontVariantNumeric: "tabular-nums" }}
              >{errorPct.toFixed(2)}%</span>
          }
        </td>

        {/* Normal range */}
        <td className="py-3 px-3 text-center">
          <span className="text-gray-400 text-xs">{param.range?.label ?? "—"}</span>
        </td>

        {/* Validation status */}
        <td className="py-3 px-3 text-center">
          <span className={`text-xs font-semibold ${st.cls}`}>{st.label}</span>
        </td>
      </tr>

      {expanded && param.detail && (
        <tr className="bg-purple-950/10">
          <td colSpan={9} className="pb-2 px-2">
            <DetailCard detail={param.detail} />
          </td>
        </tr>
      )}
    </>
  )
})

// ── Summary stats bar ─────────────────────────────────────────────────────────
function SummaryBar({ packet, spo2 }) {
  const counts = { normal: 0, borderline: 0, abnormal: 0, unknown: 0 }
  PARAMETERS.forEach(p => {
    const val = p.backendKey ? packet?.[p.backendKey] : (p.id === "spo2" ? spo2 : null)
    const s   = p.range ? getStatus(val, p.range.lo, p.range.hi, p.range.warnLo, p.range.warnHi) : "unknown"
    counts[s]++
  })
  return (
    <div className="flex items-center gap-4 text-xs">
      <span className="text-green-400 font-semibold">✅ {counts.normal} Normal</span>
      <span className="text-yellow-400 font-semibold">⚠ {counts.borderline} Borderline</span>
      <span className="text-red-400 font-semibold">❌ {counts.abnormal} Abnormal</span>
      <span className="text-gray-500">{counts.unknown} N/A</span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function VerificationPage({ spo2 = 99 }) {
  const [packet,  setPacket]  = useState(null)
  const [filter,  setFilter]  = useState("All")
  const [search,  setSearch]  = useState("")
  const [lastUpd, setLastUpd] = useState("—")
  const [pktRate, setPktRate] = useState(0)

  // dP/dt is now sent by the backend in every packet as the 'dpdt' field.
  // No frontend timing estimation needed.
  const pendingPacket = useRef(null)
  const countRef      = useRef(0)
  const displayTimer  = useRef(null)
  const rateTimer     = useRef(null)

  useEffect(() => {
    const handle = (p) => {
      // Park the packet — display timer flushes it at 4 Hz
      pendingPacket.current = p
      countRef.current++
    }
    onMessage(handle)

    // 4 Hz display timer — only calls setPacket when a new packet is waiting.
    // 250 ms is fast enough for smooth visible updates; slow enough to eliminate shimmer.
    displayTimer.current = setInterval(() => {
      if (pendingPacket.current !== null) {
        setPacket(pendingPacket.current)
        setLastUpd(new Date().toLocaleTimeString())
        pendingPacket.current = null
      }
    }, 250)

    // 1 Hz packet rate counter
    rateTimer.current = setInterval(() => {
      setPktRate(countRef.current)
      countRef.current = 0
    }, 1000)

    return () => {
      offMessage(handle)
      clearInterval(displayTimer.current)
      clearInterval(rateTimer.current)
    }
  }, [])

  const visible = PARAMETERS.filter(p => {
    const matchFilter = filter === "All" || p.type === filter
    const matchSearch = search === "" ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.source.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  return (
    <div className="max-w-[1400px] mx-auto pb-12">

      {/* ── Page header ── */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-100 tracking-tight">
          Physiological Parameter Verification
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Live validation of every computed parameter — formula, source, error, and clinical range.
        </p>
      </div>

      {/* ── Live status bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5
                      bg-[#0f1315] border border-gray-800 rounded-xl px-4 py-3">
        <SummaryBar packet={packet} spo2={spo2} />
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>Last packet: <span className="text-gray-300">{lastUpd}</span></span>
          <span>Rate: <span className="text-emerald-400 font-semibold">{pktRate} pkt/s</span></span>
          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
            packet ? "bg-green-900/30 border-green-700/50 text-green-300"
                   : "bg-yellow-900/30 border-yellow-700/50 text-yellow-300"
          }`}>{packet ? "● Live" : "○ Waiting"}</span>
        </div>
      </div>

      {/* ── Filter + search bar ── */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex gap-2">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                filter === f
                  ? "bg-indigo-700/50 border-indigo-500/60 text-indigo-200"
                  : "bg-[#0f1315] border-gray-700 text-gray-400 hover:border-gray-500"
              }`}>
              {f === "All" ? "All Parameters" : f}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search parameter or source…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="ml-auto bg-[#0f1315] border border-gray-700 rounded-lg px-3 py-1.5
                     text-sm text-gray-200 placeholder-gray-600 focus:outline-none
                     focus:border-indigo-500 w-64"
        />
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-4 mb-4 text-[11px]">
        {Object.entries(TYPE_COLOR).map(([type, c]) => (
          <span key={type} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${c.dot}`} />
            <span className="text-gray-400">{type}</span>
          </span>
        ))}
        <span className="ml-4 text-gray-600">|</span>
        <span className="flex items-center gap-1 text-gray-400">
          <span className="text-emerald-400 font-mono text-xs">Green</span> = Backend value
        </span>
        <span className="flex items-center gap-1 text-gray-400">
          <span className="text-sky-400 font-mono text-xs">Blue</span> = Frontend recomputed
        </span>
        <span className="flex items-center gap-1 text-gray-400">
          <span className="text-purple-400 text-xs">▼</span> = Expandable model detail
        </span>
      </div>

      {/* ── Table ── */}
      {/* table-layout:fixed locks every column to its <th> width permanently.      */}
      {/* Without this the browser re-measures all cell content on every render     */}
      {/* and redistributes column widths, causing the visible left-right movement. */}
      <div className="bg-[#0f1315] border border-gray-800 rounded-xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "180px" }} />{/* Parameter        */}
              <col style={{ width: "130px" }} />{/* Data Type        */}
              <col style={{ width: "150px" }} />{/* Source / Method  */}
              <col style={{ width: "220px" }} />{/* Formula          */}
              <col style={{ width: "110px" }} />{/* Backend Value    */}
              <col style={{ width: "120px" }} />{/* Formula Recomp.  */}
              <col style={{ width: "80px"  }} />{/* Error %          */}
              <col style={{ width: "130px" }} />{/* Normal Range     */}
              <col style={{ width: "110px" }} />{/* Status           */}
            </colgroup>
            <thead>
              <tr className="bg-[#0a0d10] border-b border-gray-800">
                {[
                  "Parameter",
                  "Data Type",
                  "Source / Method",
                  "Formula",
                  "Backend Value",
                  "Formula Recomputed",
                  "Error %",
                  "Normal Range",
                  "Status",
                ].map(h => (
                  <th key={h} className="py-3 px-3 text-[11px] font-semibold text-gray-500
                                         uppercase tracking-wider whitespace-nowrap overflow-hidden">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(p => (
                <ParamRow key={p.id} param={p} packet={packet} spo2={spo2} />
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-gray-600 text-sm">
                    No parameters match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Disclaimer ── */}
      <div className="mt-6 p-4 bg-yellow-950/20 border border-yellow-800/30 rounded-xl">
        <div className="flex items-start gap-2">
          <span className="text-yellow-500 text-sm mt-0.5">⚠</span>
          <p className="text-xs text-yellow-200/70 leading-relaxed">
            <span className="font-semibold text-yellow-300">Disclaimer: </span>
            This system provides physiologically realistic simulation values derived from the
            MIMIC-III waveform dataset for educational and research demonstration purposes.
            All derived parameters use established biomedical engineering models (Windkessel,
            Laplace, Hagen-Poiseuille). This system is <span className="font-semibold">not
            intended for clinical diagnosis</span>, patient monitoring, or medical
            decision-making.
          </p>
        </div>
      </div>

      {/* ── How to add new parameters ── */}
      <div className="mt-4 p-4 bg-[#0f1315] border border-gray-800 rounded-xl">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-semibold">
          Developer Note — Adding New Parameters
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          Add a new entry to the <code className="text-cyan-400">PARAMETERS</code> array in{" "}
          <code className="text-cyan-400">src/verificationData.js</code>. Set{" "}
          <code className="text-cyan-400">backendKey</code> to the packet field name (or{" "}
          <code className="text-cyan-400">null</code> for frontend-only values), provide a{" "}
          <code className="text-cyan-400">formulaFn(packet)</code> that recomputes the value
          from raw packet fields, and define the <code className="text-cyan-400">range</code>{" "}
          object. The row will appear automatically.
        </p>
      </div>
    </div>
  )
}
