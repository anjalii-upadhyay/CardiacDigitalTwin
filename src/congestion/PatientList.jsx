import React from 'react'
import { CONGESTION, ROMAN, fmt, label } from './format'

const FILTERS = [['all', 'All'], ['congested', 'Congested'], ['uncertain', 'Uncertain'], ['not_congested', 'Not congested']]

export default function PatientList({ patients, selected, onSelect, filter, onFilter, query, onQuery }) {
  const counts = { all: patients.length, congested: 0, uncertain: 0, not_congested: 0 }
  patients.forEach((p) => { counts[p.congestion.state]++ })
  const nPatients = new Set(patients.map((p) => p.patient)).size
  const q = query.trim().toLowerCase()
  const rows = patients
    .filter((p) => (filter === 'all' || p.congestion.state === filter) && label(p).toLowerCase().includes(q))
    .sort((a, b) => b.estimate.wedge - a.estimate.wedge)

  return (
    <aside className="panel list" aria-label="Patient list">
      <div className="list-head">
        <h2>Patients</h2>
        <div className="sub">{patients.length} recordings · {nPatients} patients · each estimated blind</div>
        <input className="search" id="patient-search" type="search" placeholder="Search by ID, e.g. TRM245"
               aria-label="Search patients" value={query} onChange={(e) => onQuery(e.target.value)} />
        <div className="filters">
          {FILTERS.map(([k, l]) => (
            <button key={k} className={`chip ${filter === k ? 'on' : ''}`} aria-pressed={filter === k} onClick={() => onFilter(k)}>
              {l} <b>{counts[k]}</b>
            </button>
          ))}
        </div>
        <div className="sub">Sorted by estimated wedge pressure (mmHg), highest first. Small figure: chance of congestion.</div>
      </div>
      <ul className="plist">
        {rows.length === 0 && <li className="empty">No recordings match. Clear the search or pick another filter.</li>}
        {rows.map((p) => {
          const s = CONGESTION[p.congestion.state]
          return (
            <li key={p.id}>
              <button className={`row ${p.id === selected ? 'on' : ''}`} aria-current={p.id === selected} onClick={() => onSelect(p.id)}>
                <span className={`ic ${s.key}`} aria-label={s.label}>{s.icon}</span>
                <span className="who">
                  <span className="rid">{label(p)}</span>
                  <span className="meta">{p.record.age} y · {p.record.sex === 'Male' ? 'M' : 'F'} · NYHA {ROMAN[p.record.nyha] || '–'}</span>
                </span>
                <span className="num">{fmt(p.estimate.wedge)}<small>{Math.round(p.congestion.chance * 100)}%</small></span>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
