import React from 'react'
import { Ev, StatePill, PressureScale } from './ui'
import HeartView from './HeartView'
import { classify, offsetsOf, fmt, signed, label, rangeText } from './format'

function RecommendationCard({ p, rec }) {
  if (rec) {
    return (
      <section className="panel suggest">
        <div className="ph" style={{ margin: 0 }}><h3>Decision support</h3><Ev k="G" /></div>
        <dl>
          <div><dt>Result</dt><dd>{rec.status === 'recommend' ? rec.action_text : rec.status === 'abstain' ? 'No suggestion (the step abstained).' : 'Sent for clinician review.'}</dd></div>
          {rec.rationale && <div><dt>Why</dt><dd>{rec.rationale}</dd></div>}
          {rec.guideline_refs?.length > 0 && <div><dt>Guideline basis</dt><dd>{rec.guideline_refs.map((g) => `${g.source}, p. ${g.page}`).join('; ')}</dd></div>}
          {rec.safety_flags?.length > 0 && <div><dt>Safety checks</dt><dd>{rec.safety_flags.join('; ')}</dd></div>}
        </dl>
        <div className="decide">The doctor decides. This is decision support, not a prescription.</div>
      </section>
    )
  }
  return (
    <section className="panel suggest">
      <div className="ph" style={{ margin: 0 }}><h3>Decision support</h3><Ev k="G" /></div>
      <div className="pending" style={{ margin: 0 }}>Step 7 (guideline-grounded recommendation) is not connected yet. This card shows what it will receive.</div>
      <dl>
        <div><dt>Congestion</dt><dd><StatePill state={p.congestion.state} /> estimate {fmt(p.congestion.estimate_mmHg)} mmHg, range {rangeText(p.congestion.range_mmHg)}</dd></div>
        <div><dt>Perfusion</dt><dd><StatePill state={p.perfusion.state} kind="perfusion" /> {p.perfusion.cardiac_index != null && `cardiac index ${fmt(p.perfusion.cardiac_index, 2)} L/min/m² (measured)`}</dd></div>
        <div><dt>History</dt><dd>{p.record.history_tags.join(', ') || '–'}</dd></div>
      </dl>
      <div className="decide">The doctor decides. This will be decision support, not a prescription.</div>
    </section>
  )
}

export default function SimulatorTab({ p, meta, resp, onResp, rec }) {
  const v = meta.vasodilator, cutoff = meta.cutoffs.wedge_congestion
  const est = p.estimate.wedge
  const after = Math.max(0, est + resp)
  const sim = classify(after, offsetsOf(p.congestion), cutoff)
  const real = p.after_vasodilator
  const presets = [['smallest drop', v.smallest], ['average', v.mean], ['largest drop', v.largest]]
  const markers = [
    { cls: 'before', v: est, tip: `Now: ${fmt(est)} mmHg (patch estimate)` },
    { cls: 'est', v: after, tip: `After (simulated): ${fmt(after)} mmHg` },
  ]
  if (real) markers.push({ cls: 'real', v: real.wedge, tip: `Real catheter value after ${real.drug}: ${fmt(real.wedge, 0)} mmHg` })

  return (
    <div className="stack">
      <div className="banner-s"><Ev k="S" /> <b>Simulation.</b> The change uses the responses of {v.n_pairs} real patients who got a vasodilator
        during their catheter test (average {signed(v.mean)} mmHg, from {signed(v.smallest, 0)} to {signed(v.largest, 0)}). No model could predict one
        patient's own response better than that average, so this is an assumption, not a forecast.</div>
      <div className="grid2">
        <section className="panel ctrl">
          <div className="ph" style={{ margin: 0 }}><h3>Try a medicine change</h3><span className="sub">{label(p)}</span></div>
          <fieldset>
            <legend>Medicine</legend>
            <label className="opt"><input type="radio" name="med" id="med-vaso" defaultChecked />
              <span><b>Vasodilator</b><small>Widens blood vessels. Nitroprusside or nitroglycerin, as given in the study.</small></span></label>
            <label className="opt dis"><input type="radio" name="med" id="med-diur" disabled />
              <span><b>Diuretic (water tablet)</b><small>Not available: this dataset has no diuretic response data.</small></span></label>
          </fieldset>
          <fieldset>
            <legend>Assume this patient responds like</legend>
            <div className="seg">
              {presets.map(([n, d]) => (
                <button key={n} className={resp === d ? 'on' : ''} aria-pressed={resp === d} onClick={() => onResp(d)}>{n}<b>{signed(d)}</b></button>
              ))}
            </div>
            <label htmlFor="resp" className="sub">Or set any change within the real range (mmHg)</label>
            <input type="range" id="resp" min={v.largest} max={v.smallest} step="0.1" value={resp} onChange={(e) => onResp(Number(e.target.value))} />
            <div className="range-row"><span>{signed(v.largest, 0)}</span><span>{signed(resp)} mmHg</span><span>{fmt(v.smallest, 0)}</span></div>
          </fieldset>
        </section>

        <section className="panel">
          <div className="ph"><h3>Estimated wedge pressure</h3><span className="sub">mmHg</span></div>
          <div className="ba">
            <div><div className="lbl">Now <Ev k="R" /></div><div className="bignum">{fmt(est)}</div><StatePill state={p.congestion.state} /></div>
            <div className="arrow" aria-hidden="true">→</div>
            <div><div className="lbl">After change <Ev k="S" /></div><div className="bignum">{fmt(after)}</div><StatePill state={sim.state} /></div>
          </div>
          <PressureScale cutoff={cutoff} markers={markers}
            bands={[{ cls: 'range', lo: Math.max(0, est + v.largest), hi: est + v.smallest, tip: `Range of real responses: ${fmt(Math.max(0, est + v.largest))} to ${fmt(est + v.smallest)} mmHg` }]} />
          <div className="legend">
            <span><i className="lg before" />Now</span><span><i className="lg est" />After (simulated)</span>
            <span><i className="lg range" />Range of real responses</span>{real && <span><i className="lg real" />Real catheter after</span>}
          </div>
          <div className="realcheck">
            {real ? <>
              <div className="lbl">Real check for this patient <Ev k="R" /></div>
              <div>The catheter wedge went from <b>{fmt(p.measured.wedge, 0)}</b> to <b>{fmt(real.wedge, 0)} mmHg</b> after {real.drug} (change {signed(real.wedge - p.measured.wedge, 0)}).</div>
            </> : <>
              <div className="lbl">Real check</div>
              <div>This patient had no vasodilator test, so there is no real after-value to compare with.</div>
            </>}
          </div>
        </section>
      </div>
      <div className="grid2">
        <section className="panel">
          <div className="ph"><h3>Heart and lungs after the change</h3><span className="sub">simulated</span></div>
          <HeartView patient={p} wedge={after} state={sim.state} simulated />
        </section>
        <RecommendationCard p={p} rec={rec} />
      </div>
    </div>
  )
}
