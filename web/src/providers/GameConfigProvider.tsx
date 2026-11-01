import { createContext, useContext, useEffect, useState } from 'react';
import type { ChatMessage, DeliveryPackage } from '../lib/api';
export interface GameConfig {
  scenario: { id: string; title: string; roles: { id: 'alex' | 'morgan'; name: string; short: string; role: string; employer: string }[] };
  rules: { prices: number[]; defaultPrice: number; defaultPackage: DeliveryPackage['id']; missionMax: number; objectivePoints: number; briefSeconds: number; talkSeconds: number; signingSeconds: number; turnSeconds: number; turnCount: number; warningSeconds: number };
  packages: DeliveryPackage[];
  demo: { lines: ChatMessage[] };
  missionSummary?: { points: number; rounds: number; deals: number };
}
const Context = createContext<GameConfig | null>(null);
export function GameConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<GameConfig | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/vc/config', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Game configuration unavailable. Please reload to retry.');
      setConfig(await response.json());
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    let active = true; let busy = false;
    const refresh = async () => { if (busy) return; busy = true; try { const r = await fetch('/api/vc/me/summary'); if (!r.ok) return; const summary = await r.json(); if (active) setConfig(current => current ? {...current, missionSummary: summary} : current); } finally {busy = false;} };
    void refresh().catch(() => {}); const timer = setInterval(() => void refresh().catch(() => {}), 5000);
    return () => {active = false; clearInterval(timer);};
  }, [!!config]);
  if (!config) return <p role={error ? 'alert' : 'status'}>{error || 'Loading game rules…'}</p>;
  return <Context.Provider value={config}>{children}</Context.Provider>;
}
export function useGameConfig() {
  const config = useContext(Context);
  if (!config) throw new Error('Game configuration is not loaded.');
  return config;
}
