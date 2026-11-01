import { useGameConfig } from '../providers/GameConfigProvider';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

/** Wise-inspired left navigation rail + crisp white workspace layout. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const [modesOpen, setModesOpen] = useState(true);

  return (
    <div className="wise-shell">
      <aside className="wise-sidebar" aria-label="Workspace navigation">
        <nav className="wise-nav">
          <Link to="/play" className={`wise-nav-item${pathname === '/play' ? ' is-active' : ''}`}>
            <NavIcon kind="home" />
            <span>Home</span>
          </Link>

          <Link to="/setup?mode=sparring" className="wise-nav-item">
            <NavIcon kind="bolt" />
            <span>Instant Sparring</span>
          </Link>

          <Link to="/demo" className="wise-nav-item">
            <NavIcon kind="cards" />
            <span>Interactive Demo</span>
          </Link>

          <button
            type="button"
            className="wise-nav-item wise-nav-toggle"
            aria-expanded={modesOpen}
            onClick={() => setModesOpen(o => !o)}
          >
            <NavIcon kind="arrows" />
            <span>Channels</span>
            <svg className={`wise-chev${modesOpen ? ' is-open' : ''}`} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {modesOpen ? (
            <div className="wise-subnav">
              <Link to="/setup?mode=match" className="wise-sub-item">Stranger queue</Link>
              <Link to="/setup?mode=create" className="wise-sub-item">Create invite room</Link>
              <Link to="/setup?mode=join" className="wise-sub-item">Join with 6-char code</Link>
              <Link to="/setup?mode=sparring&role=alex" className="wise-sub-item">Play as first role</Link>
              <Link to="/setup?mode=sparring&role=morgan" className="wise-sub-item">Play as second role</Link>
            </div>
          ) : null}

          <Link to="/leaderboard" className={`wise-nav-item${pathname === '/leaderboard' ? ' is-active' : ''}`}>
            <NavIcon kind="chart" />
            <span>Standings</span>
          </Link>

          <Link to="/account" className={`wise-nav-item${pathname === '/account' ? ' is-active' : ''}`}>
            <NavIcon kind="user" />
            <span>Caller Profile</span>
          </Link>
        </nav>
      </aside>

      <div className="wise-main">{children}</div>
    </div>
  );
}

function NavIcon({ kind }: { kind: 'home' | 'bolt' | 'cards' | 'arrows' | 'chart' | 'user' }) {
  const p = { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  switch (kind) {
    case 'home': return <svg {...p}><path d="m3 10.5 9-7.5 9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" /></svg>;
    case 'bolt': return <svg {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7Z" /></svg>;
    case 'cards': return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M7 15h4" /></svg>;
    case 'arrows': return <svg {...p}><path d="M7 16 3 12l4-4M3 12h13M17 8l4 4-4 4M21 12H8" /></svg>;
    case 'chart': return <svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>;
    case 'user': return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>;
  }
}
