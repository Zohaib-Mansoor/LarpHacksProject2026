import { useEffect, useRef } from 'react';
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return <>
    <div className="drawer-backdrop" onClick={onClose} />
    <div className="drawer" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
      <h2 style={{ fontSize: 'var(--fs-19)', marginBottom: 'var(--sp-3)' }}>{title}</h2>
      {children}
    </div>
  </>;
}
