import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { fetchLeaderboard, getProfile, LeaderboardEntry, persistProfile } from '../lib/api';

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(() => getProfile());

  useEffect(() => {
    fetchLeaderboard()
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, []);

  const toggleOptIn = async () => { try { const next = await persistProfile({ leaderboardOptIn: !profile.leaderboardOptIn }); setProfile(next); } catch { window.alert('Could not save your leaderboard preference. Please retry.'); } };

  return (
    <AppShell>
      <div className="hub">
        <header className="hub-header">
          <div className="hub-balance-label">Opt-in mission standings · Saved in PostgreSQL</div>
          <div className="hub-balance-row">
            <h1 className="hub-balance">Standings</h1>
          </div>
          <p style={{ color: 'var(--muted)', maxWidth: '58ch', marginTop: 6 }}>
            Only verified mission points from completed rounds appear here — never transcripts, coaching, or unopted guests.
          </p>
          <div className="hub-pills" style={{ marginTop: 16 }}>
            <Link to="/setup?mode=sparring" className="wise-pill wise-pill-solid">Play a round</Link>
            <button type="button" className="wise-pill wise-pill-soft" onClick={toggleOptIn}>
              Auto-post my rounds: {profile.leaderboardOptIn ? 'On ✓' : 'Off'}
            </button>
            <Link to="/account" className="wise-pill wise-pill-soft">Set callsign</Link>
          </div>
        </header>

        {loading ? (
          <p className="mono" style={{ color: 'var(--muted)' }}>LOADING STANDINGS…</p>
        ) : entries.length === 0 ? (
          <div className="bento-notched" style={{ maxWidth: 640 }}>
            <div className="notched-top" aria-hidden="true"><span className="notched-cutout" /></div>
            <div className="notched-body">
              <h2>No opted-in scores posted yet</h2>
              <p>Finish a 5-minute round and post your callsign from the receipt screen to claim the #1 spot.</p>
              <Link to="/setup?mode=sparring" className="wise-pill wise-pill-solid" style={{ marginTop: 12 }}>
                Start a round →
              </Link>
            </div>
          </div>
        ) : (
          <div className="standings-card">
            <table className="standings-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Callsign</th>
                  <th scope="col">Deals</th>
                  <th scope="col">Rounds</th>
                  <th scope="col">Best</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Total pts</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.callsign}>
                    <td className="mono tnum">0{i + 1}</td>
                    <td><strong>{e.callsign}</strong></td>
                    <td className="tnum">{e.deals}</td>
                    <td className="tnum">{e.rounds}</td>
                    <td className="tnum">{e.best}</td>
                    <td className="tnum" style={{ textAlign: 'right', fontWeight: 800, color: 'var(--self)' }}>
                      {e.points} PTS
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
