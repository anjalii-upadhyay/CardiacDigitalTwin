// Congestion Twin: doctor dashboard for the heart-failure congestion plan (journey D27, D33).
// Data: public/data/patients.json, made by `python -m hf_twin.dashboard.export_data`.
// Optional: public/data/recommendations.json, keyed by recording id, from step 7 (see RecommendationCard).
import React, { useEffect, useMemo, useState } from 'react'
import './congestion.css'
import PatientList from './PatientList'
import PatientTab from './PatientTab'
import SimulatorTab from './SimulatorTab'
import SignalsTab from './SignalsTab'
import EvidenceTab from './EvidenceTab'
import { Ev } from './ui'
import { useTooltip } from './useTooltip'
import { cohortStats } from './format'

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

  const stats = useMemo(() => (data ? cohortStats(data.patients) : null), [data])

  const goTab = (k) => {
    setTab(k)
    window.history.replaceState(null, '', `#${k}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const select = (id) => {
    setSelected(id)
    if (window.innerWidth < 900) document.querySelector('.ct main')?.scrollIntoView({ behavior: 'smooth' })
  }

  if (error) {
    return <div className="ct"><div className="wrap"><div className="panel">
      <h2>Patient data not found</h2>
      <p>Run <code>python_backend/venv/Scripts/python.exe -m hf_twin.dashboard.export_data</code> from the repo root, then reload. ({error})</p>
    </div></div></div>
  }
  if (!data || !selected) return <div className="ct"><div className="wrap"><div className="panel">Loading patients…</div></div></div>

  const p = data.patients.find((x) => x.id === selected)
  return (
    <div className="ct">
      <div className="wrap">
        <header className="top">
          <div className="brand">
            <div className="mark" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="none" stroke="var(--accent-ink)" strokeWidth="2" /><path d="M5 12h3l2-3 2.5 6 2-3H19" fill="none" stroke="var(--accent-ink)" strokeWidth="1.6" /></svg>
            </div>
            <div><h1>Congestion Twin</h1><p>Heart-failure doctor console · chest-patch digital twin</p></div>
          </div>
          <nav className="tabs" role="tablist" aria-label="Sections">
            {TABS.map(([k, l]) => (
              <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => goTab(k)}>{l}</button>
            ))}
          </nav>
        </header>
        <div className="keyline">
          <span><Ev k="R" /> real patient data or a model learned from it</span>
          <span><Ev k="G" /> published guideline value</span>
          <span><Ev k="S" /> simulation or assumption</span>
          <span className="mock">Research prototype · not a medical device</span>
        </div>

        <div className="shell">
          <PatientList patients={data.patients} selected={selected} onSelect={select}
                       filter={filter} onFilter={setFilter} query={query} onQuery={setQuery} />
          <main role="tabpanel">
            {tab === 'patient' && <PatientTab p={p} meta={data.meta} stats={stats} n={data.patients.length}
              acked={!!acked[p.id]} onAck={() => setAcked((a) => ({ ...a, [p.id]: true }))} onSimulate={() => goTab('simulator')} />}
            {tab === 'simulator' && <SimulatorTab p={p} meta={data.meta} resp={resp} onResp={setResp} rec={recs[p.id]} />}
            {tab === 'signals' && <SignalsTab p={p} />}
            {tab === 'evidence' && <EvidenceTab patients={data.patients} selected={selected} meta={data.meta} />}
          </main>
        </div>
      </div>
      <div id="ct-tip" ref={tipRef} hidden />
    </div>
  )
}
