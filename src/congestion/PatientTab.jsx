import React from 'react'
import { Ev, Info, StatePill, Tile, PressureScale } from './ui'
import HeartView from './HeartView'
import { ROMAN, fmt, signed, label, rangeText, PATCH_INPUTS, RECORD_INPUTS, inputValue } from './format'

function RecordCard({ p }) {
  const r = p.record
  return (
    <section className="panel">
      <div className="id-top">
        <div><div className="eyebrow">SCG-RHC recording {p.id}</div><h2>{label(p)}</h2></div>
        <div className="pills"><StatePill state={p.congestion.state} /><StatePill state={p.perfusion.state} kind="perfusion" /></div>
      </div>
      <dl className="facts">
        <div><dt>Age</dt><dd>{r.age} y</dd></div>
        <div><dt>Sex</dt><dd>{r.sex}</dd></div>
        <div><dt>Body-mass index</dt><dd>{fmt(r.bmi)}</dd></div>
        <div><dt>NYHA class</dt><dd>{ROMAN[r.nyha] || '–'}</dd></div>
        <div><dt>Setting</dt><dd>{r.outpatient ? 'Outpatient' : 'Inpatient'}</dd></div>
        <div><dt>Blood pressure</dt><dd>{r.sbp ? `${r.sbp}/${r.dbp}` : '–'}</dd></div>
      </dl>
      <div className="hist">
        <div className="lbl">History from the patient record <Ev k="R" /></div>
        <p className="mono">{r.history || 'No history recorded.'}</p>
        {r.history_tags.length > 0 && <div className="flags">{r.history_tags.map((t) => <span key={t} className="flag">{t}</span>)}</div>}
        <div className="small" style={{ margin: 0 }}>Plain-language tags are parsed from the history text above.</div>
      </div>
      <div className="pending">Lab results and medicine list: <b>decision pending</b> (real fields only, or labelled synthetic values <Ev k="S" /> that are never model inputs).</div>
    </section>
  )
}

const chanceText = (c) => `${Math.round(c.chance * 100)}%`

function StateBanner({ p, cutoff, acked, onAck, onSimulate }) {
  const c = p.congestion
  const range = rangeText(c.range_mmHg)
  const cov = Math.round(c.range_coverage * 100)
  if (c.state === 'congested' && !acked) {
    return (
      <div className="alert" role="alert">
        <span className="big-ic" aria-hidden="true">▲</span>
        <div className="alert-text"><b>Congestion alert</b> <Ev k="R" /> <Ev k="G" /><br />
          Estimated wedge pressure is <b>{fmt(c.estimate_mmHg)} mmHg</b>. Its whole {cov}% range ({range}) is above the {cutoff} mmHg cut-off.</div>
        <div className="alert-act">
          <button className="btn" onClick={onAck}>Acknowledge</button>
          <button className="btn ghost" onClick={onSimulate}>Try a medicine change</button>
        </div>
      </div>
    )
  }
  if (c.state === 'congested') {
    return <div className="alert ack"><span className="big-ic" aria-hidden="true">✓</span><div className="alert-text"><b>Alert acknowledged.</b> The estimate's whole range stays above {cutoff} mmHg.</div></div>
  }
  if (c.state === 'uncertain') {
    const side = c.estimate_mmHg > cutoff ? 'above' : 'at or below'
    return (
      <div className="alert unc">
        <span className="big-ic" aria-hidden="true">◐</span>
        <div className="alert-text"><b>No alert: the twin cannot call this one.</b> The estimate ({fmt(c.estimate_mmHg)} mmHg) is {side} the {cutoff} mmHg cut-off <Ev k="G" />, but its {cov}% range ({range}) crosses it. The chance of congestion is <b>{chanceText(c)}</b>, so it leans {c.lean === 'congested' ? 'congested' : 'not congested'}. Treatment suggestions are held back until the call is clear.</div>
      </div>
    )
  }
  return <div className="alert calm"><span className="big-ic" aria-hidden="true">●</span><div className="alert-text"><b>No alert.</b> The estimate's whole {cov}% range ({range}) is at or below {cutoff} mmHg <Ev k="G" />.</div></div>
}

function CongestionCard({ p, cutoff, ui }) {
  const c = p.congestion, m = p.measured, err = p.estimate.error_vs_catheter
  const cov = Math.round(c.range_coverage * 100)
  return (
    <section className="panel">
      <div className="ph"><h3>Lung back-pressure</h3><span className="sub">wedge pressure (PCWP), mmHg</span></div>
      <div className="dual">
        <div><div className="lbl">Estimated from chest patch <Ev k="R" /> <Info text={ui.estimate_info} /></div>
          <div className="bignum">{fmt(c.estimate_mmHg)}<span>mmHg</span></div>
          <div className="sub">{cov}% range {rangeText(c.range_mmHg)}</div></div>
        <div><div className="lbl">Chance of congestion <Ev k="R" /> <Info text={ui.percentage_info} /></div>
          <div className="bignum">{chanceText(c)}</div>
          <div className="sub">{ui.congestion_definition}</div></div>
        <div><div className="lbl">Catheter measured <Ev k="R" /></div><div className="bignum m">{fmt(m.wedge, 0)}<span>mmHg</span></div>
          <div className="sub">For checking. Not available at home.</div></div>
      </div>
      <div className="offby">
        For this patient the estimate is <b>off by {signed(err)} mmHg</b> ({err > 0 ? 'higher' : err < 0 ? 'lower' : 'same as'} than the catheter).
      </div>
      <PressureScale cutoff={cutoff}
        bands={[{ cls: 'err', lo: Math.max(0, c.range_mmHg[0]), hi: c.range_mmHg[1], tip: `${cov}% range: ${rangeText(c.range_mmHg)}` }]}
        markers={[{ cls: 'meas', v: m.wedge, tip: `Catheter measured: ${fmt(m.wedge, 0)} mmHg` },
                  { cls: 'est', v: c.estimate_mmHg, tip: `Patch estimate: ${fmt(c.estimate_mmHg)} mmHg` }]} />
      <div className="legend">
        <span><i className="lg est" />Patch estimate</span><span><i className="lg meas" />Catheter value</span>
        <span><i className="lg err" />{cov}% range</span><span>Cut-off {cutoff} <Ev k="G" /></span>
      </div>
      <p className="small">The estimate comes from a model that never saw this patient. The range is built from the real errors on the other patients (coverage still open, P18).</p>
    </section>
  )
}

function PerfusionAndMeasured({ p, ciLow, ui }) {
  const pf = p.perfusion, m = p.measured
  return (
    <section className="panel">
      <div className="ph"><h3>Pumping and other heart numbers</h3><span className="sub">catheter measured only <Ev k="R" /></span></div>
      <div className="perf">
        <StatePill state={pf.state} kind="perfusion" />
        <span>{pf.state === 'unknown'
          ? `Cannot be worked out: ${pf.reason}.`
          : <>Cardiac index <b>{fmt(pf.cardiac_index, 2)} L/min/m²</b> ({pf.source}). Below {ciLow} counts as low <Ev k="G" />.</>}</span>
        <Info text={ui.perfusion_info} />
      </div>
      <div className="grid-auto">
        <Tile label="Right-atrial pressure" value={fmt(m.ra, 0)} unit="mmHg" note="back-pressure toward the body" />
        <Tile label="Lung-artery pressure (mean)" value={fmt(m.pa, 0)} unit="mmHg" note="pressure in the lung artery" />
        <Tile label="Stroke volume" value={fmt(m.sv, 0)} unit="mL" note="blood pumped per beat" />
        <Tile label="Cardiac output" value={fmt(m.co, 1)} unit="L/min" note="blood pumped per minute" />
      </div>
      <p className="small">The model could not estimate these better than a plain average, so they come only from the catheter and never drive suggestions.</p>
    </section>
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

function InputsPanel({ p, stats, n }) {
  return (
    <section className="panel">
      <div className="ph"><h3>What went into this estimate</h3><span className="sub">this patient compared with all {n} recordings</span></div>
      <div className="legend" style={{ margin: '0 0 8px' }}>
        <span><i className="lg est" />This patient</span><span><i className="lg iqr" />Middle half of recordings</span><span>Line: full range · tick: median</span>
      </div>
      <div className="rr-wrap">
        <div className="rr-h">Chest patch <Ev k="R" /></div>
        {PATCH_INPUTS.map((d) => <RangeRow key={d[0]} p={p} def={d} stats={stats} />)}
        <div className="rr-h">Patient record <Ev k="R" /></div>
        {RECORD_INPUTS.map((d) => <RangeRow key={d[0]} p={p} def={d} stats={stats} />)}
      </div>
      <p className="small">A comparison of inputs, not a breakdown of the model's internal weights. Selected inputs shown; the model uses 20.</p>
    </section>
  )
}

export default function PatientTab({ p, meta, stats, n, acked, onAck, onSimulate }) {
  const cutoff = meta.cutoffs.wedge_congestion
  return (
    <div className="stack">
      <RecordCard p={p} />
      <StateBanner p={p} cutoff={cutoff} acked={acked} onAck={onAck} onSimulate={onSimulate} />
      <div className="grid2">
        <CongestionCard p={p} cutoff={cutoff} ui={meta.ui_text} />
        <section className="panel">
          <div className="ph"><h3>Heart and lungs</h3><span className="sub">digital twin view</span></div>
          <HeartView patient={p} wedge={p.estimate.wedge} state={p.congestion.state} />
        </section>
      </div>
      <PerfusionAndMeasured p={p} ciLow={meta.cutoffs.cardiac_index_low} ui={meta.ui_text} />
      <InputsPanel p={p} stats={stats} n={n} />
    </div>
  )
}
