import React from 'react'
import { Tile } from './ui'
import { STATUS_INFO, fmt, label } from './format'

function Scatter({ patients, selected, cutoff }) {
  const W = 520, H = 400, L = 52, R = 16, T = 16, B = 50, D = 35
  const x = (v) => L + (v / D) * (W - L - R)
  const y = (v) => H - B - (v / D) * (H - T - B)
  const sel = patients.find((p) => p.id === selected)
  const sx = x(sel.measured.wedge), sy = y(sel.estimate.wedge), flip = sx > W - 150
  const tip = (p) => `${label(p)}: catheter ${fmt(p.measured.wedge, 0)}, estimate ${fmt(p.estimate.wedge)} mmHg (off by ${fmt(Math.abs(p.estimate.error_vs_catheter))})`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Patch estimate against catheter wedge pressure for ${patients.length} recordings`}>
      {[0, 10, 20, 30].map((t) => (
        <g key={t}>
          <line className="ax" x1={x(t)} x2={x(t)} y1={y(0)} y2={y(D)} />
          <line className="ax" x1={x(0)} x2={x(D)} y1={y(t)} y2={y(t)} />
          <text className="ax-t" x={x(t)} y={y(0) + 16} textAnchor="middle">{t}</text>
          <text className="ax-t" x={x(0) - 8} y={y(t) + 4} textAnchor="end">{t}</text>
        </g>
      ))}
      <line className="cutl" x1={x(cutoff)} x2={x(cutoff)} y1={y(0)} y2={y(D)} />
      <line className="cutl" x1={x(0)} x2={x(D)} y1={y(cutoff)} y2={y(cutoff)} />
      <text className="ax-t" x={x(cutoff) + 4} y={y(0) - 6}>{cutoff} cut-off</text>
      <line className="idl" x1={x(0)} y1={y(0)} x2={x(D)} y2={y(D)} />
      <text className="ax-t" x={x(31)} y={y(33.2)} textAnchor="end">perfect estimate</text>
      {patients.filter((p) => p.id !== selected).map((p) => (
        <circle key={p.id} className="pt" cx={x(p.measured.wedge)} cy={y(p.estimate.wedge)} r="5.5" data-tip={tip(p)} />
      ))}
      <circle className="pt sel" cx={sx} cy={sy} r="7.5" data-tip={tip(sel)} />
      <text className="pt-lbl" x={sx + (flip ? -12 : 12)} y={sy - 10} textAnchor={flip ? 'end' : 'start'}>{label(sel)}</text>
      <text className="ax-l" x={(L + W - R) / 2} y={H - 12} textAnchor="middle">Catheter measured wedge pressure (mmHg)</text>
      <text className="ax-l" transform={`translate(14 ${(T + H - B) / 2}) rotate(-90)`} textAnchor="middle">Patch estimate (mmHg)</text>
    </svg>
  )
}

function ModelBars({ models, naive }) {
  const max = 7
  const rows = [...models.map((m, i) => ({ ...m, name: i === 0 ? `${m.name} (chosen)` : m.name })), { name: 'Always guess the average', mae: naive, naive: true }]
  return (
    <div className="bars">
      {rows.map((m) => (
        <div className="bar" key={m.name}>
          <div>{m.name}</div>
          <div className="bar-t">
            <div className={`bar-f ${m.naive ? 'naive' : ''}`} style={{ width: `${(m.mae / max) * 100}%` }} data-tip={`${m.name}: ${m.mae.toFixed(2)} mmHg`} />
            <div className="bar-ref" style={{ left: `${(naive / max) * 100}%` }} />
          </div>
          <div className="bar-v">{m.mae.toFixed(2)}</div>
        </div>
      ))}
    </div>
  )
}

export default function EvidenceTab({ patients, selected, meta, rules }) {
  const m = meta.model, e = meta.errors, b = meta.congestion_band, c = meta.cutoffs, n = patients.length
  const cov = Math.round(b.coverage * 100)
  const count = (s) => patients.filter((p) => p.status === s).length
  return (
    <div className="stack">
      <section className="panel">
        <div className="ph"><h3>How good is the estimate?</h3><span className="sub">PCWP, {m.n_recordings} recordings from {m.n_patients} patients</span></div>
        <div className="grid-auto">
          <Tile label="Typical error" value={fmt(m.mae, 2)} unit="mmHg" info={`always-average guess: ${fmt(m.naive_mae, 2)}`} />
          <Tile label="Better than the average guess by" value={fmt(m.gain, 2)} unit="mmHg" info={`95% interval ${fmt(m.gain_ci95[0], 2)} to ${fmt(m.gain_ci95[1], 2)}; ${m.meets_success_rule ? 'passes' : 'fails'} the rule set before testing`} />
          <Tile label="Separates decompensated recordings" value={fmt(m.auroc, 2)} unit="AUROC" info={`0.5 = coin flip; the catheter itself scores ${fmt(m.auroc_catheter, 2)}`} />
          <Tile label="Testing" value="blind" unit="by patient" info="10 patient groups, 3 different splits averaged" />
        </div>
        <div className="rr-h" style={{ marginTop: 18 }}>How far off, recording by recording</div>
        <div className="grid-auto">
          <Tile label="Half are off by less than" value={fmt(e.median)} unit="mmHg" info={`middle half: ${fmt(e.p25)} to ${fmt(e.p75)}`} />
          <Tile label="Within 2 mmHg" value={`${e.within['2']}/${n}`} info={`within 1 mmHg: ${e.within['1']}`} />
          <Tile label="Within 5 mmHg" value={`${e.within['5']}/${n}`} info={`within 10 mmHg: ${e.within['10']}`} />
          <Tile label="Worst" value={fmt(e.max)} unit="mmHg" info={`estimates span ${fmt(e.estimate_range[0])}–${fmt(e.estimate_range[1])}; catheter ${fmt(e.catheter_range[0], 0)}–${fmt(e.catheter_range[1], 0)}`} />
        </div>
      </section>

      <div className="grid2">
        <section className="panel scatter">
          <div className="ph"><h3>Estimate against the catheter</h3><span className="sub">one dot per recording</span></div>
          <Scatter patients={patients} selected={selected} cutoff={c.wedge_congestion} />
          <p className="small">Every dot was predicted by a model that never saw that patient. Dots on the dashed line would be perfect. Estimates are pulled toward the middle: high pressures come out too low and low ones too high.</p>
        </section>
        <section className="panel">
          <div className="ph"><h3>Model comparison</h3><span className="sub">typical error, mmHg (lower is better)</span></div>
          <ModelBars models={meta.model_comparison} naive={m.naive_mae} />
          <p className="small">Dashed line: the always-average guess ({fmt(m.naive_mae, 2)}). All models land between 5.3 and 6.0, so the limit is the information in the signals, not the model type. Differences under about 0.2 mmHg are noise.</p>
        </section>
      </div>

      <section className="panel">
        <div className="ph"><h3>Does the percentage hold up?</h3><span className="sub">chance of congestion, tested blind</span></div>
        <div className="grid2">
          <div className="tbl"><table>
            <thead><tr><th>Predicted chance</th><th>Recordings</th><th>Average predicted</th><th>Really congested</th></tr></thead>
            <tbody>
              {meta.chance.reliability.map((r) => (
                <tr key={r.band}><td>{r.band}</td><td>{r.n}</td><td>{Math.round(r.predicted * 100)}%</td><td>{Math.round(r.observed * 100)}%</td></tr>
              ))}
            </tbody>
          </table></div>
          <div className="prose">
            <p>{meta.ui_text.percentage_info} That holds roughly at the ends. In the middle band it is optimistic: 61% predicted, 50% observed.</p>
            <p className="small">Each band has only 6 to 21 recordings, so every observed share is uncertain by roughly 10 percentage points.
              Separation: AUROC {fmt(meta.chance.auroc, 2)}. Brier score {fmt(meta.chance.brier, 3)} against {fmt(meta.chance.brier_base, 3)} for always
              predicting the base rate ({Math.round(meta.chance.base_rate * 100)}% congested). Method: {meta.chance.how}.</p>
          </div>
        </div>
      </section>

      <section className="panel prose">
        <div className="ph"><h3>How the status is decided</h3><span className="sub">one rule for the status and the recommendation</span></div>
        <p>{STATUS_INFO(rules)} The {cov}% range is the estimate {fmt(b.lower)} to +{fmt(b.upper)} mmHg, from the model's real errors on other patients.</p>
        <p>Here: <b>{count('congested')}</b> congested, <b>{count('uncertain')}</b> borderline, <b>{count('not_congested')}</b> not congested of {n}.
          The stricter range-only rule would give {b.counts.congested} / {b.counts.uncertain} / {b.counts.not_congested}.</p>
      </section>

      <div className="grid2">
        <section className="panel prose">
          <div className="ph"><h3>What the twin cannot do yet</h3></div>
          <ul className="plain">
            <li>Estimate right-atrial pressure, lung-artery pressure, stroke volume or cardiac output. No model beat the average guess, so these show only as catheter values.</li>
            <li>Predict one patient's own response to a medicine. With {meta.vasodilator.n_pairs} before-and-after pairs, no model beat the average change.</li>
            <li>Forecast days ahead. Each patient has one recording, so there is no trend to learn from.</li>
            <li>Measure litres of fluid or where it sits. Wedge pressure is the cause of fluid build-up, not a measure of the fluid.</li>
          </ul>
        </section>
        <section className="panel">
          <div className="ph"><h3>Cut-offs and sources</h3></div>
          <div className="tbl"><table>
            <thead><tr><th>Value</th><th>Meaning</th><th>Source</th></tr></thead>
            <tbody>
              <tr><td>&gt; {c.wedge_congestion} mmHg</td><td>Congestion (wedge pressure)</td><td>{c.source}</td></tr>
              <tr><td>&lt; {c.cardiac_index_low} L/min/m²</td><td>Low perfusion (cardiac index)</td><td>{c.source}</td></tr>
              <tr><td>{cov}% range</td><td>Error range around each estimate</td><td>This model's real errors on other patients</td></tr>
            </tbody>
          </table></div>
          <p className="small">Data: <a href={meta.data_source.url} target="_blank" rel="noreferrer">{meta.data_source.name}</a> ({meta.data_source.licence}).
            Model: {m.name}. Data file made {new Date(meta.generated_at).toLocaleString()}.</p>
        </section>
      </div>
    </div>
  )
}
