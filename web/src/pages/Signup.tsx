import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { saveProfile } from '../lib/api';
import { useToast } from '../providers/ToastProvider';

function ageFromDob(dob: string): number {
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return -1;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function Signup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [callsign, setCallsign] = useState('');
  const [dob, setDob] = useState('');
  const [optIn, setOptIn] = useState(true);
  const [consent, setConsent] = useState(false);
  const [refusedUnder13, setRefusedUnder13] = useState(false);
  const [error, setError] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (refusedUnder13) return;
    setError('');
    if (!callsign.trim()) {
      setError('Choose a callsign (2–24 characters).');
      return;
    }
    const age = ageFromDob(dob);
    if (age < 0) {
      setError('Enter a valid date of birth.');
      return;
    }
    if (age < 13) {
      setRefusedUnder13(true);
      setError('PlayCall is restricted to players aged 13 and older. Account creation cannot proceed.');
      return;
    }
    if (!consent) {
      setError('Accept the Privacy Policy and Terms to create your profile.');
      return;
    }
    saveProfile({ callsign: callsign.trim(), ageConfirmed: true, leaderboardOptIn: optIn });
    toast('Caller profile ready!');
    navigate('/play');
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit} noValidate>
        <p className="kicker mono">CREATE CALLER PROFILE · 13+</p>
        <h1 className="display auth-title">Claim your callsign</h1>
        <p className="auth-sub">Used only for opt-in mission standings. Inside rooms, your identity is always a server-dealt alias.</p>

        <div className="flow-input-block">
          <label htmlFor="signup-callsign">Callsign</label>
          <input
            id="signup-callsign"
            value={callsign}
            onChange={e => setCallsign(e.target.value.slice(0, 24))}
            placeholder="AZURE-OTTER"
            disabled={refusedUnder13}
            required
          />
        </div>

        <div className="flow-input-block">
          <label htmlFor="signup-dob">Date of birth (13+ eligibility check)</label>
          <input
            id="signup-dob"
            type="date"
            value={dob}
            onChange={e => setDob(e.target.value)}
            disabled={refusedUnder13}
            required
          />
        </div>

        <label className="flow-consent">
          <input type="checkbox" checked={optIn} onChange={e => setOptIn(e.target.checked)} disabled={refusedUnder13} />
          <span>List my verified mission points on the session leaderboard.</span>
        </label>

        <label className="flow-consent">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} disabled={refusedUnder13} />
          <span>I agree to the <Link to="/privacy">Privacy Policy</Link> and <Link to="/terms">Terms</Link>.</span>
        </label>

        {error ? <div className="notice notice-danger" role="alert">{error}</div> : null}

        <button type="submit" className="wise-cta-wide" disabled={refusedUnder13}>
          Create profile &amp; enter Hub
        </button>
        <p className="auth-foot">Already have a callsign? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  );
}
