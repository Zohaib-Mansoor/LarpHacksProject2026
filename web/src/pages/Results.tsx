import { useGameConfig } from '../providers/GameConfigProvider';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { gsap } from 'gsap';
import { FlowStepperHeader } from '../components/FlowStepperHeader';
import {
  fetchRoom,
  formatMoney,
  getProfile,
  getRoomToken,
  recordCompletedRound,
  RoomView,
  saveProfile,
  sendRoomAction,
  startSparring,
  submitLeaderboardScore,
} from '../lib/api';
import { useToast } from '../providers/ToastProvider';
import { VoiceFeedback } from '../components/VoiceFeedback';

export default function Results() {
  const { rules } = useGameConfig();
  const { code = '' } = useParams();
  const roomCode = code.toUpperCase();
  const navigate = useNavigate();
  const { toast } = useToast();
  const root = useRef<HTMLDivElement>(null);

  const token = getRoomToken(roomCode);
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState('');
  const [callsign, setCallsign] = useState(() => getProfile().callsign);
  const [posted, setPosted] = useState(false);
  const completedRoundKey = view?.result ? `${view.code}:${view.round}` : null;

  const sync = useCallback(async () => {
    if (!token || !roomCode) return;
    try {
      const next = await fetchRoom(roomCode, token);
      setView(next);
      if (next.result) recordCompletedRound(next);
      if (next.phase === 'prep' || next.phase === 'talk') {
        navigate(`/room/${roomCode}`, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Result expired or unavailable.');
    }
  }, [token, roomCode, navigate]);

  useEffect(() => {
    if (!token) return;
    void sync();
    const id = setInterval(() => void sync(), 1400);
    return () => clearInterval(id);
  }, [token, sync]);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !completedRoundKey) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      gsap.from('.receipt-panel', { y: 36, autoAlpha: 0, duration: 0.75, ease: 'expo.out' });
      gsap.from('.receipt-stamp', { scale: 2.2, rotate: -14, autoAlpha: 0, duration: 0.55, delay: 0.35, ease: 'back.out(2.2)' });
      gsap.from('.debrief-card', { y: 24, autoAlpha: 0, duration: 0.65, stagger: 0.08, delay: 0.2, ease: 'expo.out' });
    }, el);
    return () => ctx.revert();
  }, [completedRoundKey]);

  if (!token || error) {
    return (
      <div className="flow-page">
        <FlowStepperHeader step={3} closeTo="/play" />
        <div className="flow-column" style={{ textAlign: 'center', paddingTop: 56 }}>
          <h1 className="display" style={{ fontSize: 48 }}>Receipt unavailable</h1>
          <p style={{ color: 'var(--muted)', margin: '12px 0 24px' }}>
            {error || 'Results stay readable for 10 minutes after a round ends for participants of that room.'}
          </p>
          <Link to="/play" className="btn btn-primary btn-lg">Back to Command Hub</Link>
        </div>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="flow-page">
        <FlowStepperHeader step={3} closeTo="/play" />
        <div className="flow-column" style={{ textAlign: 'center', paddingTop: 56 }}>
          <p className="mono" style={{ color: 'var(--muted)' }}>PREPARING DEBRIEF…</p>
        </div>
      </div>
    );
  }

  const confirmed = !!view.result?.confirmed;
  const pkg = view.packages.find(p => p.id === view.deal?.package);
  // Both screens must read the same role-indexed server totals. The objective
  // breakdown remains private and is rendered separately below.
  const myScore = view.result?.scores?.[view.you.id] ?? null;
  const peerId = view.peer?.id || (view.you.id === 'alex' ? 'morgan' : 'alex');
  const peerScore = view.result?.scores?.[peerId] ?? null;

  async function toggleReveal() {
    if (!token || !view) return;
    const next = await sendRoomAction(roomCode, token, { type: 'reveal', allow: !view.you.reveal });
    setView(next);
  }

  async function requestRematch() {
    if (!token) return;
    const next = await sendRoomAction(roomCode, token, { type: 'rematch' });
    setView(next);
    if (next.phase === 'prep') navigate(`/room/${roomCode}`, { replace: true });
    else toast('Rematch requested — waiting for partner');
  }

  async function postScore() {
    if (!token || !callsign.trim()) {
      toast('Enter a callsign first.');
      return;
    }
    try {
      saveProfile({ callsign: callsign.trim(), leaderboardOptIn: true });
      await submitLeaderboardScore(roomCode, token, callsign.trim());
      setPosted(true);
      toast('Posted to session standings!');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not post score.');
    }
  }

  return (
    <div className="flow-page" ref={root}>
      <FlowStepperHeader step={3} badge={view.you.name.slice(0,2).toUpperCase()} closeTo="/play" />

      <div className="results-wrap">
        <VoiceFeedback view={view} onUpdate={setView} />
        {/* Signature Dark Signed Receipt */}
        <section className="receipt receipt-panel" aria-labelledby="receipt-heading">
          <div className="receipt-head">
            <div>
              <p className="mono" style={{ fontSize: 11, letterSpacing: '0.16em', opacity: 0.72 }}>
                SIGNED RECEIPT · ROOM {view.code} · ROUND {view.round}
              </p>
              <h1 id="receipt-heading" className="display receipt-title">
                {confirmed && view.deal ? formatMoney(view.deal.price) : view.phase === 'incomplete' ? 'Incomplete' : 'No Deal'}
              </h1>
              <p style={{ opacity: 0.85, marginTop: 4 }}>
                {confirmed && pkg ? `${pkg.name} — ${pkg.detail}` : view.endReason}
              </p>
            </div>
            <span className={`receipt-stamp display ${confirmed ? 'is-ok' : 'is-miss'}`}>
              {confirmed ? 'Confirmed' : 'Unconfirmed'}
            </span>
          </div>

          <div className="rule" />

          <div className="receipt-meta-grid">
            <div>
              <span className="meta-lbl">You</span>
              <strong>{view.you.name} · {myScore ?? '—'} pts</strong>
            </div>
            <div>
              <span className="meta-lbl">Partner</span>
              <strong>{view.peer?.name || 'Partner'} · {view.result ? `${peerScore ?? '—'} pts` : '—'}</strong>
            </div>
            <div>
              <span className="meta-lbl">Revision</span>
              <strong className="mono">{confirmed ? `Rev #${view.revision} (2/2 signed)` : 'Not mutually signed'}</strong>
            </div>
          </div>
        </section>

        {/* Score Arithmetic Grid */}
        {view.result ? (
          <div className="debrief-grid">
            <section className="debrief-card">
              <div className="debrief-score-head">
                <div>
                  <span className="kicker mono">YOUR MISSION ARITHMETIC</span>
                  <h2>{view.you.name}</h2>
                </div>
                <div className="big-pts display tnum">
                  <span>{myScore ?? '—'}</span><small>/{rules.missionMax}</small>
                </div>
              </div>
              <ul className="goal-result-list">
                {view.you.objectives.map((text, i) => {
                  const pts = view.result!.yours[i] ?? 0;
                  return (
                    <li key={i} className={pts > 0 ? 'is-hit' : ''}>
                      <span className="hit-icon">{pts > 0 ? '✓' : '–'}</span>
                      <span>{text}</span>
                      <strong className="mono tnum">+{pts}</strong>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="debrief-card">
              <div className="debrief-score-head">
                <div>
                  <span className="kicker mono">PARTNER GOALS (MUTUAL REVEAL)</span>
                  <h2>{view.peer?.name || 'Partner'}</h2>
                </div>
                <div className="big-pts is-partner display tnum">
                  {peerScore ?? '—'}<small>/{rules.missionMax}</small>
                </div>
              </div>

              {view.result.otherObjectives ? (
                <ul className="goal-result-list">
                  {view.result.otherObjectives.map((item, i) => (
                    <li key={i} className={item.points > 0 ? 'is-hit' : ''}>
                      <span className="hit-icon">{item.points > 0 ? '✓' : '–'}</span>
                      <span>{item.text}</span>
                      <strong className="mono tnum">+{item.points}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="reveal-box">
                  <p>Secret briefs stay private unless both participants opt in to reveal them after the round.</p>
                  <button type="button" className="wise-pill wise-pill-soft" onClick={() => void toggleReveal()}>
                    {view.you.reveal ? 'Permission granted ✓ (waiting for partner)' : 'Share & reveal secret goals'}
                  </button>
                </div>
              )}
            </section>
          </div>
        ) : null}

        {/* Opt-in Leaderboard & Next Actions */}
        <section className="debrief-card debrief-actions-bar">
          {view.result ? (
            <div className="optin-inline">
              <input
                value={callsign}
                onChange={e => setCallsign(e.target.value.slice(0, 24))}
                placeholder="Callsign for leaderboard"
                aria-label="Callsign for leaderboard"
              />
              <button type="button" className="wise-pill wise-pill-soft" disabled={posted} onClick={() => void postScore()}>
                {posted ? 'Posted ✓' : 'Post to standings'}
              </button>
            </div>
          ) : <div />}

          <div className="debrief-cta-group">
            {view.result ? (
              <button type="button" className="wise-pill wise-pill-soft" onClick={() => void requestRematch()}>
                {view.you.rematch ? 'Rematch requested…' : 'Rematch (swap roles)'}
              </button>
            ) : null}
            <button
              type="button"
              className="wise-pill wise-pill-solid"
              onClick={async () => {
                const spar = await startSparring();
                navigate(`/room/${spar.code}`);
              }}
            >
              Play new round →
            </button>
            <Link to="/play" className="wise-pill wise-pill-soft">Hub</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
