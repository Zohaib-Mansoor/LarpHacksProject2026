import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { ensureSession, syncAccount } from "../lib/api";
export interface Me {
  userId: string;
  isGuest: boolean;
}
const SessionContext = createContext<{
  user: Me | null;
  ready: boolean;
  refresh: () => Promise<void>;
}>({ user: null, ready: false, refresh: async () => {} });
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    try {
      await ensureSession();
      await syncAccount();
      const r = await fetch("/api/me");
      if (!r.ok) throw new Error("no session");
      const me = await r.json();
      setUser({ userId: "current-session", isGuest: !!me.guest });
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <SessionContext.Provider value={{ user, ready, refresh }}>
      {ready ? children : <p role="status">Connecting your private session…</p>}
    </SessionContext.Provider>
  );
}
export const useSession = () => useContext(SessionContext);
