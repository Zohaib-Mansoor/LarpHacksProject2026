export interface DeliveryPackage {
  id: "phased" | "full-6" | "full-8";
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
  id: "alex" | "morgan";
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
  id: "alex" | "morgan";
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
  package: "phased" | "full-6" | "full-8";
  proposer: "alex" | "morgan";
}

export interface ChatMessage {
  id: number;
  speaker: "alex" | "morgan";
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
  speakingTurn: { index: number; total: number; speaker: 'alex' | 'morgan'; startsAt: number; endsAt: number; warningMs: number } | null;
  coaching: {
    configured: boolean; model: string | null; consent: boolean; allConsented: boolean;
    pendingClips: number; failedClips: number;
    transcript: { turn: number; speaker: 'alex' | 'morgan'; text: string }[];
    status: 'idle' | 'pending' | 'processing' | 'complete' | 'failed';
    feedback: null | {
      objectivePoints: number; communicationPoints: number; overall: number; model: string;
      assessment: { dimensions: { key: string; level: number; explanation: string; evidence: { segmentId: string; quote: string }[] }[] };
    };
  };
  code: string;
  mode: "text" | "voice";
  phase: "waiting" | "prep" | "talk" | "finalize" | "complete" | "incomplete";
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
  accepted: ("alex" | "morgan")[];
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

const TOKENS_KEY = "playcall-room-tokens";
const HISTORY_KEY = "playcall-round-history";
const PROFILE_KEY = "playcall-local-profile";

export function saveRoomToken(code: string, token: string) {
  try {
    const map = JSON.parse(
      sessionStorage.getItem(TOKENS_KEY) || "{}",
    ) as Record<string, string>;
    map[code.toUpperCase()] = token ? "cookie-session" : "";
    sessionStorage.setItem(TOKENS_KEY, JSON.stringify(map));
  } catch {}
}

export function getRoomToken(code: string): string | null {
  try {
    const map = JSON.parse(
      sessionStorage.getItem(TOKENS_KEY) || "{}",
    ) as Record<string, string>;
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
  return { callsign: "", ageConfirmed: false, leaderboardOptIn: false };
}

export function saveProfile(next: Partial<LocalProfile>): LocalProfile {
  const merged = { ...getProfile(), ...next };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
  } catch {}
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
  if (history.some((h) => h.id === id)) return;
  const pkg = view.packages.find((p) => p.id === view.deal?.package);
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
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify([entry, ...history].slice(0, 20)),
    );
  } catch {}
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  await ensureSession();
  const res = await fetch(path, { ...init, credentials: "same-origin" });
  const body = await res
    .json()
    .catch(() => ({ error: "Unexpected server response." }));
  if (!res.ok) {
    throw new Error(
      body?.error?.message || body?.error || `Request failed (${res.status})`,
    );
  }
  return body as T;
}

let sessionPromise: Promise<void> | undefined;
export function ensureSession(): Promise<void> {
  return (sessionPromise ??= (async () => {
    const me = await fetch("/api/me", { credentials: "same-origin" });
    if (!me.ok) throw new Error("Please sign in with a registered account.");
    const account = await me.json();
    if (account.guest) throw new Error("Please sign in with a registered account.");
  })().catch((error) => {
    sessionPromise = undefined;
    throw error;
  }));
}
export async function syncAccount() {
  await ensureSession();
  const [profile, history] = await Promise.all([
    requestJson<{ displayName: string; leaderboardOptIn: boolean }>(
      "/api/me/settings",
    ),
    requestJson<{ rounds: RoomView[] }>("/api/vc/me/history"),
  ]);
  saveProfile({
    callsign: profile.displayName,
    leaderboardOptIn: profile.leaderboardOptIn,
  });
  localStorage.removeItem(HISTORY_KEY);
  for (const round of [...history.rounds].reverse()) {
    saveRoomToken(round.code, "cookie-session");
    recordCompletedRound(round);
  }
}
export async function persistProfile(next: Partial<LocalProfile>) {
  const previous =
    await requestJson<Record<string, unknown>>("/api/me/settings");
  const { guest: _guest, ...settings } = previous;
  await requestJson("/api/me/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...settings,
      displayName: next.callsign ?? getProfile().callsign,
      leaderboardOptIn: next.leaderboardOptIn ?? false,
    }),
  });
  return saveProfile(next);
}

export async function startSparring(
  role?: "alex" | "morgan" | "random",
): Promise<RoomView> {
  const view = await requestJson<RoomView>("/api/vc/sparring", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      consent: true,
      role: role === "random" ? undefined : role,
    }),
  });
  if (view.token) saveRoomToken(view.code, view.token);
  return view;
}

export async function requestStrangerMatch(): Promise<RoomView> {
  const view = await requestJson<RoomView>("/api/vc/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consent: true }),
  });
  if (view.token) saveRoomToken(view.code, view.token);
  return view;
}

export async function createPrivateRoom(): Promise<RoomView> {
  const view = await requestJson<RoomView>("/api/vc/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consent: true, mode: "text" }),
  });
  if (view.token) saveRoomToken(view.code, view.token);
  return view;
}

export async function joinRoomByCode(code: string): Promise<RoomView> {
  const view = await requestJson<RoomView>("/api/vc/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ consent: true, code: code.trim().toUpperCase() }),
  });
  if (view.token) saveRoomToken(view.code, view.token);
  return view;
}

export async function fetchRoom(
  code: string,
  token: string,
): Promise<RoomView> {
  return requestJson<RoomView>(
    `/api/vc/room?code=${encodeURIComponent(code)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}

export async function sendRoomAction(
  code: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<RoomView> {
  return requestJson<RoomView>("/api/vc/action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
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
  const res = await requestJson<{ entries: LeaderboardEntry[] }>(
    "/api/vc/leaderboard",
  );
  return res.entries;
}

export async function submitLeaderboardScore(
  code: string,
  token: string,
  callsign: string,
): Promise<LeaderboardEntry[]> {
  const res = await requestJson<{ entries: LeaderboardEntry[] }>(
    "/api/vc/leaderboard",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code, callsign }),
    },
  );
  return res.entries;
}
