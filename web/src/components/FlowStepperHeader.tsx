import { Link } from 'react-router-dom';
import { LogoMark, MoonIcon, SunIcon } from '../TopBar';
import { useTheme } from '../providers/ThemeProvider';

const LABELS = ['Setup', 'Brief', 'Negotiate', 'Receipt'] as const;

/** Wise-inspired 4-step top flow bar (Setup -> Brief -> Negotiate -> Receipt). */
export function FlowStepperHeader({
  step,
  badge = 'PC',
  closeTo = '/play',
  onClose,
}: {
  step: 0 | 1 | 2 | 3;
  badge?: string;
  closeTo?: string;
  onClose?: () => void;
}) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  const pct = ((step + 0.5) / LABELS.length) * 100;

  return (
    <header className="flow-header">
      <Link to="/" className="wordmark" aria-label="PlayCall home">
        <LogoMark size={28} />
        playcall
      </Link>

      <nav className="flow-stepper" aria-label="Round progress">
        <div className="flow-track" aria-hidden="true">
          <div className="flow-fill" style={{ width: `${Math.min(100, step === 3 ? 100 : pct)}%` }} />
        </div>
        <ol className="flow-labels">
          {LABELS.map((label, i) => (
            <li
              key={label}
              className={i === step ? 'is-active' : i < step ? 'is-done' : ''}
              aria-current={i === step ? 'step' : undefined}
            >
              {label}
            </li>
          ))}
        </ol>
      </nav>

      <div className="flow-actions">
        <button
          className="icon-btn"
          onClick={toggle}
          aria-label={isDark ? 'Switch to light appearance' : 'Switch to dark appearance'}
          title={isDark ? 'Light appearance' : 'Dark appearance'}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>
        <span className="flow-avatar" aria-hidden="true">{badge}</span>
        {onClose ? (
          <button type="button" className="icon-btn flow-close" onClick={onClose} aria-label="Exit round">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        ) : (
          <Link to={closeTo} className="icon-btn flow-close" aria-label="Back to Command Hub">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </Link>
        )}
      </div>
    </header>
  );
}
