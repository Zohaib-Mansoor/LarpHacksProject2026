import { useEffect, useState } from 'react';

/** PlayCall's single time authority: thin circular ring + tabular numerals, warming to orange under 60s. */
export function CountdownRing({
  deadline,
  serverOffset = 0,
  totalSeconds = 300,
  label = 'Round clock',
  paused = false,
}: {
  deadline: number | null;
  serverOffset?: number;
  totalSeconds?: number;
  label?: string;
  paused?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  if (!deadline) {
    return (
      <div className="clock-pill">
        <span className="clock-num mono tnum">—:—</span>
        <span className="clock-lbl">{label}</span>
      </div>
    );
  }

  const remaining = Math.max(0, Math.ceil((deadline - (now + serverOffset)) / 1000));
  const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
  const secs = (remaining % 60).toString().padStart(2, '0');
  const pct = Math.min(100, Math.max(0, (remaining / totalSeconds) * 100));
  const urgent = remaining <= 60 && !paused;

  return (
    <div className={`clock-pill${urgent ? ' is-urgent' : ''}`} role="timer" aria-label={label}>
      <svg width="38" height="38" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="16" className="clock-track" />
        <circle
          cx="20"
          cy="20"
          r="16"
          className="clock-arc"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - pct}
        />
      </svg>
      <div>
        <div className="clock-num mono tnum">{mins}:{secs}</div>
        <div className="clock-lbl">{paused ? 'Paused' : label}</div>
      </div>
    </div>
  );
}
