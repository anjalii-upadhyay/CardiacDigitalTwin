import React, { useState } from 'react'
import { Ev, Tile } from './ui'
import { fmt, label } from './format'

function Waveform({ data, title, note, startS, fs, beats }) {
  const [hover, setHover] = useState(null)
  const n = data.length, durS = n / fs
  const pts = data.map((v, i) => `${((i / (n - 1)) * 800).toFixed(1)},${(60 - (v / 127) * 54).toFixed(1)}`).join(' ')
  const marks = (beats || []).map((t) => t - startS).filter((t) => t >= 0 && t <= durS)
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    setHover(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)))
  }
  return (
    <div className="wave-block">
      <div className="lbl">{title} <Ev k="R" /> <span className="sub" style={{ fontWeight: 400 }}>{note}</span></div>
      <div className="wave" onPointerMove={move} onPointerLeave={() => setHover(null)}>
        <svg viewBox="0 0 800 120" preserveAspectRatio="none" role="img" aria-label={`${title}, ${durS} seconds`}>
          {[1, 2, 3, 4, 5, 6, 7].map((s) => <line key={s} className="grid" x1={s * 100} x2={s * 100} y1="0" y2="120" />)}
          {marks.map((t, i) => <line key={i} className="beatmark" x1={(t / durS) * 800} x2={(t / durS) * 800} y1="0" y2="10" />)}
          <path d={`M${pts}`} />
        </svg>
        {hover != null && <>
          <div className="xh" style={{ left: `${hover * 100}%` }} />
          <div className="xl" style={{ left: `${hover * 100}%`, transform: hover > 0.85 ? 'translateX(calc(-100% - 6px))' : undefined }}>
            {(startS + hover * durS).toFixed(2)} s
          </div>
        </>}
      </div>
      <div className="wticks">{[0, 2, 4, 6, 8].map((t) => <span key={t} style={{ left: `${(t / 8) * 100}%` }}>{startS + t}{t === 8 ? ' s' : ''}</span>)}</div>
    </div>
  )
}

export default function SignalsTab({ p }) {
  const f = p.features, s = p.signals
  return (
    <div className="stack">
      <section className="panel">
        <div className="ph"><h3>Chest patch recording</h3><span className="sub">{label(p)} · 8 s of the {fmt(s.slice_s, 0)} s slice the model used</span></div>
        <div className="stack" style={{ gap: 18 }}>
          <Waveform data={s.ecg} title="Patch ECG" note="heart electrical signal, scaled · ticks mark detected beats" startS={s.clip_start_s} fs={s.clip_fs} beats={s.beats_s} />
          <Waveform data={s.scg} title="Chest vibration, front-to-back (SCG)" note="heart movement felt at the chest, scaled" startS={s.clip_start_s} fs={s.clip_fs} beats={s.beats_s} />
        </div>
        <p className="small">The 3D heart replays the {s.beats_s.length} beats detected in this slice, so it beats exactly when this patient's heart did. Hover to read the time.</p>
      </section>
      <section className="panel">
        <div className="ph"><h3>Measured from the patch</h3><span className="sub">features the model reads <Ev k="R" /></span></div>
        <div className="grid-auto">
          <Tile label="Heart rate" value={fmt(f.hr_bpm, 0)} unit="bpm" />
          <Tile label="Beat-to-beat change" value={fmt(f.rmssd_ms, 0)} unit="ms" />
          <Tile label="Irregular beats" value={fmt(f.irregular_share != null ? f.irregular_share * 100 : null, 1)} unit="%" />
          <Tile label="Breathing rate" value={fmt(f.breath_rate_per_min, 0)} unit="/min" />
          <Tile label="Body tilt" value={fmt(f.tilt_deg, 0)} unit="°" />
          <Tile label="Skin temperature" value={fmt(f.skin_temp_c, 1)} unit="°C" />
          <Tile label="Vibration strength" value={fmt(f.scg_amp_mg, 1)} unit="mg" />
          <Tile label="Gap between vibration peaks" value={fmt(f.scg_t2_minus_t1_ms, 0)} unit="ms" />
        </div>
        <p className="small">Hospital channels in the same recording (catheter pressure, hospital ECG leads, finger pulse) are never model inputs.</p>
      </section>
    </div>
  )
}
