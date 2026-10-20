import React from 'react'
import { CONGESTION, PERFUSION } from './format'

// Small "i" that explains a number. Uses the shared tooltip (data-tip); shows on hover and on keyboard focus.
export function Info({ text }) {
  return <span className="info" tabIndex={0} role="img" aria-label={text} data-tip={text}>i</span>
}

export function StatePill({ state, kind = 'congestion' }) {
  const s = (kind === 'congestion' ? CONGESTION : PERFUSION)[state]
  return <span className={`st ${s.key}`}><span className="dot" aria-hidden="true" />{s.label}</span>
}

export function Tile({ label, value, unit, info }) {
  return (
    <div className="tile">
      <div className="t-l">{label}{info && <Info text={info} />}</div>
      <div className="t-v">{value}{unit && <span>{unit}</span>}</div>
    </div>
  )
}

const MAXV = 40
const pct = (v) => Math.max(0, Math.min(100, (v / MAXV) * 100))

// Wedge-pressure scale: zones split at the exported cut-off, optional range bands and markers.
export function PressureScale({ cutoff, bands = [], markers = [] }) {
  return (
    <div className="scale" role="img" aria-label={`Wedge pressure scale, cut-off ${cutoff} mmHg`}>
      <div className="scale-cuts"><span style={{ left: `${pct(cutoff)}%` }}>{cutoff} cut-off</span></div>
      <div className="scale-track">
        <div className="b good" style={{ left: 0, width: `${pct(cutoff)}%` }} />
        <div className="b crit" style={{ left: `${pct(cutoff)}%`, width: `${100 - pct(cutoff)}%` }} />
        <div className="cut" style={{ left: `${pct(cutoff)}%` }} />
        {bands.map((b, i) => (
          <div key={i} className={b.cls} data-tip={b.tip}
               style={{ left: `${pct(b.lo)}%`, width: `${pct(b.hi) - pct(b.lo)}%` }} />
        ))}
        {markers.filter((m) => m.v != null).map((m, i) => (
          <div key={i} className={`mk ${m.cls}`} data-tip={m.tip} style={{ left: `${pct(m.v)}%` }} />
        ))}
      </div>
      <div className="scale-ticks">
        {[0, 10, 20, 30, 40].map((t) => <span key={t} style={{ left: `${pct(t)}%` }}>{t === 40 ? '40 mmHg' : t}</span>)}
      </div>
    </div>
  )
}
