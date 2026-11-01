import { createContext, useCallback, useContext, useState } from 'react';
const ToastContext = createContext<{ toast: (message: string) => void }>({ toast: () => {} });
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const toast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  }, []);
  return <ToastContext.Provider value={{ toast }}>
    {children}
    <div className="toast-stack" role="status">{toasts.map(t => <div key={t.id} className="toast">{t.message}</div>)}</div>
  </ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);
