import { useGameConfig } from './providers/GameConfigProvider';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from './providers/ThemeProvider';
import { HashLink } from './motion/HashLink';
import { getProfile } from './lib/api';
import { useSession } from './providers/SessionProvider';

const FLOW_PREFIXES = ['/setup', '/room/', '/demo', '/results/'];

export function TopBar() {
  const { rules, missionSummary } = useGameConfig();
  const { user } = useSession();
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const isDark = theme === 'dark';
  const isHero = pathname === '/';
  const isFlow = FLOW_PREFIXES.some(p => pathname === p || pathname.startsWith(p));
  const isAppWorkspace = ['/play', '/leaderboard', '/account'].includes(pathname);
  const [scrolled, setScrolled] = useState(false);
  const [announce, setAnnounce] = useState(() => sessionStorage.getItem('playcall-announce') !== 'closed');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (isFlow) return null;

  const profile = getProfile();
  const totalPts = missionSummary?.points ?? '—';
  const initials = (profile.callsign || 'PC').slice(0, 2).toUpperCase();
  const closeAnnounce = () => {
    sessionStorage.setItem('playcall-announce', 'closed');
    setAnnounce(false);
  };

  return (
    <>
      {announce && isHero ? (
        <div className="announce">
          <span>
            Live turn-based voice-call negotiations — secret roles, real-time audio, zero cameras.{' '}
            <Link to="/setup?mode=sparring">Hop on an instant call</Link>
          </span>
          <button className="announce-close" onClick={closeAnnounce} aria-label="Dismiss announcement">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      ) : null}
      <header className={`topbar${isHero ? ' is-hero' : ''}${isAppWorkspace ? ' is-workspace' : ''}${scrolled ? ' is-scrolled' : ''}`}>
        <Link to={user ? '/play' : '/'} className="wordmark" aria-label="PlayCall home">
          <LogoMark />
          playcall
        </Link>

        {!isAppWorkspace ? (
          <nav className="topnav" aria-label="Primary">
            <HashLink to="how-it-works">How it works</HashLink>
            <HashLink to="roles">Scenarios</HashLink>
            <Link to="/play">Command Hub</Link>
            <Link to="/leaderboard">Leaderboard</Link>
          </nav>
        ) : null}

        <div className="topbar-right">
          {isAppWorkspace ? (
            <Link to="/setup?mode=sparring" className="earn-pill">
              Up to {rules.missionMax} pts / deal · {totalPts} pts
            </Link>
          ) : null}
          <button
            className="icon-btn"
            onClick={toggle}
            aria-label={isDark ? 'Switch to light appearance' : 'Switch to dark appearance'}
            title={isDark ? 'Light appearance' : 'Dark appearance'}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          {isAppWorkspace ? (
            <Link to="/account" className="avatar-chip" aria-label="Account and callsign">
              <span className="avatar-circle">{initials}<i className="avatar-dot" /></span>
              <span className="avatar-name hide-sm">{profile.callsign || 'Guest Caller'}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          ) : (
            <>
              <Link to="/login" className="toplink hide-sm">Log in</Link>
              <Link to="/play" className="btn btn-primary btn-sm">Open Hub</Link>
            </>
          )}
        </div>
      </header>
    </>
  );
}

/** Two channel dots joined by one stroke: you (blue) and partner (orange). */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M8 22 L24 10" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="8" cy="22" r="5.2" fill="var(--electric)" />
      <circle cx="24" cy="10" r="5.2" fill="var(--partner)" />
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
