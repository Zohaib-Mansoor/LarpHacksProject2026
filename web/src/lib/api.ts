export interface DeliveryPackage {
  id: 'phased' | 'full-6' | 'full-8';
  name: string;
  detail: string;
  first: number;
  full: number;
}

export interface CharacterBg {
  title: string;
  text: string;
}

export interface YouCharacter {
  id: 'alex' | 'morgan';
  name: string;
  short: string;
  role: string;
  employer: string;
  context: string;
  background: CharacterBg[];
  cue: string;
  objectives: string[];
  ready: boolean;
  muted: boolean;
  reveal: boolean;
  rematch: boolean;
}

export interface PeerCharacter {
  id: 'alex' | 'morgan';
  name: string;
  short: string;
  role: string;
  employer: string;
  ready: boolean;
  muted: boolean;
  rematch: boolean;
}

export interface DealProposal {
  price: number; // integer in $0.01M units: 450..600 step 25 ($4.50M .. $6.00M)
  package: 'phased' | 'full-6' | 'full-8';
  proposer: 'alex' | 'morgan';
}

export interface ChatMessage {
  id: number;
  speaker: 'alex' | 'morgan';
  kind: string;
  text: string;
  timestamp?: number;
  time?: string;
}

export interface RoundResult {
  confirmed: boolean;
  scores: Record<string, number>;
  yours: number[];
  otherObjectives: { text: string; points: number }[] | null;
  coaching: string;
  scenarioVersion: string;
  rubricVersion: string;
}

export interface RoomView {
  code: string;
  mode: 'text' | 'voice';
  phase: 'waiting' | 'prep' | 'talk' | 'finalize' | 'complete' | 'incomplete';
  round: number;
  serverNow: number;
  deadline: number | null;
  expires: number | null;
  paused: boolean;
  extended: boolean;
  endReason: string | null;
  you: YouCharacter;
  peer: PeerCharacter | null;
  deal: DealProposal | null;
  revision: number;
  accepted: ('alex' | 'morgan')[];
  messages: ChatMessage[];
  packages: DeliveryPackage[];
  result: RoundResult | null;
  sparring?: boolean;
  matched?: boolean;
  token?: string;
}

export interface SavedRound {
  id: string;
  code: string;
  round: number;
  role: string;
  roleName: string;
  confirmed: boolean;
  price: number | null;
  packageName: string | null;
  points: number;
  sparring: boolean;
  timestamp: number;
}

export interface LocalProfile {
  callsign: string;
  ageConfirmed: boolean;
  leaderboardOptIn: boolean;
  email?: string;
}

export const formatMoney = (price: number) => `$${(price / 100).toFixed(2)}M`;

const TOKENS_KEY = 'playcall-room-tokens';
const HISTORY_KEY = 'playcall-round-history';
const PROFILE_KEY = 'playcall-local-profile';

export function saveRoomToken(code: string, token: string) {
  try {
    const map = JSON.parse(sessionStorage.getItem(TOKENS_KEY) || '{}') as Record<string, string>;
    map[code.toUpperCase()] = token;
    sessionStorage.setItem(TOKENS_KEY, JSON.stringify(map));
  } catch {}
}

export function getRoomToken(code: string): string | null {
  try {
    const map = JSON.parse(sessionStorage.getItem(TOKENS_KEY) || '{}') as Record<string, string>;
    return map[code.toUpperCase()] || null;
  } catch {
    return null;
  }
}

export function getProfile(): LocalProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw) as LocalProfile;
  } catch {}
  return { callsign: '', ageConfirmed: false, leaderboardOptIn: false };
}

export function saveProfile(next: Partial<LocalProfile>): LocalProfile {
  const merged = { ...getProfile(), ...next };
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(merged)); } catch {}
  return merged;
}

export function getRoundHistory(): SavedRound[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw) as SavedRound[];
  } catch {}
  return [];
}

export function recordCompletedRound(view: RoomView) {
  if (!view.result) return;
  const id = `${view.code}-r${view.round}-${view.you.id}`;
  const history = getRoundHistory();
  if (history.some(h => h.id === id)) return;
  const pkg = view.packages.find(p => p.id === view.deal?.package);
  const points = view.result.yours.reduce((a, b) => a + b, 0);
  const entry: SavedRound = {
    id,
    code: view.code,
    round: view.round,
    role: view.you.id,
    roleName: `${view.you.name} · ${view.you.role}`,
    confirmed: view.result.confirmed,
    price: view.deal?.price ?? null,
    packageName: pkg?.name ?? null,
    points,
    sparring: !!view.sparring,
    timestamp: Date.now(),
  };
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...history].slice(0, 20)));
  } catch {}
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({ error: 'Unexpected server response.' }));
  if (!res.ok) {
    throw new Error(body?.error?.message || body?.error || `Request failed (${res.status})`);
  }
  return body as T;
}

export async function startSparring(role?: 'alex' | 'morgan' | 'random'): Promise<RoomView> {
  const view = await requestJson<RoomView>('/api/sparring', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consent: true, role: role === 'random' ? undefined : role }),
  });
  if (view.token) saveRoomToken(view.code, view.token);
  return view;
}

export async function requestStrangerMatch(): Promise<RoomView> {
  const view = await requestJson<RoomView>('/api/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consent: true }),
  });
  if (view.token) saveRoomToken(view.code, view.token);
  return view;
}

export async function createPrivateRoom(): Promise<RoomView> {
  const view = await requestJson<RoomView>('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consent: true, mode: 'text' }),
  });
  if (view.token) saveRoomToken(view.code, view.token);
  return view;
}

export async function joinRoomByCode(code: string): Promise<RoomView> {
  const view = await requestJson<RoomView>('/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consent: true, code: code.trim().toUpperCase() }),
  });
  if (view.token) saveRoomToken(view.code, view.token);
  return view;
}

export async function fetchRoom(code: string, token: string): Promise<RoomView> {
  return requestJson<RoomView>(`/api/room?code=${encodeURIComponent(code)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function sendRoomAction(code: string, token: string, payload: Record<string, unknown>): Promise<RoomView> {
  return requestJson<RoomView>('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code, ...payload }),
  });
}

export interface LeaderboardEntry {
  callsign: string;
  rounds: number;
  deals: number;
  points: number;
  best: number;
  updatedAt: number;
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await requestJson<{ entries: LeaderboardEntry[] }>('/api/leaderboard');
  return res.entries;
}

export async function submitLeaderboardScore(code: string, token: string, callsign: string): Promise<LeaderboardEntry[]> {
  const res = await requestJson<{ entries: LeaderboardEntry[] }>('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code, callsign }),
  });
  return res.entries;
}

/* Authored public fixtures for the clearly labelled /demo walkthrough */
export const DEMO_PACKAGES: DeliveryPackage[] = [
  { id: 'phased', name: 'Staged delivery', detail: 'Demo at month 6 · Full prototype at month 8', first: 6, full: 8 },
  { id: 'full-6', name: 'Full prototype · month 6', detail: 'One complete delivery at month 6', first: 6, full: 6 },
  { id: 'full-8', name: 'Full prototype · month 8', detail: 'One complete delivery at month 8', first: 8, full: 8 },
];

export const DEMO_LINES: ChatMessage[] = [
  { id: 1, speaker: 'alex', time: '00:12', kind: 'sample dialogue', text: 'Priya mentioned your investor showcase is at month 6. Do you need the complete satellite then, or would a live demonstration work?' },
  { id: 2, speaker: 'morgan', time: '00:29', kind: 'sample dialogue', text: 'A convincing live demonstration is enough for the partners at month 6. We can take the full prototype at month 8 if the budget stays disciplined.' },
  { id: 3, speaker: 'alex', time: '00:48', kind: 'sample dialogue', text: 'On Aster-2 we staged delivery — live demo at month 6, full hardware at month 8. That gives engineering proper test runway at $5.50M.' },
  { id: 4, speaker: 'morgan', time: '01:07', kind: 'sample dialogue', text: 'Staged delivery solves our timeline, and if we land at $5.00M–$5.25M I can sign right now.' },
];

export function scoreDemoDeal(deal: DealProposal | null, confirmed: boolean) {
  if (!confirmed || !deal) return { alex: [0, 0, 0], morgan: [0, 0, 0] };
  const pkg = DEMO_PACKAGES.find(p => p.id === deal.package)!;
  return {
    alex: [20, deal.price >= 550 ? 20 : 0, pkg.full === 8 ? 20 : 0],
    morgan: [20, deal.price <= 500 ? 20 : 0, pkg.first <= 6 ? 20 : 0],
  };
}
