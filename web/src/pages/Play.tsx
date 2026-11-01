import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { AppShell } from '../components/AppShell';
import { formatMoney, getRoundHistory, startSparring, syncAccount } from '../lib/api';
import { useToast } from '../providers/ToastProvider';

export default function Play() {
  const root = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [launching, setLaunching] = useState<string | null>(null);
  const [bannerOpen, setBannerOpen] = useState(() => sessionStorage.getItem('playcall-hub-banner') !== 'closed');
  const [history, setHistory] = useState(getRoundHistory);
  const [syncError, setSyncError] = useState('');
  useEffect(() => {
    let active = true;
    let busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        await syncAccount();
        if (active) { setHistory(getRoundHistory()); setSyncError(''); }
      } catch { if (active) setSyncError('Could not refresh saved points. Showing the last saved total.'); }
      finally { busy = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const totalPoints = history.reduce((sum, r) => sum + r.points, 0);
  const confirmedCount = history.filter(r => r.confirmed).length;

  useLayoutEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.from('.hub-anim', {
        y: 26,
        autoAlpha: 0,
        duration: 0.75,
        stagger: 0.06,
        ease: 'expo.out',
      });
    }, el);
    return () => ctx.revert();
  }, []);

  async function quickSpar(role?: 'alex' | 'morgan') {
    if (launching) return;
    setLaunching(role || 'random');
    try {
      const view = await startSparring(role);
      navigate(`/room/${view.code}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not launch round.');
      setLaunching(null);
    }
  }

  return (
    <AppShell>
      <div className="hub" ref={root}>
        {/* Balance / Standing Header (Wise Dashboard style) */}
        <header className="hub-header hub-anim">
          <div className="hub-balance-label">Mission points · Saved rounds</div>
          {syncError ? <p role="status">{syncError}</p> : null}
          <div className="hub-balance-row">
            <h1 className="hub-balance tnum">
              {totalPoints} <span className="hub-unit">PTS</span>
            </h1>
            <Link to="/leaderboard" className="hub-chart-pill" title="View session standings" aria-label="View session standings">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M5 19V11M11 19V5M17 19v-8" />
              </svg>
            </Link>
            {confirmedCount > 0 ? (
              <span className="hub-deals-tag">{confirmedCount} signed {confirmedCount === 1 ? 'deal' : 'deals'}</span>
            ) : null}
          </div>

          <div className="hub-pills">
            <button type="button" className="wise-pill wise-pill-solid" onClick={() => void quickSpar()} disabled={!!launching}>
              {launching === 'random' ? 'Dialing line…' : '🎙️ Instant voice call'}
            </button>
            <Link to="/setup?mode=match" className="wise-pill wise-pill-soft">Stranger call queue</Link>
            <Link to="/setup?mode=create" className="wise-pill wise-pill-soft">Create call room</Link>
            <Link to="/setup?mode=join" className="wise-pill wise-pill-soft">
              Dial room code
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </Link>
          </div>
        </header>

        {/* Two Wise-style Bento Cards */}
        <section className="hub-bento hub-anim" aria-label="Active scenarios and matchmaking">
          {/* Left card: Stacked card-strip + role rows */}
          <article className="bento-account">
            <Link to="/demo" className="bento-cardstack">
              <div className="cardstack-layer l1" aria-hidden="true" />
              <div className="cardstack-layer l2" aria-hidden="true" />
              <div className="cardstack-front">
                <span className="cardstack-count">
                  2 secret roles · SC.001
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </span>
                <span className="cardstack-mark" aria-hidden="true">✦</span>
              </div>
            </Link>

            <div className="bento-account-body">
              <Link to="/setup?mode=sparring" className="bento-title-row">
                <div>
                  <h2>The Satellite Deal</h2>
                  <p className="tnum">$4.50M – $6.00M · 5:00 clock</p>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </Link>

              <div className="bento-currencies">
                <button type="button" className="currency-row" onClick={() => void quickSpar('alex')} disabled={!!launching}>
                  <span className="channel-dot is-you">AV</span>
                  <span className="currency-label">
                    <strong>Alex Vega · Engineer</strong>
                    <small>Target ≥ $5.50M · Month 8</small>
                  </span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </button>

                <button type="button" className="currency-row" onClick={() => void quickSpar('morgan')} disabled={!!launching}>
                  <span className="channel-dot is-them">MR</span>
                  <span className="currency-label">
                    <strong>Morgan Reed · Client</strong>
                    <small>Target ≤ $5.00M · Month 6 demo</small>
                  </span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </button>

                <Link to="/demo" className="currency-row">
                  <span className="channel-dot is-ink">01</span>
                  <span className="currency-label">
                    <strong>Interactive walkthrough</strong>
                    <small>Sample dialogue &amp; deal sandbox</small>
                  </span>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </Link>
              </div>

              <div className="bento-foot">
                <Link to="/setup" className="detail-chip">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M2 14h4M10 8h4M18 16h4" />
                  </svg>
                  Round setup &amp; rules
                </Link>
              </div>
            </div>
          </article>

          {/* Right card: Wise notched action card */}
          <article className="bento-notched">
            <div className="notched-top" aria-hidden="true">
              <span className="notched-cutout" />
            </div>
            <div className="notched-body">
              <h2>Do more in five minutes</h2>
              <p>Get paired anonymously, protect your private brief, and turn tough trade-offs into a mutually confirmed receipt.</p>
              <Link to="/setup" className="plus-circle" aria-label="Configure a new negotiation round">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </Link>
            </div>
          </article>
        </section>

        {/* Dismissible Wise-style update strip */}
        {bannerOpen ? (
          <aside className="hub-banner hub-anim" aria-label="Channel architecture note">
            <div className="hub-banner-art" aria-hidden="true">
              <span className="art-card-blue" />
              <span className="art-card-orange" />
            </div>
            <div className="hub-banner-copy">
              <p>Live two-channel voice calls are active — blue waveforms track your mic, warm orange tracks your caller, and zero cameras ever turn on.</p>
              <Link to="/setup">Open the 4-step call launcher</Link>
            </div>
            <button
              type="button"
              className="hub-banner-close"
              aria-label="Dismiss notice"
              onClick={() => {
                sessionStorage.setItem('playcall-hub-banner', 'closed');
                setBannerOpen(false);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </aside>
        ) : null}

        {/* Recent rounds / Quick channels */}
        <section className="hub-list-section hub-anim" aria-labelledby="hub-list-heading">
          <div className="hub-list-head">
            <h2 id="hub-list-heading">{history.length > 0 ? 'Completed rounds' : 'Ready-to-play channels'}</h2>
            <Link to="/leaderboard">See standings</Link>
          </div>

          <div className="hub-rows">
            {history.length > 0 ? (
              history.slice(0, 6).map(item => (
                <Link key={item.id} to={`/results/${item.code}`} className="hub-row">
                  <span className={`row-badge ${item.role === 'alex' ? 'is-you' : 'is-them'}`}>
                    {item.role === 'alex' ? 'AV' : 'MR'}
                  </span>
                  <span className="row-main">
                    <strong>{item.roleName}</strong>
                    <small>
                      Room {item.code} · {item.confirmed && item.price ? `${formatMoney(item.price)} (${item.packageName})` : 'No confirmed deal'}
                    </small>
                  </span>
                  <span className="row-amount tnum">
                    <strong>+{item.points} PTS</strong>
                    <small>{item.sparring ? 'Sparring' : 'Multiplayer'}</small>
                  </span>
                </Link>
              ))
            ) : (
              <>
                <button type="button" className="hub-row hub-row-btn" onClick={() => void quickSpar()}>
                  <span className="row-badge is-you">🎙️</span>
                  <span className="row-main">
                    <strong>Instant Voice Sparring Call</strong>
                    <small>Hop on an immediate voice call with spoken responses &amp; live captions</small>
                  </span>
                  <span className="row-amount tnum">
                    <strong>60 PTS max</strong>
                    <small>Live audio</small>
                  </span>
                </button>
                <Link to="/setup?mode=create" className="hub-row">
                  <span className="row-badge is-them">2P</span>
                  <span className="row-main">
                    <strong>Two-Player WebRTC Voice Room</strong>
                    <small>Generate a 6-character call code to talk live with a friend or second tab</small>
                  </span>
                  <span className="row-amount tnum">
                    <strong>5:00 call</strong>
                    <small>Peer audio</small>
                  </span>
                </Link>
                <Link to="/demo" className="hub-row">
                  <span className="row-badge is-ink">✦</span>
                  <span className="row-main">
                    <strong>Interactive Demo Walkthrough</strong>
                    <small>Step through sample dialogue and test every price &amp; delivery combination</small>
                  </span>
                  <span className="row-amount tnum">
                    <strong>90s tour</strong>
                    <small>Sample</small>
                  </span>
                </Link>
              </>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
