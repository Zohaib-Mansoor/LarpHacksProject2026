import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

const heroStyle: CSSProperties = {
  minHeight: 'calc(100dvh - 105px)',
  maxWidth: 720,
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
};

const headlineStyle: CSSProperties = {
  fontSize: 'var(--fs-display)',
  fontWeight: 700,
  lineHeight: 1.12,
  margin: '0 0 var(--sp-4)',
};

const sentenceStyle: CSSProperties = {
  fontSize: 'var(--fs-17)',
  lineHeight: 1.7,
  color: 'var(--muted)',
  maxWidth: '40ch',
  margin: '0 0 var(--sp-5)',
};

const secondaryStyle: CSSProperties = {
  fontSize: 'var(--fs-14)',
  color: 'var(--self)',
  marginTop: 'var(--sp-4)',
};

const ageLineStyle: CSSProperties = {
  fontSize: 'var(--fs-12)',
  color: 'var(--muted)',
  marginTop: 'var(--sp-5)',
};

const sectionStyle: CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: 'var(--sp-4) 0 var(--sp-5)',
  scrollMarginTop: 'var(--sp-5)',
};

const h2Style: CSSProperties = {
  fontSize: 'var(--fs-24)',
  fontWeight: 700,
  lineHeight: 1.12,
  margin: '0 0 var(--sp-3)',
};

const stepListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
};

const stepStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  gap: '0 var(--sp-4)',
  borderTop: '1px solid var(--line)',
  padding: 'var(--sp-4) 0',
};

const stepNumStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--fs-12)',
  fontWeight: 700,
  letterSpacing: '0.12em',
  color: 'var(--muted)',
  paddingTop: 'var(--sp-1)',
};

const stepTitleStyle: CSSProperties = {
  fontSize: 'var(--fs-19)',
  fontWeight: 600,
  lineHeight: 1.12,
  margin: '0 0 var(--sp-2)',
};

const stepBodyStyle: CSSProperties = {
  fontSize: 'var(--fs-16)',
  lineHeight: 1.55,
  color: 'var(--muted)',
  maxWidth: '60ch',
  margin: 0,
};

const footerStyle: CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  borderTop: '1px solid var(--line)',
  padding: 'var(--sp-4) 0 var(--sp-5)',
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--sp-3)',
  fontSize: 'var(--fs-13)',
  color: 'var(--muted)',
};

const footerNoteStyle: CSSProperties = {
  marginLeft: 'auto',
};

/** The one product illustration: two channel nodes on a quiet orbit. */
function OrbitMark() {
  return (
    <svg
      width="136"
      height="76"
      viewBox="0 0 136 76"
      aria-hidden="true"
      focusable="false"
      style={{ marginBottom: 'var(--sp-4)' }}
    >
      <ellipse cx="68" cy="38" rx="60" ry="24" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" />
      <circle cx="128" cy="38" r="6" fill="var(--self)" />
      <circle cx="8" cy="38" r="6" fill="var(--partner)" />
      <circle cx="68" cy="38" r="3.5" fill="var(--ink)" />
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="shell">
      <section style={heroStyle} aria-labelledby="landing-headline">
        <OrbitMark />
        <h1 id="landing-headline" style={headlineStyle}>
          Negotiate with a stranger.
          <br />
          Five minutes. No video.
        </h1>
        <p style={sentenceStyle}>
          Get matched with someone anonymous, take a secret role, and close a deal before the clock runs out.
        </p>
        <Link to="/play" className="btn btn-primary btn-lg">
          Start negotiating
        </Link>
        <a href="#how-it-works" style={secondaryStyle}>
          How it works
        </a>
        <p style={ageLineStyle}>You must be 13 or older to play.</p>
      </section>

      <section id="how-it-works" style={sectionStyle} aria-labelledby="how-it-works-heading">
        <h2 id="how-it-works-heading" style={h2Style}>
          How it works
        </h2>
        <ol style={stepListStyle}>
          <li style={stepStyle}>
            <span style={stepNumStyle} aria-hidden="true">01</span>
            <div>
              <h3 style={stepTitleStyle}>Get matched</h3>
              <p style={stepBodyStyle}>
                Two anonymous strangers, paired instantly. No account needed — just confirm you are 13 or older.
              </p>
            </div>
          </li>
          <li style={stepStyle}>
            <span style={stepNumStyle} aria-hidden="true">02</span>
            <div>
              <h3 style={stepTitleStyle}>Take your brief</h3>
              <p style={stepBodyStyle}>
                Each player receives a secret identity and three objectives. Your brief stays private — the other side never sees it.
              </p>
            </div>
          </li>
          <li style={stepStyle}>
            <span style={stepNumStyle} aria-hidden="true">03</span>
            <div>
              <h3 style={stepTitleStyle}>Negotiate by text</h3>
              <p style={stepBodyStyle}>
                Five minutes on the clock. Make offers, trade, revise the deal. It is text only — no video, no voice.
              </p>
            </div>
          </li>
          <li style={stepStyle}>
            <span style={stepNumStyle} aria-hidden="true">04</span>
            <div>
              <h3 style={stepTitleStyle}>Read the debrief</h3>
              <p style={stepBodyStyle}>
                If you both confirm a deal, you get the signed receipt and see how each side scored.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <footer style={footerStyle}>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
        <span style={footerNoteStyle}>Text only. No video, ever.</span>
      </footer>
    </div>
  );
}
