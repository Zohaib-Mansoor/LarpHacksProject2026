import { FormEvent, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { gsap } from 'gsap';
import { FlowStepperHeader } from '../components/FlowStepperHeader';
import {
  createPrivateRoom,
  getProfile,
  joinRoomByCode,
  requestStrangerMatch,
  saveProfile,
  startSparring,
} from '../lib/api';

type SetupMode = 'sparring' | 'match' | 'create' | 'join';
type RoleChoice = 'random' | 'alex' | 'morgan';

const MODE_LABELS: Record<SetupMode, { title: string; sub: string; tag: string }> = {
  sparring: { title: 'Instant voice sparring call', sub: 'Scripted practice caller · optional browser captions', tag: 'Voice AI' },
  match: { title: 'Anonymous stranger call', sub: 'Live WebRTC audio pairing · server-assigned alias', tag: 'Live 2P' },
  create: { title: 'Private invite call', sub: 'Generates a 6-character call code for a friend or 2nd tab', tag: 'Invite' },
  join: { title: 'Join existing call code', sub: 'Enter a 6-character invite code to dial into a room', tag: 'Dial in' },
};

const ROLE_LABELS: Record<RoleChoice, { title: string; sub: string }> = {
  random: { title: 'Server-assigned secret role', sub: 'Either Alex Vega (Engineer) or Morgan Reed (Client)' },
  alex: { title: 'Alex Vega · Aster Aerospace', sub: 'Goal: close ≥ $5.50M with full build at month 8' },
  morgan: { title: 'Morgan Reed · Meridian Ventures', sub: 'Goal: close ≤ $5.00M with first deliverable by month 6' },
};

export default function Setup() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);

  const initialMode = (['sparring', 'match', 'create', 'join'].includes(params.get('mode') || '')
    ? params.get('mode')
    : 'sparring') as SetupMode;
  const initialRole = (['alex', 'morgan'].includes(params.get('role') || '')
    ? params.get('role')
    : 'random') as RoleChoice;

  const existingProfile = getProfile();
  const [mode, setMode] = useState<SetupMode>(initialMode);
  const [role, setRole] = useState<RoleChoice>(initialRole);
  const [joinCode, setJoinCode] = useState((params.get('code') || '').toUpperCase());
  const [callsign, setCallsign] = useState(existingProfile.callsign);
  const [consent, setConsent] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.from('.flow-row-anim', {
        y: 20,
        autoAlpha: 0,
        duration: 0.65,
        stagger: 0.055,
        ease: 'expo.out',
      });
    }, el);
    return () => ctx.revert();
  }, []);

  const cycleMode = () => {
    const order: SetupMode[] = ['sparring', 'match', 'create', 'join'];
    setMode(order[(order.indexOf(mode) + 1) % order.length]);
    setError('');
  };

  const cycleRole = () => {
    const order: RoleChoice[] = ['random', 'alex', 'morgan'];
    setRole(order[(order.indexOf(role) + 1) % order.length]);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!consent) {
      setError('Confirm you are 13+ and understand ephemeral room processing before starting.');
      return;
    }
    if (mode === 'join' && joinCode.trim().length !== 6) {
      setError('Enter a valid 6-character room code (for example, A1B2C3).');
      return;
    }
    setBusy(true);
    try {
      saveProfile({ callsign: callsign.trim(), ageConfirmed: true });
      const view =
        mode === 'sparring'
          ? await startSparring(role)
          : mode === 'match'
          ? await requestStrangerMatch()
          : mode === 'create'
          ? await createPrivateRoom()
          : await joinRoomByCode(joinCode);
      navigate(`/room/${view.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start round.');
      setBusy(false);
    }
  }

  const badge = role === 'alex' ? 'AV' : role === 'morgan' ? 'MR' : (callsign.slice(0, 2).toUpperCase() || 'PC');

  return (
    <div className="flow-page" ref={root}>
      <FlowStepperHeader step={0} badge={badge} closeTo="/play" />

      <form className="flow-column" onSubmit={onSubmit} noValidate>
        {/* Top Wise amount/clock header */}
        <div className="flow-amount-head flow-row-anim">
          <div>
            <div className="flow-caption">Scenario · The Satellite Deal</div>
            <button type="button" className="flow-currency-pill" onClick={cycleMode}>
              <span className="pill-dot" />
              <span>{MODE_LABELS[mode].tag}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>
          <div className="flow-big-figure display tnum">05:00</div>
        </div>

        {/* Mode quick tabs */}
        <div className="flow-mode-strip flow-row-anim" role="tablist" aria-label="Matchmaking mode">
          {(['sparring', 'match', 'create', 'join'] as SetupMode[]).map(m => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`mode-chip${mode === m ? ' is-selected' : ''}`}
              onClick={() => { setMode(m); setError(''); }}
            >
              {m === 'sparring' ? 'Sparring' : m === 'match' ? 'Stranger' : m === 'create' ? 'Create room' : 'Join code'}
            </button>
          ))}
        </div>

        {/* Wise-style summary rows */}
        <div className="flow-summary-list">
          <div className="flow-summary-row flow-row-anim">
            <span className="summary-circle is-blue" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
                <path d="M7 16 3 12l4-4M3 12h13M17 8l4 4-4 4M21 12H8" />
              </svg>
            </span>
            <div className="summary-text">
              <span className="summary-label">Channel setup</span>
              <strong>{MODE_LABELS[mode].title}</strong>
              <small className="summary-green">{MODE_LABELS[mode].sub}</small>
            </div>
            <button type="button" className="wise-change-pill" onClick={cycleMode}>Change</button>
          </div>

          <div className="flow-summary-row flow-row-anim">
            <span className="summary-circle is-orange" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
                <circle cx="12" cy="8" r="4" /><path d="M5 20a7 7 0 0 1 14 0" />
              </svg>
            </span>
            <div className="summary-text">
              <span className="summary-label">Playing as</span>
              <strong>{mode === 'sparring' ? ROLE_LABELS[role].title : 'Server-assigned secret identity'}</strong>
              <small>{mode === 'sparring' ? ROLE_LABELS[role].sub : 'Creator gets Alex Vega; joiner gets Morgan Reed'}</small>
            </div>
            {mode === 'sparring' ? (
              <button type="button" className="wise-change-pill" onClick={cycleRole}>Switch</button>
            ) : null}
          </div>

          <div className="flow-summary-row flow-row-anim">
            <span className="summary-circle is-outline" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
                <path d="M13 2 4 14h7l-1 8 9-12h-7Z" />
              </svg>
            </span>
            <div className="summary-text">
              <span className="summary-label">Starts</span>
              <strong>Today — in seconds</strong>
              <small>45s private brief, then 5:00 negotiation clock</small>
            </div>
            <Link to="/demo" className="wise-change-pill">Sample</Link>
          </div>

          <div className="flow-summary-row flow-row-anim">
            <span className="summary-circle is-outline" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
                <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 9h6M9 13h6" />
              </svg>
            </span>
            <div className="summary-text">
              <span className="summary-label">Audio &amp; camera privacy</span>
              <strong>Live voice call + captions — zero cameras</strong>
              <small>Microphone only (mute anytime) · camera hardware blocked</small>
            </div>
          </div>
        </div>

        {mode === 'join' ? (
          <div className="flow-input-block flow-row-anim">
            <label htmlFor="join-code-input">6-character room code</label>
            <input
              id="join-code-input"
              className="mono code-input"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="A1B2C3"
              maxLength={6}
              autoComplete="off"
              spellCheck={false}
              required
            />
          </div>
        ) : null}

        <div className="flow-input-block flow-row-anim">
          <label htmlFor="callsign-input">Leaderboard callsign (optional — never shown to partner)</label>
          <input
            id="callsign-input"
            value={callsign}
            onChange={e => setCallsign(e.target.value.slice(0, 24))}
            placeholder="BLUE-FALCON-01"
            autoComplete="off"
          />
        </div>

        <label className="flow-consent flow-row-anim">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
          <span>
            I am 13 or older and understand the <Link to="/privacy">processing details</Link> — messages and deals are saved. Voice is live, not recorded; captions are optional.
          </span>
        </label>

        {error ? <div className="notice notice-danger flow-row-anim" role="alert">{error}</div> : null}

        <button type="submit" className="wise-cta-wide flow-row-anim" disabled={busy}>
          {busy ? 'Opening channel…' : mode === 'join' ? 'Join room' : 'Continue to brief'}
        </button>
      </form>
    </div>
  );
}
