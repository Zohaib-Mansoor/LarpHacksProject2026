import { createContext, useContext, useEffect, useState } from 'react';
type Theme = 'light' | 'dark';
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({ theme: 'light', toggle: () => {} });
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('playcall-theme') as Theme) ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('playcall-theme', theme); }, [theme]);
  return <ThemeContext.Provider value={{ theme, toggle: () => setTheme(t => (t === 'light' ? 'dark' : 'light')) }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
