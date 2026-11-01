import { Link } from 'react-router-dom';
import { useTheme } from './providers/ThemeProvider';
export function TopBar() {
  const { theme, toggle } = useTheme();
  return <header className="topbar">
    <Link to="/" className="wordmark">PlayCall</Link>
    <button className="btn btn-ghost" onClick={toggle} aria-label={theme === 'light' ? 'Switch to dark appearance' : 'Switch to light appearance'}>
      {theme === 'light' ? 'Dark' : 'Light'}
    </button>
  </header>;
}
