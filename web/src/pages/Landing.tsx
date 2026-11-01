import { useGameConfig } from '../providers/GameConfigProvider';
import { formatMoney } from '../lib/api';
import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import '../styles/landing.css';

gsap.registerPlugin(ScrollTrigger);

/* ------------------------------------------------------------------ */
/* Content                                                            */
/* ------------------------------------------------------------------ */

const STEPS = [
  { n: '01', title: 'Dial a stranger', body: 'Invite another player. Your account usernames identify each participant.', tone: 'sky', icon: 'match' },
  { n: '02', title: 'Take your brief', body: 'A secret identity and three objectives. Your brief stays private — the other caller never sees it.', tone: 'navy', icon: 'brief' },
  { n: '03', title: 'Talk & trade live', body: 'Alternating timed speaking turns with optional captions. Pitch, counter, revise — zero cameras.', tone: 'orange', icon: 'call' },
  { n: '04', title: 'Sign the receipt', body: 'Both confirm the same revision on the call and the deal condenses into a signed receipt.', tone: 'paper', icon: 'receipt' },
] as const;
const MARQUEE = ['Live voice call', 'Zero cameras', 'Timed turns', 'Secret roles', 'Close the deal', 'Private objectives', 'One stranger'];



/* ------------------------------------------------------------------ */
/* Small pieces                                                       */
/* ------------------------------------------------------------------ */

/** Splits text into masked words so GSAP can lift each one into view. */
function Words({ text, className = '' }: { text: string; className?: string }) {
  return (
    <>
      {text.split(' ').map((w, i, all) => (
        <Fragment key={i}>
          <span className={`w ${className}`}><span className="wi">{w}</span></span>
          {i < all.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </>
  );
}

function StepIcon({ kind }: { kind: (typeof STEPS)[number]['icon'] }) {
  const common = { width: 56, height: 56, viewBox: '0 0 56 56', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (kind) {
    case 'match':
      return <svg {...common}><circle cx="18" cy="28" r="9" fill="var(--electric)" stroke="none" /><circle cx="38" cy="28" r="9" fill="var(--partner)" stroke="none" /><path d="M24 28h8" /></svg>;
    case 'brief':
      return <svg {...common}><rect x="12" y="8" width="32" height="40" rx="5" /><path d="M19 19h18M19 27h18M19 35h10" /><circle cx="40" cy="42" r="7" fill="var(--electric)" stroke="none" /></svg>;
    case 'call':
      return (
        <svg {...common}>
          <rect x="21" y="9" width="14" height="22" rx="7" />
          <path d="M13 24v3a15 15 0 0 0 30 0v-3M28 42v6M21 48h14" />
        </svg>
      );
    case 'receipt':
      return <svg {...common}><path d="M14 6h28v44l-5-3-4 3-5-3-5 3-4-3-5 3Z" /><path d="M20 18h16M20 26h16" /><path d="m21 36 4 4 9-9" stroke="var(--confirm)" /></svg>;
  }
}

/** Wise-inspired dark outer showcase card housing a crisp white live-animated stage. */
function DemoRound() {
  const {scenario, rules} = useGameConfig();
  return (
    <div className="demo-showcase" aria-label="Example voice call round, illustrated">
      <div className="demo-showcase-top">
        <div>
          <h2 className="demo-showcase-title">Live anonymous voice calls, zero cameras</h2>
          <p className="demo-showcase-copy">
            Take {rules.turnSeconds}-second speaking turns for a {formatMoney(rules.prices[0])}–{formatMoney(rules.prices.at(-1)!)} contract. Both callers confirm the same revision to mint the receipt.{' '}
            <Link to="/demo">Try the call sandbox</Link>
          </p>
        </div>
        <Link to="/setup?mode=sparring" className="wise-showcase-pill">🎙️ Hop on live call →</Link>
      </div>

      <div className="demo">
        <div className="demo-bar">
          <div className="demo-bar-left">
            <span className="live-dot" aria-hidden="true" />
            <span className="demo-room mono">ILLUSTRATED EXAMPLE · NOT A LIVE ROOM</span>
          </div>
          <div className="demo-clock" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="16" className="ring-track" />
              <circle cx="20" cy="20" r="16" className="ring-fill" pathLength={100} />
            </svg>
            <span className="demo-time tnum mono">{rules.turnSeconds}s</span>
          </div>
        </div>

        {/* Live two-caller voice stage strip */}
        <div className="demo-callers" aria-hidden="true">
          <div className="demo-caller is-you">
            <span className="demo-orb is-you">You</span>
            <div className="demo-caller-meta">
              <strong>You</strong>
              <small>Your microphone</small>
            </div>
            <div className="demo-wave is-you">
              <i /><i /><i /><i /><i /><i />
            </div>
          </div>

          <div className="demo-caller is-them">
            <span className="demo-orb is-them">Peer</span>
            <div className="demo-caller-meta">
              <strong>Your partner</strong>
              <small>Partner microphone</small>
            </div>
            <div className="demo-wave is-them">
              <i /><i /><i /><i /><i /><i />
            </div>
          </div>
        </div>

        <div className="demo-body">
          <div className="demo-feed">
            <div className="msg them" data-step><span className="who">🔊 Partner · Example dialogue</span>“Our investor showcase is at month 6 — $5.00M is our target cap.”</div>
            <div className="msg you" data-step><span className="who">🎙️ You</span>“How about a live demo at month 6 and the full satellite at month 8?”</div>
            <div className="msg them" data-step><span className="who">🔊 Partner · Example dialogue</span>“Staged delivery works! Meet at $5.25M and I’ll sign right now.”</div>
            <div className="proposal" data-step>
              <div className="proposal-head mono">SHARED PROPOSAL · REV 2</div>
              <div className="proposal-terms">
                <span>$5.25M</span><span>Demo @ M6</span><span>Full @ M8</span>
              </div>
              <div className="proposal-acc">
                <span className="acc acc-you" data-acc>✓ You</span>
                <span className="acc acc-them" data-acc>✓ Partner</span>
              </div>
            </div>
            <div className="typing" aria-hidden="true"><i /><i /><i /></div>
            <div className="stamp display" aria-hidden="true">Deal signed</div>
          </div>

          <aside className="dossier">
            <div className="dossier-eyebrow mono">YOUR PRIVATE BRIEF</div>
            <div className="dossier-role">The Engineer</div>
            <ul className="objectives">
              <li data-obj><span className="tick" />Close a confirmed deal (+{rules.objectivePoints})</li>
              <li data-obj><span className="tick" />Meet your private schedule target (+{rules.objectivePoints})</li>
              <li data-obj><span className="tick" />Meet your private price target (+{rules.objectivePoints})</li>
            </ul>
            <p className="dossier-note">Eyes only — partner never sees this.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

export default function Landing() {
  const {scenario, rules} = useGameConfig();
  const availableRoles = [{role: scenario.roles[0].role, vs: `vs. ${scenario.roles[1].role}`, line: scenario.title, tone: "electric", live: true}];
  const root = useRef<HTMLDivElement>(null);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const mm = gsap.matchMedia(el);

    mm.add(
      { motion: '(prefers-reduced-motion: no-preference)', desktop: '(min-width: 900px)', fine: '(pointer: fine)' },
      ctx => {
        const { motion, desktop, fine } = ctx.conditions as Record<string, boolean>;
        if (!motion) return;

        /* ---------- Scroll progress ---------- */
        gsap.to(q('.progress'), { scaleX: 1, ease: 'none', scrollTrigger: { start: 0, end: 'max', scrub: 0.3 } });

        /* ---------- Hero intro ---------- */
        const intro = gsap.timeline({ defaults: { ease: 'expo.out' }, delay: 0.1 });
        intro
          .from(q('.hero-eyebrow'), { y: 24, autoAlpha: 0, duration: 0.9 })
          .from(q('.hero-title .wi'), { yPercent: 118, rotate: 7, duration: 1.3, stagger: 0.055 }, 0.1)
          .from(q('.hero-sub'), { y: 28, autoAlpha: 0, duration: 1.1 }, 0.55)
          .from(q('.hero-ctas > *'), { y: 28, autoAlpha: 0, duration: 1.1, stagger: 0.08 }, 0.65)
          .from(q('.chip'), { scale: 0, rotate: -40, autoAlpha: 0, duration: 1.2, stagger: 0.12, ease: 'back.out(2.2)' }, 0.6)
          .from(q('.demo-showcase'), { y: 180, autoAlpha: 0, rotateX: 14, duration: 1.5 }, 0.52)
          .from(q('.orbit'), { autoAlpha: 0, scale: 0.85, duration: 2 }, 0.2);

        gsap.to(q('.chip'), { y: '+=16', rotate: '+=6', duration: 2.6, ease: 'sine.inOut', yoyo: true, repeat: -1, stagger: { each: 0.5, from: 'random' } });

        gsap.to(q('.hero-copy'), { yPercent: -22, autoAlpha: 0.15, ease: 'none', scrollTrigger: { trigger: q('.hero')[0], start: 'top top', end: 'bottom top', scrub: true } });
        gsap.fromTo(q('.demo-wrap'), { scale: 0.9 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: q('.demo-wrap')[0], start: 'top bottom', end: 'center 60%', scrub: true } });

        /* ---------- Mouse parallax on chips ---------- */
        if (fine) {
          const hero = q('.hero')[0] as HTMLElement;
          const movers = q('.chip-wrap').map(c => ({
            x: gsap.quickTo(c, 'x', { duration: 0.9, ease: 'power3' }),
            y: gsap.quickTo(c, 'y', { duration: 0.9, ease: 'power3' }),
            d: Number((c as HTMLElement).dataset.depth ?? 1),
          }));
          const onMove = (e: PointerEvent) => {
            const r = hero.getBoundingClientRect();
            const nx = (e.clientX - r.left) / r.width - 0.5;
            const ny = (e.clientY - r.top) / r.height - 0.5;
            movers.forEach(m => { m.x(nx * 60 * m.d); m.y(ny * 40 * m.d); });
          };
          hero.addEventListener('pointermove', onMove);
          ctx.add(() => () => hero.removeEventListener('pointermove', onMove));
        }

        /* ---------- Demo round loop ---------- */
        const steps = q('.demo [data-step]');
        const accs = q('.demo [data-acc]');
        const objs = q('.demo [data-obj]');
        const typing = q('.demo .typing');
        const stamp = q('.demo .stamp');
        const time = q('.demo-time')[0];
        const ring = q('.ring-fill')[0];
        const clock = { s: rules.turnSeconds };
        const paint = () => {
          const s = Math.max(0, Math.round(clock.s));
          time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
          ring.setAttribute('stroke-dashoffset', String(100 - (s / rules.turnSeconds) * 100));
        };

        gsap.set([...steps, typing, stamp], { autoAlpha: 0, y: 18 });
        gsap.set(accs, { autoAlpha: 0, scale: 0.6 });
        gsap.set(stamp, { scale: 2.4, rotate: -14, y: 0 });

        const loop = gsap.timeline({ repeat: -1, repeatDelay: 0.6, delay: 1.6, onRepeat: () => { clock.s = rules.turnSeconds; } });
        const say = (target: Element, at?: string | number) => {
          loop.to(typing, { autoAlpha: 1, y: 0, duration: 0.3 }, at)
            .to(typing, { autoAlpha: 0, duration: 0.2 }, '+=0.9')
            .to(target, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'back.out(1.8)' }, '<');
        };
        const tick = (i: number) => () => objs[i].classList.add('done');
        loop.to(clock, { s: 188, duration: 9.4, ease: 'none', onUpdate: paint }, 0);
        say(steps[0], 0.2);
        say(steps[1]);
        say(steps[2]);
        loop.call(tick(1), [], '<+0.3')
          .to(steps[3], { autoAlpha: 1, y: 0, duration: 0.7, ease: 'expo.out' }, '+=0.4')
          .call(tick(0), [], '<+0.3')
          .call(tick(2), [], '+=0.3')
          .to(accs[0], { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(3)' }, '+=0.5')
          .to(accs[1], { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(3)' }, '+=0.7')
          .to(stamp, { autoAlpha: 1, scale: 1, rotate: -8, duration: 0.55, ease: 'back.out(2)' }, '+=0.25')
          .to(q('.demo'), { x: 6, duration: 0.05, yoyo: true, repeat: 5, ease: 'none' }, '<+0.15')
          .to({}, { duration: 2.4 })
          .to([...steps, stamp], { autoAlpha: 0, y: -12, duration: 0.5, stagger: 0.04 })
          .set(accs, { autoAlpha: 0, scale: 0.6 })
          .set(stamp, { scale: 2.4, rotate: -14, y: 0 })
          .set(steps, { y: 18 })
          .call(() => objs.forEach(o => o.classList.remove('done')));

        // Only spend frames on the loop while it's on screen.
        ScrollTrigger.create({ trigger: q('.demo')[0], start: 'top bottom', end: 'bottom top', onToggle: s => (s.isActive ? loop.resume() : loop.pause()) });

        /* ---------- Marquee (velocity reactive) ---------- */
        const track = q('.marquee-track')[0];
        const marquee = gsap.to(track, { xPercent: -50, duration: 28, ease: 'none', repeat: -1 });
        let dir = 1;
        let boost: gsap.core.Timeline | null = null;
        ScrollTrigger.create({
          start: 0, end: 'max',
          onUpdate: self => {
            const v = self.getVelocity();
            if (v !== 0) dir = v > 0 ? 1 : -1;
            boost?.kill();
            boost = gsap.timeline()
              .to(marquee, { timeScale: dir * (1 + Math.min(Math.abs(v) / 300, 6)), duration: 0.2 })
              .to(marquee, { timeScale: dir, duration: 1.2, ease: 'power2.out' });
          },
        });
        gsap.fromTo(q('.marquee'), { rotate: -3 }, { rotate: 2, ease: 'none', scrollTrigger: { trigger: q('.marquee')[0], start: 'top bottom', end: 'bottom top', scrub: true } });

        /* ---------- Heading word reveals ---------- */
        q('.reveal').forEach(h => {
          gsap.from(h.querySelectorAll('.wi'), {
            yPercent: 115, rotate: 5, duration: 1.1, ease: 'expo.out', stagger: 0.05,
            scrollTrigger: { trigger: h, start: 'top 85%' },
          });
        });
        q('.fade-up').forEach(n => {
          gsap.from(n, { y: 40, autoAlpha: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: n, start: 'top 88%' } });
        });

        /* ---------- Stacking step cards ---------- */
        const cards = q('.step-card');
        cards.forEach((card, i) => {
          gsap.from(card.querySelectorAll('.step-num, .step-title, .step-body, .step-icon'), {
            y: 50, autoAlpha: 0, duration: 1, stagger: 0.07, ease: 'expo.out',
            scrollTrigger: { trigger: card, start: 'top 75%' },
          });
          if (i === cards.length - 1 || !desktop) return;
          gsap.to(card, {
            scale: 0.9 + i * 0.025, rotate: i % 2 ? 1.2 : -1.2, ease: 'none', transformOrigin: '50% 0%',
            scrollTrigger: { trigger: cards[i + 1], start: 'top bottom', end: 'top 30%', scrub: true },
          });
        });

        /* ---------- Counters ---------- */
        q('[data-count]').forEach(n => {
          const to = Number((n as HTMLElement).dataset.count);
          const isClock = (n as HTMLElement).dataset.format === 'clock';
          const o = { v: 0 };
          gsap.to(o, {
            v: to, duration: 2, ease: 'power3.out',
            scrollTrigger: { trigger: n, start: 'top 85%' },
            onUpdate: () => {
              const v = Math.round(o.v);
              n.textContent = isClock ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : String(v);
            },
          });
        });
        gsap.from(q('.stat'), { y: 60, autoAlpha: 0, duration: 1.1, ease: 'expo.out', stagger: 0.1, scrollTrigger: { trigger: q('.stats-grid')[0], start: 'top 80%' } });

        /* ---------- Roles: pinned horizontal scroll ---------- */
        if (desktop) {
          const rTrack = q('.roles-track')[0] as HTMLElement;
          const dist = () => rTrack.scrollWidth - window.innerWidth + 64;
          const h = gsap.to(rTrack, {
            x: () => -dist(), ease: 'none',
            scrollTrigger: { trigger: q('.roles')[0], pin: true, start: 'top top', end: () => `+=${dist()}`, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 },
          });
          q('.role-card').forEach((c, i) => {
            gsap.from(c, {
              y: 120, rotate: i % 2 ? 10 : -10, ease: 'none',
              scrollTrigger: { trigger: c, containerAnimation: h, start: 'left 100%', end: 'left 55%', scrub: true },
            });
          });
          gsap.to(q('.roles-progress i'), { scaleX: 1, ease: 'none', scrollTrigger: { trigger: q('.roles')[0], start: 'top top', end: () => `+=${dist()}`, scrub: true } });
        }

        /* ---------- CTA circle reveal ---------- */
        gsap.fromTo(q('.cta-circle'), { clipPath: 'circle(6% at 50% 60%)' }, {
          clipPath: 'circle(80% at 50% 50%)', ease: 'none',
          scrollTrigger: { trigger: q('.cta')[0], start: 'top 85%', end: 'center 55%', scrub: true },
        });
        gsap.from(q('.cta-title .ch'), {
          yPercent: 120, rotate: 12, scale: 0.6, stagger: 0.04, ease: 'none',
          scrollTrigger: { trigger: q('.cta')[0], start: 'top 60%', end: 'center 55%', scrub: true },
        });

        /* ---------- Footer wordmark ---------- */
        gsap.from(q('.foot-mark .ch'), {
          yPercent: 100, stagger: 0.05, duration: 1.2, ease: 'expo.out',
          scrollTrigger: { trigger: q('.foot-mark')[0], start: 'top 95%' },
        });

        /* ---------- Magnetic buttons ---------- */
        if (fine) {
          q('.magnetic').forEach(b => {
            const xTo = gsap.quickTo(b, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
            const yTo = gsap.quickTo(b, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
            const move = (e: PointerEvent) => {
              const r = b.getBoundingClientRect();
              xTo((e.clientX - (r.left + r.width / 2)) * 0.3);
              yTo((e.clientY - (r.top + r.height / 2)) * 0.4);
            };
            const leave = () => { xTo(0); yTo(0); };
            b.addEventListener('pointermove', move as EventListener);
            b.addEventListener('pointerleave', leave);
            ctx.add(() => () => { b.removeEventListener('pointermove', move as EventListener); b.removeEventListener('pointerleave', leave); });
          });
        }
      },
    );

    // Fonts change line metrics; re-measure pinned sections once they land.
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => mm.revert();
  }, []);

  return (
    <div className="landing" ref={root}>
      <div className="progress" aria-hidden="true" />

      {/* ============================== HERO ============================== */}
      <section className="hero" aria-labelledby="landing-headline">
        <svg className="orbit" viewBox="0 0 1200 520" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
          <ellipse id="orbit-path" cx="600" cy="260" rx="560" ry="220" fill="none" />
          <circle r="11" className="orbit-you">
            {!reduced && <animateMotion dur="22s" repeatCount="indefinite" path="M40,260 a560,220 0 1,0 1120,0 a560,220 0 1,0 -1120,0" />}
          </circle>
          <circle r="11" className="orbit-them">
            {!reduced && <animateMotion dur="22s" begin="-11s" repeatCount="indefinite" path="M40,260 a560,220 0 1,0 1120,0 a560,220 0 1,0 -1120,0" />}
          </circle>
        </svg>

        <div className="chip-wrap c1" data-depth="1.4" aria-hidden="true"><span className="chip chip-you">🎙️ You</span></div>
        <div className="chip-wrap c2" data-depth="-1" aria-hidden="true"><span className="chip chip-them">🔊 Caller</span></div>
        <div className="chip-wrap c3" data-depth="0.8" aria-hidden="true"><span className="chip chip-clock mono">{rules.turnSeconds}s</span></div>
        <div className="chip-wrap c4" data-depth="-1.6" aria-hidden="true"><span className="chip chip-deal">$ Deal?</span></div>

        <div className="hero-copy">
          <p className="hero-eyebrow"><span className="dot" />Live voice-call negotiation game · 13+</p>
          <h1 id="landing-headline" className="hero-title display">
            <span className="line"><Words text="Hop on a call." /></span>
            <span className="line"><Words text="Close the deal." /></span>
          </h1>
          <p className="hero-sub">Zero cameras. Get dealt a secret role, talk live on an anonymous call with timed speaking turns, and lock in a signed receipt before the clock runs out.</p>
          <div className="hero-ctas">
            <Link to="/play" className="btn btn-primary btn-lg magnetic">Open Command Hub <span className="arrow">→</span></Link>
            <Link to="/setup?mode=sparring" className="btn btn-secondary btn-lg">🎙️ Instant voice call</Link>
          </div>
        </div>

        <div className="demo-wrap">
          <DemoRound />
        </div>
      </section>

      {/* ============================ MARQUEE ============================= */}
      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[0, 1].map(k => (
            <div className="marquee-group" key={k}>
              {MARQUEE.map(m => (<span key={m} className="display">{m}<i>✦</i></span>))}
            </div>
          ))}
        </div>
      </div>

      {/* ========================= HOW IT WORKS ========================== */}
      <section id="how-it-works" className="how" aria-labelledby="how-heading">
        <div className="how-inner">
          <div className="how-side">
            <p className="kicker mono fade-up">HOW A ROUND WORKS</p>
            <h2 id="how-heading" className="display section-title reveal"><Words text="Four steps." /><br /><Words text="Zero small talk." /></h2>
            <p className="section-lede fade-up">One job per screen. The clock is the only thing that moves.</p>
            <Link to="/play" className="btn btn-primary btn-lg magnetic fade-up">Find a match <span className="arrow">→</span></Link>
          </div>
          <ol className="steps-cards">
            {STEPS.map((s, i) => (
              <li key={s.n} className={`step-card tone-${s.tone}`} style={{ ['--i' as string]: i }}>
                <div className="step-top">
                  <span className="step-num display">{s.n}</span>
                  <span className="step-icon"><StepIcon kind={s.icon} /></span>
                </div>
                <div>
                  <h3 className="step-title display">{s.title}</h3>
                  <p className="step-body">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ============================= STATS ============================= */}
      <section className="stats" aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="display section-title reveal center"><Words text="The rules fit on a napkin." /></h2>
        <div className="stats-grid">
          <div className="stat"><span className="stat-num display tnum" data-count={rules.talkSeconds} data-format="clock">{Math.floor(rules.talkSeconds / 60)}:{String(rules.talkSeconds % 60).padStart(2, "0")}</span><span className="stat-label">on the clock</span></div>
          <div className="stat"><span className="stat-num display tnum" data-count={scenario.roles.length}>{scenario.roles.length}</span><span className="stat-label">anonymous strangers</span></div>
          <div className="stat"><span className="stat-num display tnum" data-count={rules.missionMax / rules.objectivePoints}>{rules.missionMax / rules.objectivePoints}</span><span className="stat-label">secret objectives each</span></div>
          <div className="stat stat-zero"><span className="stat-num display tnum">0</span><span className="stat-label">cameras. Ever.</span></div>
        </div>
      </section>

      {/* ============================= ROLES ============================= */}
      <section id="roles" className="roles" aria-labelledby="roles-heading">
        <div className="roles-head">
          <p className="kicker mono">EXAMPLE SCENARIOS</p>
          <h2 id="roles-heading" className="display section-title reveal"><Words text="Pick a side." /><br /><Words text="Guess theirs." /></h2>
          <div className="roles-progress" aria-hidden="true"><i /></div>
        </div>
        <div className="roles-viewport">
          <ul className="roles-track">
            {availableRoles.map(r => (
              <li key={r.role} className={`role-card tone-${r.tone}`}>
                <span className="role-eyebrow mono">{r.live ? 'SC. 001 · PLAYABLE NOW' : 'SCENARIO ARCHETYPE'}</span>
                <h3 className="role-name display">{r.role}</h3>
                <span className="role-vs">{r.vs}</span>
                <p className="role-line">{r.line}</p>
                {r.live ? (
                  <Link to="/setup?mode=sparring" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start', marginTop: 8 }}>
                    Launch {scenario.id} →
                  </Link>
                ) : null}
                <span className="role-seal" aria-hidden="true">✦</span>
              </li>
            ))}
            <li className="role-card role-more">
              <h3 className="role-name display">Roles are dealt by the server.</h3>
              <p className="role-line">You won't know yours until the round starts.</p>
              <Link to="/play" className="btn btn-primary btn-lg">Get dealt in <span className="arrow">→</span></Link>
            </li>
          </ul>
        </div>
      </section>

      {/* ============================== CTA ============================== */}
      <section className="cta" aria-labelledby="cta-heading">
        <div className="cta-circle">
          <h2 id="cta-heading" className="cta-title display" aria-label="Your move.">
            {'Your move.'.split('').map((c, i) => <span key={i} className="ch" aria-hidden="true">{c === ' ' ? '\u00A0' : c}</span>)}
          </h2>
          <p className="cta-sub">A stranger is one click away. So is the deal.</p>
          <Link to="/play" className="btn btn-primary btn-lg magnetic">Start negotiating <span className="arrow">→</span></Link>
          <p className="cta-age">You must be 13 or older to play.</p>
        </div>
      </section>

      {/* ============================ FOOTER ============================= */}
      <footer className="foot">
        <div className="foot-row">
          <nav className="foot-links" aria-label="Footer">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/leaderboard">Leaderboard</Link>
            <Link to="/login">Log in</Link>
          </nav>
          <span className="foot-note">Voice-first. Zero cameras, ever.</span>
        </div>
        <div className="foot-mark display" aria-hidden="true">
          {'playcall'.split('').map((c, i) => <span key={i} className="ch">{c}</span>)}
        </div>
      </footer>
    </div>
  );
}
