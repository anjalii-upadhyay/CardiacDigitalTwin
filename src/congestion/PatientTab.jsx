import React from 'react'
import { Info, StatePill, Tile, PressureScale } from './ui'
import HeartView from './HeartView'
import RecommendationCard from './RecommendationCard'
import { ROMAN, fmt, signed, label, rangeText } from './format'

function RecordCard({ p, statusInfo }) {
  const r = p.record
  return (
    <section className="panel">
      <div className="id-top">
        <div>
          <h2>{label(p)}</h2>
          <div className="sub">Recording {p.id} · {r.outpatient ? 'Outpatient' : 'Inpatient'}</div>
        </div>
        <div className="pills">
          <StatePill state={p.status} /><Info text={statusInfo} />
          <StatePill state={p.perfusion.state} kind="perfusion" />
        </div>
      </div>
      <dl className="facts">
        <div><dt>Age</dt><dd>{r.age} y</dd></div>
        <div><dt>Sex</dt><dd>{r.sex}</dd></div>
        <div><dt>BMI</dt><dd>{fmt(r.bmi)}</dd></div>
        <div><dt>NYHA class</dt><dd>{ROMAN[r.nyha] || '–'}</dd></div>
        <div><dt>BP</dt><dd>{r.sbp ? `${r.sbp}/${r.dbp}` : '–'} <small>mmHg</small></dd></div>
      </dl>
      {r.history_tags.length > 0 && (
        <div className="hist">
          <span className="lbl">History <Info text={`From the patient record: ${r.history || 'none recorded'}`} /></span>
          <div className="flags">{r.history_tags.map((t) => <span key={t} className="flag">{t}</span>)}</div>
        </div>
      )}
    </section>
  )
}

function Alert({ p, cutoff, acked, onAck, onSimulate }) {
  const c = p.congestion
  if (p.status !== 'congested') return null
  if (acked) return <div className="alert ack" role="status"><b>Congestion alert acknowledged.</b></div>
  return (
    <div className="alert" role="alert">
      <div className="alert-text">
        <b>Congestion alert.</b> Estimated PCWP {fmt(c.estimate_mmHg)} mmHg, {Math.round(c.chance * 100)}% chance above {cutoff} mmHg.
      </div>
      <div className="alert-act">
        <button className="btn" onClick={onAck}>Acknowledge</button>
        <button className="btn ghost" onClick={onSimulate}>Try a medicine change</button>
      </div>
    </div>
  )
}

function PcwpCard({ p, cutoff, ui }) {
  const c = p.congestion, m = p.measured, err = p.estimate.error_vs_catheter
  const cov = Math.round(c.range_coverage * 100)
  return (
    <section className="panel">
      <div className="ph"><h3>PCWP (lung back-pressure)</h3><span className="sub">mmHg</span></div>
      <div className="dual">
        <div><div className="lbl">Patch estimate <Info text={`${ui.estimate_info} ${cov}% range: ${rangeText(c.range_mmHg)}, built from the model's real errors on other patients.`} /></div>
          <div className="bignum">{fmt(c.estimate_mmHg)}</div>
          <div className="sub">{cov}% range {rangeText(c.range_mmHg)}</div></div>
        <div><div className="lbl">Chance of congestion <Info text={`${ui.percentage_info} ${ui.congestion_definition}`} /></div>
          <div className="bignum">{Math.round(c.chance * 100)}<span>%</span></div></div>
        <div className="validation"><div className="lbl">Catheter (validation) <Info text={`Measured by right-heart catheter during the study, shown only to check the estimate; not available at home. The estimate is off by ${signed(err)} mmHg.`} /></div>
          <div className="bignum m">{fmt(m.wedge, 0)}</div></div>
      </div>
      <PressureScale cutoff={cutoff}
        bands={[{ cls: 'err', lo: Math.max(0, c.range_mmHg[0]), hi: c.range_mmHg[1], tip: `${cov}% range: ${rangeText(c.range_mmHg)}` }]}
        markers={[{ cls: 'meas', v: m.wedge, tip: `Catheter (validation): ${fmt(m.wedge, 0)} mmHg` },
                  { cls: 'est', v: c.estimate_mmHg, tip: `Patch estimate: ${fmt(c.estimate_mmHg)} mmHg` }]} />
      <div className="legend">
        <span><i className="lg est" />Estimate</span><span><i className="lg err" />{cov}% range</span><span><i className="lg meas" />Catheter</span>
      </div>
    </section>
  )
}

function Haemodynamics({ p, ciLow, ui }) {
  const pf = p.perfusion, m = p.measured
  return (
    <section className="panel">
      <div className="ph">
        <h3>Measured haemodynamics</h3>
        <Info text="Right-heart catheter values from the study. The model could not estimate these better than a plain average, so they are never estimated and never drive suggestions." />
      </div>
      <div className="perf">
        <StatePill state={pf.state} kind="perfusion" />
        <span>{pf.state === 'unknown' ? 'Cardiac index not available' : <>CI (cardiac index) <b>{fmt(pf.cardiac_index, 2)}</b> L/min/m²</>}</span>
        <Info text={`${ui.perfusion_info} Low below ${ciLow} L/min/m² (${pf.cutoff_source || 'CSI 2018'}). Source: ${pf.source || pf.reason}.`} />
      </div>
      <div className="grid-auto">
        <Tile label="RAP (right-atrial pressure)" value={fmt(m.ra, 0)} unit="mmHg" info="Back-pressure toward the body." />
        <Tile label="mPAP (mean pulmonary artery)" value={fmt(m.pa, 0)} unit="mmHg" info="Pressure in the lung artery." />
        <Tile label="SV (stroke volume)" value={fmt(m.sv, 0)} unit="mL" info="Blood pumped per beat. Sets how strongly the 3D heart squeezes." />
        <Tile label="CO (cardiac output)" value={fmt(m.co, 1)} unit="L/min" info="Blood pumped per minute." />
      </div>
    </section>
  )
}

export default function PatientTab({ p, meta, rec, statusInfo, acked, onAck, onSimulate }) {
  const cutoff = meta.cutoffs.wedge_congestion
  return (
    <div className="stack">
      <RecordCard p={p} statusInfo={statusInfo} />
      <Alert p={p} cutoff={cutoff} acked={acked} onAck={onAck} onSimulate={onSimulate} />
      <div className="grid2">
        <RecommendationCard rec={rec} />
        <section className="panel">
          <div className="ph"><h3>Heart twin</h3><Info text="The patient's own beat timing from the chest patch drives the 3D heart; squeeze depth follows the measured stroke volume; a red pulse means the chance of congestion is 50% or more." /></div>
          <HeartView patient={p} wedge={p.estimate.wedge} state={p.status} />
        </section>
      </div>
      <div className="grid2">
        <PcwpCard p={p} cutoff={cutoff} ui={meta.ui_text} />
        <Haemodynamics p={p} ciLow={meta.cutoffs.cardiac_index_low} ui={meta.ui_text} />
      </div>
    </div>
  )
}
