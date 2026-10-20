import React, { useState } from 'react'
import { Info, Tile } from './ui'
import { fmt, label, PATCH_INPUTS, RECORD_INPUTS, inputValue } from './format'

function Waveform({ data, title, info, startS, fs, beats }) {
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
      <div className="lbl">{title} <Info text={info} /></div>
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

function RangeRow({ p, def, stats }) {
  const [k, name, unit, dec, mul = 1] = def
  const s = stats[k], v = inputValue(p, k), ok = v != null && v >= 0
  const sc = (x) => (s.max === s.min ? 50 : ((x - s.min) / (s.max - s.min)) * 100)
  return (
    <div className="rr">
      <div className="rr-l">{name}</div>
      <div className="rr-t">
        <div className="rr-line" />
        <div className="rr-iqr" style={{ left: `${sc(s.q1)}%`, width: `${sc(s.q3) - sc(s.q1)}%` }}
             data-tip={`Middle half of recordings: ${fmt(s.q1 * mul, dec)} to ${fmt(s.q3 * mul, dec)} ${unit}. Full range ${fmt(s.min * mul, dec)} to ${fmt(s.max * mul, dec)}.`} />
        <div className="rr-med" style={{ left: `${sc(s.med)}%` }} />
        {ok && <div className="rr-dot" style={{ left: `${sc(v)}%` }} data-tip={`This patient: ${fmt(v * mul, dec)} ${unit}. Median of recordings: ${fmt(s.med * mul, dec)}.`} />}
      </div>
      <div className="rr-v">{ok ? `${fmt(v * mul, dec)} ${unit}` : 'missing'}</div>
    </div>
  )
}

export default function SignalsTab({ p, stats, n }) {
  const f = p.features, s = p.signals
  return (
    <div className="stack">
      <section className="panel">
        <div className="ph">
          <h3>Chest patch recording</h3>
          <span className="sub">{label(p)} · 8 s shown <Info text={`8 s of the ${fmt(s.slice_s, 0)} s slice the model used. The 3D heart replays all ${s.beats_s.length} beats detected in the slice. Hover a trace to read the time.`} /></span>
        </div>
        <div className="stack" style={{ gap: 18 }}>
          <Waveform data={s.ecg} title="Patch ECG" info="Heart electrical signal, scaled. Ticks mark detected beats." startS={s.clip_start_s} fs={s.clip_fs} beats={s.beats_s} />
          <Waveform data={s.scg} title="SCG (chest vibration, front-to-back)" info="Heart movement felt at the chest, scaled." startS={s.clip_start_s} fs={s.clip_fs} beats={s.beats_s} />
        </div>
      </section>
      <section className="panel">
        <div className="ph"><h3>Measured from the patch</h3><Info text="Features the model reads. Hospital channels in the same recording (catheter pressure, hospital ECG leads, finger pulse) are never model inputs." /></div>
        <div className="grid-auto">
          <Tile label="Heart rate" value={fmt(f.hr_bpm, 0)} unit="bpm" />
          <Tile label="RMSSD (beat-to-beat change)" value={fmt(f.rmssd_ms, 0)} unit="ms" />
          <Tile label="Irregular beats" value={fmt(f.irregular_share != null ? f.irregular_share * 100 : null, 1)} unit="%" />
          <Tile label="Breathing rate" value={fmt(f.breath_rate_per_min, 0)} unit="/min" />
          <Tile label="Body tilt" value={fmt(f.tilt_deg, 0)} unit="°" info="90° = lying flat." />
          <Tile label="Skin temperature" value={fmt(f.skin_temp_c, 1)} unit="°C" />
          <Tile label="SCG amplitude" value={fmt(f.scg_amp_mg, 1)} unit="mg" />
          <Tile label="SCG peak gap" value={fmt(f.scg_t2_minus_t1_ms, 0)} unit="ms" />
        </div>
      </section>
      <section className="panel">
        <div className="ph"><h3>What went into this estimate</h3><Info text={`This patient compared with all ${n} recordings. A comparison of inputs, not the model's internal weights; selected inputs shown (the model uses 20). Dot: this patient; grey bar: middle half; tick: median.`} /></div>
        <div className="rr-wrap">
          <div className="rr-h">Chest patch</div>
          {PATCH_INPUTS.map((d) => <RangeRow key={d[0]} p={p} def={d} stats={stats} />)}
          <div className="rr-h">Patient record</div>
          {RECORD_INPUTS.map((d) => <RangeRow key={d[0]} p={p} def={d} stats={stats} />)}
        </div>
      </section>
    </div>
  )
}
