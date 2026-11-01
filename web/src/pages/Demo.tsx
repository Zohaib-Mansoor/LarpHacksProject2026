import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FlowStepperHeader } from '../components/FlowStepperHeader';
import { OfferSheet } from '../components/OfferSheet';
import { DEMO_LINES, DEMO_PACKAGES, DealProposal, formatMoney, scoreDemoDeal, startSparring } from '../lib/api';

const ALEX_GOALS = ['Close a mutually confirmed deal', 'Agree a price of at least $5.50M', 'Deliver the full prototype at month 8'];
const MORGAN_GOALS = ['Close a mutually confirmed deal', 'Agree a price of at most $5.00M', 'Receive a first deliverable by month 6'];

export default function Demo() {
  const navigate = useNavigate();
  const [lineCount, setLineCount] = useState(2);
  const [deal, setDeal] = useState<DealProposal>({ price: 525, package: 'phased', proposer: 'alex' });
  const [rev, setRev] = useState(1);
  const [alexOk, setAlexOk] = useState(true);
  const [morganOk, setMorganOk] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);

  const bothSigned = alexOk && morganOk;
  const scores = scoreDemoDeal(deal, bothSigned);
  const pkg = DEMO_PACKAGES.find(p => p.id === deal.package)!;

  return (
    <div className="flow-page">
      <FlowStepperHeader step={bothSigned ? 3 : 2} badge="DM" closeTo="/play" />

      <div className="stage-shell">
        <aside className="demo-tag-banner">
          <div>
            <span className="demo-pill-badge">CALL SANDBOX</span>
            <span>Sample call transcript &amp; live deal arithmetic — test any price ($4.50M–$6.00M) before hopping on a real voice call.</span>
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
              <div className="party-tag">SAMPLE PLAYER A · BLUE</div>
              <strong>Alex Vega · Aerospace engineer</strong>
              <ul className="mini-goal-list">
                {ALEX_GOALS.map((g, i) => (
                  <li key={i} className={scores.alex[i] > 0 ? 'hit' : ''}>
                    <span>{g}</span>
                    <b className="mono tnum">{bothSigned ? `+${scores.alex[i]}` : '+20'}</b>
                  </li>
                ))}
              </ul>
            </div>

            <div className="party-card is-them">
              <div className="party-tag">SAMPLE PLAYER B · ORANGE</div>
              <strong>Morgan Reed · Venture client</strong>
              <ul className="mini-goal-list">
                {MORGAN_GOALS.map((g, i) => (
                  <li key={i} className={scores.morgan[i] > 0 ? 'hit' : ''}>
                    <span>{g}</span>
                    <b className="mono tnum">{bothSigned ? `+${scores.morgan[i]}` : '+20'}</b>
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
                    <span>{m.speaker === 'alex' ? 'Alex Vega' : 'Morgan Reed'}</span>
                    <time className="mono tnum">{m.time}</time>
                  </div>
                  <p>{m.text}</p>
                </div>
              ))}
              {lineCount < DEMO_LINES.length ? (
                <button type="button" className="wise-pill wise-pill-soft" style={{ alignSelf: 'flex-start' }} onClick={() => setLineCount(c => c + 1)}>
                  Reveal next sample line ({lineCount}/{DEMO_LINES.length}) →
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
                    {alexOk ? '✓ Alex signed' : 'Sign as Alex'}
                  </button>
                  <button type="button" className={`wise-pill ${morganOk ? 'wise-pill-orange' : 'wise-pill-soft'}`} onClick={() => setMorganOk(v => !v)}>
                    {morganOk ? '✓ Morgan signed' : 'Sign as Morgan'}
                  </button>
                </div>
              </div>

              {bothSigned ? (
                <div className="receipt" style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <span className="mono" style={{ fontSize: 11, opacity: 0.7 }}>SIGNED DEMO RECEIPT</span>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>
                        Alex earns {scores.alex.reduce((a, b) => a + b, 0)}/60 pts · Morgan earns {scores.morgan.reduce((a, b) => a + b, 0)}/60 pts
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
