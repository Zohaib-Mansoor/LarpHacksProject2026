import type { InputHTMLAttributes } from 'react';
export function TextField({ label, error, id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; id: string }) {
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <input id={id} aria-invalid={error ? true : undefined} {...rest} />
    {error ? <div className="error" role="alert">{error}</div> : null}
  </div>;
}
