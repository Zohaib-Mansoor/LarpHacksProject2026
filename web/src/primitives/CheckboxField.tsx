import type { InputHTMLAttributes } from 'react';
export function CheckboxField({ label, hint, id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; id: string }) {
  return <div className="field" style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'start', gap: 'var(--sp-2)' }}>
    <input type="checkbox" id={id} style={{ width: 20, height: 20, minHeight: 20 }} {...rest} />
    <div>
      <label htmlFor={id} style={{ color: 'var(--ink)' }}>{label}</label>
      {hint ? <div style={{ fontSize: 'var(--fs-13)', color: 'var(--muted)' }}>{hint}</div> : null}
    </div>
  </div>;
}
