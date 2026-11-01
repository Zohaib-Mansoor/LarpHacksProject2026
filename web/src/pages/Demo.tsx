import { useGameConfig } from '../providers/GameConfigProvider';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FlowStepperHeader } from '../components/FlowStepperHeader';
import { OfferSheet } from '../components/OfferSheet';
import { DealProposal, formatMoney, startSparring } from '../lib/api';

export default function Demo() {
  const { scenario, rules, packages: DEMO_PACKAGES, demo: {lines: DEMO_LINES} } = useGameConfig();
  const navigate = useNavigate();
  const [lineCount, setLineCount] = useState(2);
  const [deal, setDeal] = useState<DealProposal>({ price: rules.defaultPrice, package: rules.defaultPackage, proposer: 'alex' });
  const [rev, setRev] = useState(1);
  const [alexOk, setAlexOk] = useState(true);
  const [morganOk, setMorganOk] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);

  const bothSigned = alexOk && morganOk;
  const [scores, setScores] = useState<Record<string, number[]>>({alex: [], morgan: []});
  const [scoreError, setScoreError] = useState('');
  useEffect(() => { const controller = new AbortController(); setScores({alex: [], morgan: []}); void fetch('/api/vc/preview', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({deal, confirmed: bothSigned}), signal: controller.signal}).then(async r => {if (!r.ok) throw Error('Score preview unavailable'); setScores((await r.json()).scores); setScoreError('');}).catch(e => {if (!controller.signal.aborted) setScoreError(e.message);}); return () => controller.abort(); }, [deal, bothSigned]);
  const pkg = DEMO_PACKAGES.find(p => p.id === deal.package)!;

  return (
    <div className="flow-page">
      <FlowStepperHeader step={bothSigned ? 3 : 2} badge="DM" closeTo="/play" />

      <div className="stage-shell">
        {scoreError ? <p role="alert">{scoreError}</p> : null}
        <aside className="demo-tag-banner">
          <div>
            <span className="demo-pill-badge">CALL SANDBOX</span>
            <span>Rules walkthrough &amp; server-calculated deal arithmetic — test any price ({formatMoney(rules.prices[0])}–{formatMoney(rules.prices.at(-1)!)}) before hopping on a real voice call.</span>
          </div>
          <button
            type="button"
            className="wise-pill wise-pill-solid"
            onClick={async () => {
              const room = await startSparring();
              navigate(`/room/${room.code}`);
            }}
          >
            🎙️ Hop on live call →
          </button>
        </aside>

        <div className="stage-grid">
          <aside className="stage-side">
            <div className="party-card is-you">
              <div className="party-tag">FIRST ROLE</div>
              <strong>{scenario.roles[0].name} · {scenario.roles[0].role}</strong>
              <ul className="mini-goal-list">
                {['Agreement', 'Price objective', 'Schedule objective'].map((g, i) => (
                  <li key={i} className={scores.alex[i] > 0 ? 'hit' : ''}>
                    <span>{g}</span>
                    <b className="mono tnum">{bothSigned ? `+${scores.alex[i]}` : `+${rules.objectivePoints}`}</b>
                  </li>
                ))}
              </ul>
            </div>

            <div className="party-card is-them">
              <div className="party-tag">SECOND ROLE</div>
              <strong>{scenario.roles[1].name} · {scenario.roles[1].role}</strong>
              <ul className="mini-goal-list">
                {['Agreement', 'Price objective', 'Schedule objective'].map((g, i) => (
                  <li key={i} className={scores.morgan[i] > 0 ? 'hit' : ''}>
                    <span>{g}</span>
                    <b className="mono tnum">{bothSigned ? `+${scores.morgan[i]}` : `+${rules.objectivePoints}`}</b>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <section className="stage-console">
            <div className="chat-stream">
              {DEMO_LINES.slice(0, lineCount).map(m => (
                <div key={m.id} className={`chat-bubble ${m.speaker === 'alex' ? 'is-you' : 'is-them'}`}>
                  <div className="bubble-meta">
                    <span>{scenario.roles.find(r => r.id === m.speaker)?.name}</span>
                    <time className="mono tnum">{m.time}</time>
                  </div>
                  <p>{m.text}</p>
                </div>
              ))}
              {lineCount < DEMO_LINES.length ? (
                <button type="button" className="wise-pill wise-pill-soft" style={{ alignSelf: 'flex-start' }} onClick={() => setLineCount(c => c + 1)}>
                  Reveal next walkthrough line ({lineCount}/{DEMO_LINES.length}) →
                </button>
              ) : null}
            </div>

            <div className="deal-shelf">
              <div className="deal-shelf-main">
                <div>
                  <div className="kicker mono" style={{ marginBottom: 4 }}>SHARED OFFER · REVISION #{rev}</div>
                  <div className="deal-current">
                    <span className="deal-price display tnum">{formatMoney(deal.price)}</span>
                    <span className="deal-pkg">{pkg.name} — {pkg.detail}</span>
                  </div>
                </div>
                <div className="deal-shelf-buttons">
                  <button type="button" className="wise-pill wise-pill-soft" onClick={() => setOfferOpen(true)}>
                    Adjust price / package
                  </button>
                  <button type="button" className={`wise-pill ${alexOk ? 'wise-pill-confirm' : 'wise-pill-soft'}`} onClick={() => setAlexOk(v => !v)}>
                    {alexOk ? `✓ ${scenario.roles[0].short} signed` : `Sign as ${scenario.roles[0].short}`}
                  </button>
                  <button type="button" className={`wise-pill ${morganOk ? 'wise-pill-orange' : 'wise-pill-soft'}`} onClick={() => setMorganOk(v => !v)}>
                    {morganOk ? `✓ ${scenario.roles[1].short} signed` : `Sign as ${scenario.roles[1].short}`}
                  </button>
                </div>
              </div>

              {bothSigned ? (
                <div className="receipt" style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>SIGNED DEMO RECEIPT</span>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>
                        {scenario.roles[0].short} earns {scores.alex.reduce((a, b) => a + b, 0)}/{rules.missionMax} pts · {scenario.roles[1].short} earns {scores.morgan.reduce((a, b) => a + b, 0)}/{rules.missionMax} pts
                      </div>
                    </div>
                    <Link to="/setup?mode=sparring" className="wise-pill wise-pill-solid">Start real round →</Link>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
                  Toggle both signatures above to see the signed receipt and mission arithmetic. Editing terms resets confirmations.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      <OfferSheet
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        packages={DEMO_PACKAGES}
        initialPrice={deal.price}
        initialPackage={deal.package}
        roleId="alex"
        onSubmit={next => {
          setDeal({ ...next, proposer: 'alex' });
          setRev(r => r + 1);
          setAlexOk(false);
          setMorganOk(false);
          setOfferOpen(false);
        }}
      />
    </div>
  );
}
