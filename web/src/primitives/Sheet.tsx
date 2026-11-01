import { useEffect, useRef } from 'react';
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return <div className="sheet-backdrop" onClick={onClose}>
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1} onClick={e => e.stopPropagation()}>
      {title ? <h2 className="sheet-title">{title}</h2> : null}
      {children}
    </div>
  </div>;
}
