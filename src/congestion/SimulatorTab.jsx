import React from 'react'
import { Info, StatePill, PressureScale } from './ui'
import HeartView from './HeartView'
import RecommendationCard from './RecommendationCard'
import { classify, bandState, offsetsOf, chanceAt, fmt, signed, label } from './format'

export default function SimulatorTab({ p, meta, rules, resp, onResp, rec }) {
  const v = meta.vasodilator, cutoff = meta.cutoffs.wedge_congestion
  const est = p.estimate.wedge
  const after = Math.max(0, est + resp)
  const curve = p.congestion.curve
  const simChance = chanceAt(curve, Math.max(0, curve.estimate_unrounded + resp))
  const simRange = classify(after, offsetsOf(p.congestion), cutoff).range
  const simState = rules ? bandState(simChance, simRange, rules) : classify(after, offsetsOf(p.congestion), cutoff).state
  const simLean = simChance >= meta.chance.lean_threshold ? 'congested' : 'not_congested'
  const real = p.after_vasodilator
  const presets = [['smallest drop', v.smallest], ['average', v.mean], ['largest drop', v.largest]]
  const markers = [
    { cls: 'before', v: est, tip: `Now: ${fmt(est)} mmHg (patch estimate)` },
    { cls: 'est', v: after, tip: `After (simulated): ${fmt(after)} mmHg` },
  ]
  if (real) markers.push({ cls: 'real', v: real.wedge, tip: `Real catheter value after ${real.drug}: ${fmt(real.wedge, 0)} mmHg` })

  return (
    <div className="stack">
      <div className="banner-s">
        <span><b>Simulation</b>, not a forecast: assumes this patient responds like the {v.n_pairs} real vasodilator patients.</span>
        <Info text={`Those ${v.n_pairs} patients changed by ${signed(v.mean)} mmHg on average (from ${signed(v.smallest, 0)} to ${signed(v.largest, 0)}). No model could predict one patient's own response better than that average.`} />
      </div>
      <div className="grid2">
        <section className="panel ctrl">
          <div className="ph"><h3>Try a medicine change</h3><span className="sub">{label(p)}</span></div>
          <fieldset>
            <legend>Medicine</legend>
            <label className="opt"><input type="radio" name="med" id="med-vaso" defaultChecked />
              <span><b>Vasodilator</b><small>Nitroprusside or nitroglycerin, as in the study</small></span></label>
            <label className="opt dis"><input type="radio" name="med" id="med-diur" disabled />
              <span><b>Diuretic</b><small>Not available: no diuretic response data in this dataset</small></span></label>
          </fieldset>
          <fieldset>
            <legend>Assume this patient responds like</legend>
            <div className="seg">
              {presets.map(([n, d]) => (
                <button key={n} className={resp === d ? 'on' : ''} aria-pressed={resp === d} onClick={() => onResp(d)}>{n}<b>{signed(d)}</b></button>
              ))}
            </div>
            <input type="range" id="resp" aria-label="Change in PCWP, mmHg" min={v.largest} max={v.smallest} step="0.1" value={resp} onChange={(e) => onResp(Number(e.target.value))} />
            <div className="range-row"><span>{signed(v.largest, 0)}</span><span>{signed(resp)} mmHg</span><span>{fmt(v.smallest, 0)}</span></div>
          </fieldset>
        </section>

        <section className="panel">
          <div className="ph"><h3>PCWP (lung back-pressure)</h3><span className="sub">mmHg</span></div>
          <div className="ba">
            <div><div className="lbl">Now</div><div className="bignum">{fmt(est)}</div><StatePill state={p.status} /></div>
            <div className="arrow" aria-hidden="true">→</div>
            <div><div className="lbl">After change <Info text="Simulated value, using this patient's own chance curve." /></div><div className="bignum">{fmt(after)}</div><StatePill state={simState} />
              <div className="sub">Chance of congestion: <b>{Math.round(simChance * 100)}%</b></div></div>
          </div>
          <PressureScale cutoff={cutoff} markers={markers}
            bands={[{ cls: 'range', lo: Math.max(0, est + v.largest), hi: est + v.smallest, tip: `Range of real responses: ${fmt(Math.max(0, est + v.largest))} to ${fmt(est + v.smallest)} mmHg` }]} />
          <div className="legend">
            <span><i className="lg before" />Now</span><span><i className="lg est" />After</span>
            <span><i className="lg range" />Real responses</span>{real && <span><i className="lg real" />Real catheter after</span>}
          </div>
          <div className="realcheck">
            {real
              ? <>Real check: catheter PCWP went from <b>{fmt(p.measured.wedge, 0)}</b> to <b>{fmt(real.wedge, 0)} mmHg</b> after {real.drug} ({signed(real.wedge - p.measured.wedge, 0)}).</>
              : 'No vasodilator test for this patient, so there is no real after-value to compare.'}
          </div>
        </section>
      </div>
      <div className="grid2">
        <section className="panel">
          <div className="ph"><h3>Heart twin after the change</h3><Info text="Same real beats; the red pulse follows the simulated chance (50% or more)." /></div>
          <HeartView patient={p} wedge={after} state={simState} simulated chance={simChance} lean={simLean} />
        </section>
        <RecommendationCard rec={rec} />
      </div>
    </div>
  )
}
