import type { ButtonHTMLAttributes } from 'react';
export function Button({ variant = 'primary', size = 'md', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'md' | 'lg' }) {
  return <button className={`btn btn-${variant} btn-${size} ${className ?? ''}`} {...rest} />;
}
