import { Link } from 'react-router-dom';
export default function NotFound() {
  return <main className="shell" style={{ textAlign: 'center', paddingTop: 'var(--sp-5)' }}>
    <h1 style={{ fontSize: 'var(--fs-32)' }}>Page not found</h1>
    <p style={{ marginTop: 'var(--sp-3)' }}><Link to="/">Back to PlayCall</Link></p>
  </main>;
}
