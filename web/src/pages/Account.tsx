import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { getProfile, getRoundHistory, saveProfile } from '../lib/api';
import { useToast } from '../providers/ToastProvider';

export default function Account() {
  const { toast } = useToast();
  const [profile, setProfile] = useState(() => getProfile());
  const [callsign, setCallsign] = useState(profile.callsign);
  const [optIn, setOptIn] = useState(profile.leaderboardOptIn);
  const history = getRoundHistory();

  function onSave(e: FormEvent) {
    e.preventDefault();
    const updated = saveProfile({ callsign: callsign.trim(), leaderboardOptIn: optIn, ageConfirmed: true });
    setProfile(updated);
    toast('Caller preferences saved.');
  }

  function clearHistory() {
    localStorage.removeItem('playcall-round-history');
    toast('Local round history cleared.');
    window.location.reload();
  }

  return (
    <AppShell>
      <div className="hub" style={{ maxWidth: 640 }}>
        <header className="hub-header">
          <div className="hub-balance-label">Local caller preferences</div>
          <h1 className="hub-balance">Caller Profile</h1>
          <p style={{ color: 'var(--muted)', marginTop: 6 }}>
            In rooms, partners only ever see your server-assigned scenario alias (Alex Vega or Morgan Reed) — never this callsign.
          </p>
        </header>

        <form className="standings-card" style={{ padding: 24, display: 'grid', gap: 18 }} onSubmit={onSave}>
          <div className="flow-input-block" style={{ margin: 0 }}>
            <label htmlFor="acc-callsign">Public standings callsign</label>
            <input
              id="acc-callsign"
              value={callsign}
              onChange={e => setCallsign(e.target.value.slice(0, 24))}
              placeholder="BLUE-FALCON-01"
            />
          </div>

          <label className="flow-consent" style={{ margin: 0 }}>
            <input type="checkbox" checked={optIn} onChange={e => setOptIn(e.target.checked)} />
            <span>Automatically submit verified mission points to the session leaderboard after completed rounds.</span>
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" className="wise-pill wise-pill-solid">Save preferences</button>
            <Link to="/privacy" className="wise-pill wise-pill-soft">Privacy policy</Link>
            {history.length > 0 ? (
              <button type="button" className="wise-pill wise-pill-danger" onClick={clearHistory}>
                Clear {history.length} saved {history.length === 1 ? 'round' : 'rounds'}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </AppShell>
  );
}
