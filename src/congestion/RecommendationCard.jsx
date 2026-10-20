// Guideline-grounded recommendation for the patient's current state (public/data/recommendations.json, made offline
// by hf_twin.recommendation.export_recommendations). Shown on the Patient and Medicine simulator tabs.
import React from 'react'
import { Info } from './ui'

const refsText = (refs) => refs.map((g) => `${g.source}, p. ${g.page}${g.class ? ` (class ${g.class}, level ${g.level})` : ''}`).join(' · ')

export default function RecommendationCard({ rec }) {
  if (!rec) {
    return (
      <section className="panel suggest">
        <div className="ph"><h3>Recommendation</h3></div>
        <p className="muted">No recommendation available for this recording.</p>
      </section>
    )
  }
  const recommend = rec.status === 'recommend'
  const how = rec.rule_decided ? 'Decided by a fixed safety rule (no AI).'
    : rec.checks?.ai_used ? `AI choice checked against the guideline excerpts (confidence ${rec.checks.choice_confidence}, support ${rec.checks.support_score} of 3).`
    : 'The safety rules allowed no suggestion.'
  return (
    <section className={`panel suggest ${recommend ? '' : 'none'}`}>
      <div className="ph">
        <h3>Recommendation</h3>
        <Info text={`${rec.disclaimer} ${how}`} />
      </div>
      <div className="rec-action">{recommend ? rec.action_text : 'No suggestion: clinician judgement needed'}</div>
      <p className="rec-why">{rec.rationale}</p>
      {(rec.safety_flags?.length > 0 || rec.guideline_refs?.length > 0) && (
        <div className="rec-meta">
          {rec.safety_flags?.map((f) => <span key={f} className="flag warn">{f}</span>)}
          {rec.guideline_refs?.length > 0 && <span className="refs">Guideline basis <Info text={refsText(rec.guideline_refs)} /></span>}
        </div>
      )}
      <div className="decide">The clinician decides. No dose is suggested.</div>
    </section>
  )
}
