// Congestion Twin: doctor dashboard for the heart-failure congestion plan (journey D27, D33).
// Data: public/data/patients.json (hf_twin.dashboard.export_data) and public/data/recommendations.json
// (hf_twin.recommendation.export_recommendations), whose _meta.rules also define the status shown everywhere.
import React, { useEffect, useMemo, useState } from 'react'
import './congestion.css'
import PatientList from './PatientList'
import PatientTab from './PatientTab'
import SimulatorTab from './SimulatorTab'
import SignalsTab from './SignalsTab'
import EvidenceTab from './EvidenceTab'
import { Info } from './ui'
import { useTooltip } from './useTooltip'
import { bandState, cohortStats, STATUS_INFO } from './format'

const TABS = [['patient', 'Patient'], ['simulator', 'Medicine simulator'], ['signals', 'Patch signals'], ['evidence', 'Model & evidence']]
const tabFromHash = () => (TABS.some(([k]) => `#${k}` === window.location.hash) ? window.location.hash.slice(1) : 'patient')

export default function CongestionApp() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [recs, setRecs] = useState({})
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState(tabFromHash)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [resp, setResp] = useState(null)
  const [acked, setAcked] = useState({})
  const tipRef = useTooltip()

  useEffect(() => {
    fetch('/data/patients.json')
      .then((r) => { if (!r.ok) throw new Error(`patients.json: HTTP ${r.status}`); return r.json() })
      .then((d) => {
        setData(d)
        setSelected([...d.patients].sort((a, b) => b.estimate.wedge - a.estimate.wedge)[0].id)
        setResp(d.meta.vasodilator.mean)
      })
      .catch((e) => setError(e.message))
    fetch('/data/recommendations.json').then((r) => (r.ok ? r.json() : {})).then(setRecs).catch(() => {})
  }, [])

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const rules = recs._meta?.rules
  const patients = useMemo(() => (data ? data.patients.map((p) => ({
    ...p, status: rules ? bandState(p.congestion.chance, p.congestion.range_mmHg, rules) : p.congestion.state,
  })) : []), [data, rules])
  const stats = useMemo(() => (data ? cohortStats(data.patients) : null), [data])
  const statusInfo = STATUS_INFO(rules)

  const goTab = (k) => {
    setTab(k)
    window.history.replaceState(null, '', `#${k}`)
    document.querySelector('.ct main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (error) {
    return <div className="ct"><div className="panel msg">
      <h2>Patient data not found</h2>
      <p>Run <code>python -m hf_twin.dashboard.export_data</code> from the repo root, then reload. ({error})</p>
    </div></div>
  }
  if (!data || !selected) return <div className="ct"><div className="panel msg">Loading patients…</div></div>

  const p = patients.find((x) => x.id === selected)
  return (
    <div className="ct">
      <header className="top">
        <div className="brand">
          <div className="mark" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="none" stroke="var(--accent-ink)" strokeWidth="2" /><path d="M5 12h3l2-3 2.5 6 2-3H19" fill="none" stroke="var(--accent-ink)" strokeWidth="1.6" /></svg>
          </div>
          <div><h1>Congestion Twin</h1><p>Heart-failure remote monitoring</p></div>
        </div>
        <nav className="tabs" role="tablist" aria-label="Sections">
          {TABS.map(([k, l]) => (
            <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => goTab(k)}>{l}</button>
          ))}
        </nav>
        <div className="mock">Research prototype · not a medical device
          <Info text="Real data: PhysioNet SCG-RHC (chest patch plus right-heart catheter). Cut-offs from published guidelines (CSI 2018, AHA/ACC/HFSA 2022). Simulated values are marked as simulations. Decision support only; the clinician decides." />
        </div>
      </header>

      <div className="shell">
        <PatientList patients={patients} selected={selected} onSelect={setSelected} statusInfo={statusInfo}
                     filter={filter} onFilter={setFilter} query={query} onQuery={setQuery} />
        <main role="tabpanel">
          {tab === 'patient' && <PatientTab p={p} meta={data.meta} rec={recs[p.id]} statusInfo={statusInfo}
            acked={!!acked[p.id]} onAck={() => setAcked((a) => ({ ...a, [p.id]: true }))} onSimulate={() => goTab('simulator')} />}
          {tab === 'simulator' && <SimulatorTab p={p} meta={data.meta} rules={rules} resp={resp} onResp={setResp} rec={recs[p.id]} />}
          {tab === 'signals' && <SignalsTab p={p} stats={stats} n={patients.length} />}
          {tab === 'evidence' && <EvidenceTab patients={patients} selected={selected} meta={data.meta} rules={rules} />}
        </main>
      </div>
      <div id="ct-tip" ref={tipRef} hidden />
    </div>
  )
}
