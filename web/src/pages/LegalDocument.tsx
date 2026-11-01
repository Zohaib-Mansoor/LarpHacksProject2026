import type { CSSProperties, ReactNode } from 'react';

const docStyle: CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: 'var(--sp-4) 0 var(--sp-5)',
};

const eyebrowStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--fs-12)',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  margin: '0 0 var(--sp-3)',
};

const titleStyle: CSSProperties = {
  fontSize: 'var(--fs-32)',
  fontWeight: 700,
  lineHeight: 1.12,
  margin: '0 0 var(--sp-4)',
  paddingBottom: 'var(--sp-4)',
  borderBottom: '1px solid var(--line)',
};

// Scoped prose styles for legal documents: single column, h2-deep, measure <= 68ch.
const proseCss = `
.legal-doc h2 { font-size: var(--fs-24); font-weight: 600; line-height: 1.12; margin: var(--sp-5) 0 var(--sp-2); }
.legal-doc h2:first-of-type { margin-top: var(--sp-4); }
.legal-doc p { margin: 0 0 var(--sp-3); line-height: 1.6; max-width: 68ch; }
.legal-doc ul { margin: 0 0 var(--sp-3); padding: 0 0 0 var(--sp-4); max-width: 64ch; }
.legal-doc li { margin: 0 0 var(--sp-2); line-height: 1.6; }
.legal-doc .legal-see-also { margin-top: var(--sp-5); padding-top: var(--sp-4); border-top: 1px solid var(--line); font-size: var(--fs-14); }
`;

export function LegalDocument({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="shell">
      <style>{proseCss}</style>
      <div className="legal-doc" style={docStyle}>
        <header>
          <p style={eyebrowStyle}>Last updated {updated}</p>
          <h1 style={titleStyle}>{title}</h1>
        </header>
        {children}
      </div>
    </article>
  );
}
