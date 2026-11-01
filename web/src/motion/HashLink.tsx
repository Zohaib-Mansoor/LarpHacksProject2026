import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { scrollToId } from './SmoothScroll';

/** Link to a section on the landing page that smooth-scrolls (and navigates home first if needed). */
export function HashLink({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    if (pathname === '/') { scrollToId(to); history.replaceState(null, '', `#${to}`); }
    else navigate(`/#${to}`);
  };
  return <a href={`/#${to}`} onClick={handle} {...rest} />;
}
