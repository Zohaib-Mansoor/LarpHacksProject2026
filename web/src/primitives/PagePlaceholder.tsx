import { Link } from 'react-router-dom';

/** Branded hero used by routes that are still being built by their owning lane. */
export function PagePlaceholder({ title, line = 'This screen is on its way.', cta = { to: '/', label: 'Back to PlayCall' } }: { title: string; line?: string; cta?: { to: string; label: string } }) {
  return (
    <section className="page-hero">
      <h1>{title}</h1>
      <p>{line}</p>
      <Link to={cta.to} className="btn btn-primary btn-lg">{cta.label} <span className="arrow">→</span></Link>
    </section>
  );
}
