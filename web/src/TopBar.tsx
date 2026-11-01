import { Link } from 'react-router-dom';
import { useTheme } from './providers/ThemeProvider';

export function TopBar() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <header className="topbar">
      <Link to="/" className="wordmark">PlayCall</Link>
      <button
        className="btn btn-ghost"
        onClick={toggle}
        aria-label={isDark ? 'Switch to light appearance' : 'Switch to dark appearance'}
        title={isDark ? 'Light appearance' : 'Dark appearance'}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>
    </header>
  );
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
