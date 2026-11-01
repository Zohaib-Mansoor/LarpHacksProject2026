import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getProfile, saveProfile } from '../lib/api';
import { useToast } from '../providers/ToastProvider';

export default function Login() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const existing = getProfile();
  const [callsign, setCallsign] = useState(existing.callsign);
  const [ageOk, setAgeOk] = useState(existing.ageConfirmed || false);
  const [error, setError] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ageOk) {
      setError('You must confirm you are 13 or older to continue.');
      return;
    }
    saveProfile({ callsign: callsign.trim() || 'BLUE-CALLER', ageConfirmed: true });
    toast('Signed into guest caller session');
    navigate('/play');
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit} noValidate>
        <p className="kicker mono">CALLER ACCESS · 13+</p>
        <h1 className="display auth-title">Welcome back</h1>
        <p className="auth-sub">PlayCall matches strangers anonymously with zero cameras. Enter your callsign or jump straight in as a guest.</p>

        <div className="flow-input-block">
          <label htmlFor="login-callsign">Callsign</label>
          <input
            id="login-callsign"
            value={callsign}
            onChange={e => setCallsign(e.target.value.slice(0, 24))}
            placeholder="BLUE-FALCON-01"
            autoComplete="nickname"
          />
        </div>

        <label className="flow-consent">
          <input type="checkbox" checked={ageOk} onChange={e => { setAgeOk(e.target.checked); setError(''); }} />
          <span>I confirm that I am at least 13 years old and agree to the <Link to="/terms">Terms</Link>.</span>
        </label>

        {error ? <div className="notice notice-danger" role="alert">{error}</div> : null}

        <button type="submit" className="wise-cta-wide">Continue to Command Hub</button>
        <p className="auth-foot">New here? <Link to="/signup">Create a caller profile</Link></p>
      </form>
    </div>
  );
}
