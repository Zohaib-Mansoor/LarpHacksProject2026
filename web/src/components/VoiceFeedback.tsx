import { useEffect, useState } from 'react';
import type { RoomView } from '../lib/api';

const labels: Record<string, string> = {
  strategy: 'Negotiation strategy', listening: 'Listening and collaboration',
  clarity: 'Clarity and closing', professionalism: 'Respect and composure',
};
export function VoiceFeedback({ view, onUpdate }: { view: RoomView; onUpdate: (view: RoomView) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const coach = view.coaching;
  async function evaluate() {
    setBusy(true);
    try {
      const response = await fetch('/api/vc/coaching/evaluate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: view.code, round: view.round }),
      });
      const result = await response.json();
      if (!response.ok) { setMessage(result.message ?? result.error?.message ?? 'AI feedback unavailable. Mission points remain valid.'); return; }
      onUpdate(result);
      setMessage(result.coaching.status === 'failed' ? 'AI feedback unavailable. Mission points remain valid.' : '');
    } catch { setMessage('Could not reach the coach. Mission points remain valid.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!coach?.configured || !coach.allConsented || view.phase !== 'complete' || coach.status !== 'idle' || coach.pendingClips) return;
    const timer = setTimeout(() => void evaluate(), 6500);
    return () => clearTimeout(timer);
    // Polling replaces the view object; only restart when the scoring prerequisites change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.code, view.round, view.phase, coach?.configured, coach?.allConsented, coach?.status, coach?.pendingClips]);
  return (
    <section className="debrief-card" style={{ marginBottom: 24 }} aria-label="AI negotiation feedback">
      <p className="kicker mono">NEGOTIATION COACH · 60 MISSION + 40 COMMUNICATION</p>
      <h2>{coach?.feedback ? `${coach.feedback.overall} / 100` : 'Speech and rubric feedback'}</h2>
      {!coach?.configured ? <p>AI coaching is not enabled for this demo. Your mission score is valid.</p>
        : !coach.allConsented ? <p>AI coaching was off for this round. Both players must opt in before starting.</p>
        : coach.feedback ? <>
          <p>Mission goals: {coach.feedback.objectivePoints}/60 · Communication: {coach.feedback.communicationPoints}/40</p>
          {coach.feedback.assessment.dimensions.map(d => <div key={d.key} style={{ marginTop: 16 }}>
            <strong>{labels[d.key]} · {d.level}/4</strong><p>{d.explanation}</p>
            {d.evidence.map((e, i) => <blockquote key={i}>“{e.quote}”</blockquote>)}
          </div>)}
          <small>AI feedback can make mistakes. Goals are scored from the signed deal; communication is supported by transcript quotes.</small>
        </> : <>
          <p role="status">{busy || coach.status === 'processing' ? 'Rating your negotiation…' : coach.pendingClips ? 'Transcribing the last speaking turn…' : message || 'Preparing your evidence-based feedback. Missing speech never becomes an automatic zero.'}</p>
          <button className="wise-pill wise-pill-solid" disabled={busy || coach.status === 'processing' || coach.pendingClips > 0} onClick={() => void evaluate()}>Rate my negotiation</button>
        </>}
      {coach?.transcript.length > 0 ? <details style={{ marginTop: 18 }}><summary>Speech transcript ({coach.transcript.length} turns)</summary>
        {coach.transcript.map(t => <p key={t.turn}><strong>{t.speaker === 'alex' ? 'Alex' : 'Morgan'} · turn {t.turn + 1}:</strong> {t.text}</p>)}
      </details> : null}
    </section>
  );
}
