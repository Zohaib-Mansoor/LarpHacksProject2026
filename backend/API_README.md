# PlayCall API

**React realtime VC API:** see [VOICE_INTEGRATION.md](../docs/VOICE_INTEGRATION.md)
for `/api/vc/*`, cookie-authenticated matchmaking, SSE, signaling, audio fallback,
and durable 60-point Satellite Deal rooms. The detailed structured scenario API
below remains available and uses its separate 300-point contract.

The API behind the PlayCall text demo: accounts, private settings, two-player
rooms, negotiation, chat, saved results, and history.

**Local base URL:** `http://127.0.0.1:4173`

**OpenAPI:** [live specification](http://127.0.0.1:4173/api/openapi.json)

**Public types:** [client/contracts.ts](client/contracts.ts) — use type-only imports.

This document describes **`DEMO_MODE=true`**, the default running app. It uses
polling and PostgreSQL. Audio, WebSockets, and workers are not registered. Optional
Gemini scene generation runs server-side when GEMINI_API_KEY is configured;
conversation grading remains off in text mode.
The imported experimental API is documented separately in [docs/API.md](docs/API.md).

## Start locally

From the repository root:

```powershell
npm --prefix backend ci
Copy-Item backend/.env.example backend/.env
```

Configure a new PostgreSQL database and a random `BETTER_AUTH_SECRET` in
`backend/.env`. Keep the frontend and auth origin identical:

```dotenv
PORT=4173
DEMO_MODE=true
DATABASE_URL=postgresql://rolecall:rolecall_local@localhost:5432/rolecall_integrated
BETTER_AUTH_URL=http://127.0.0.1:4173
CLIENT_ORIGINS=http://127.0.0.1:4173
AI_PROVIDER=gemini
GEMINI_MODEL=gemini-3.1-flash-lite
# Set GEMINI_API_KEY privately in backend/.env.
```

Generate the secret with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm run db:migrate
npm run build
npm start
```

The frontend is served by the same Fastify process. Full database, Docker, and
deployment instructions are in [the integration guide](../docs/INTEGRATION.md).
Do not apply the old root-level migrations to the integrated database.

Creating a room uses Gemini when enabled. To explicitly choose the fixed practice
sample instead, POST `/api/rooms` with `{ "scenarioSource": "builtin" }`. An AI
generation error returns 502 and does not silently create a sample room.

## Request conventions

- Send and retain Better Auth's **HttpOnly session cookies**.
- Every mutation requires `Origin` matching `BETTER_AUTH_URL` exactly, including
  scheme, hostname, and port. Browsers set this automatically.
- Send JSON bodies with `Content-Type: application/json`.
- Application API responses use `Cache-Control: no-store`.
- Request bodies are limited to 16 KiB. Settings and game commands reject
  unexpected fields.
- The default limit is 300 requests/minute per IP and API process; authentication
  has a 30/minute route limit, and room creation has a 10/minute route limit.
  Better Auth may also apply its own endpoint limits.
- Invite tokens appear only in the create response and shared URL fragment.
  Send them in the join request body, never logged query strings.

Use the same hostname throughout: `localhost` and `127.0.0.1` are different
origins. The demo does not enable cross-origin browser access.

## Quick start: guest and room

PowerShell keeps the cookie session in `$session`:

```powershell
$base = 'http://127.0.0.1:4173'
$headers = @{ Origin = $base }

Invoke-WebRequest "$base/api/auth/sign-in/anonymous" -Method Post `
  -Headers $headers -ContentType 'application/json' -Body '{}' `
  -SessionVariable session | Out-Null

Invoke-RestMethod "$base/api/me" -WebSession $session

$created = Invoke-RestMethod "$base/api/rooms" -Method Post `
  -Headers $headers -WebSession $session -ContentType 'application/json' -Body '{}'

$roomId = $created.room.id
$inviteLink = "$base/#invite=$($created.inviteToken)"
$inviteLink
```

Open that link in a **different browser profile or private window**. Two tabs
sharing the same cookies are the same player and cannot occupy both seats.

Browser client equivalent:

```js
await fetch('/api/auth/sign-in/anonymous', {
  method: 'POST',
  credentials: 'same-origin',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
});
```

First check `/api/me`; create an anonymous session only after a 401. Do not
create a new guest on every render or persist auth cookies/tokens in JavaScript.

## Authentication and account data

| Method | Path                          | Request                   | Success                                              |
| ------ | ----------------------------- | ------------------------- | ---------------------------------------------------- |
| POST   | `/api/auth/sign-in/anonymous` | `{}`                      | Guest identity and session cookie                    |
| POST   | `/api/auth/sign-up/email`     | `{name,email,password}`   | Account and session cookie                           |
| POST   | `/api/auth/sign-in/email`     | `{email,password}`        | Existing account session                             |
| POST   | `/api/auth/sign-out`          | `{}`                      | Revokes current session                              |
| GET    | `/api/me`                     | —                         | `{authenticated:true,guest:boolean}`                 |
| GET    | `/api/me/settings`            | —                         | Own settings plus `guest` flag                       |
| PATCH  | `/api/me/settings`            | All settings fields below | Saved settings plus `guest` flag                     |
| GET    | `/api/me/stats`               | —                         | Own rating, tier, XP, rounds, wins/losses/draws      |
| GET    | `/api/me/history`             | —                         | `{rooms:[...]}`; latest 50 rooms owned/joined by you |

Passwords must have at least 12 characters. Better Auth handles password storage
and verification. Registering or signing in while a guest transfers guest room
membership, ownership, statistics, and settings. Existing destination settings
are preserved. Linking two identities already occupying one room is rejected.

Email verification and password-reset delivery require mail-provider setup before
public launch. An unlinked guest account cannot be recovered after losing its
cookies. Optional Google sign-in needs separate provider configuration.

### Settings body

```json
{
  "displayName": "My private nickname",
  "theme": "dark",
  "captions": true,
  "reducedMotion": false
}
```

`displayName` is 1–40 characters and must contain non-whitespace. `theme` is
`system`, `light`, or `dark`. Both other fields are booleans. All four fields are
required when updating. The private name never replaces fictional room aliases.

History entries contain `id`, `title`, `createdAt`, `expiresAt`, `rounds`, `state`,
and the caller's latest-round `points` (or null). They contain no opposing briefs.

## Room endpoints

| Method | Path                          | Body                        | Success                       |
| ------ | ----------------------------- | --------------------------- | ----------------------------- |
| POST   | `/api/rooms`                  | `{}`                        | 201: `{room,inviteToken}`     |
| POST   | `/api/rooms/join`             | `{inviteToken}`             | 200: private snapshot         |
| GET    | `/api/rooms/:roomId`          | —                           | 200: private snapshot         |
| POST   | `/api/rooms/:roomId/commands` | `{expectedVersion,command}` | 200: updated private snapshot |
| GET    | `/api/rooms/:roomId/messages` | —                           | 200: `{messages:[...]}`       |
| POST   | `/api/rooms/:roomId/messages` | `{text}`                    | 201: `{saved:true}`           |

Invites contain 43 URL-safe characters. Rooms hold at most two distinct users.
Joining again as an existing member keeps the same seat. Room access expires
after 24 hours; expiry does not automatically delete stored records.

### Snapshot shape

```ts
type RoomSnapshot = {
  id: string;
  version: number;
  ranked: boolean;
  serverTime: number; // Unix milliseconds
  scenario: {
    key: string;
    title: string;
    description: string;
    amountLabel: string;
    source: 'builtin' | 'ai';
  };
  members: Array<{
    seat: number;
    alias: string;
    isYou: boolean;
    ready: boolean;
    consented: boolean;
  }>;
  round: null | {
    id: string;
    number: number;
    state: 'briefing' | 'negotiating' | 'completed';
    briefEndsAt: number;
    endsAt: number;
    endedAt: number | null;
    outcome: 'agreement' | 'no_agreement' | null;
    yourRole: 'buyer' | 'seller';
    yourBrief: {
      jobTitle: string;
      character: string;
      background: string;
      hardLimit: string;
      objectives: string[];
    };
    proposal: null | {
      id: string;
      revision: number;
      authorSeat: number;
      terms: Terms;
      acceptedSeats: number[];
    };
    deal: Terms | null;
    results: null | {
      objectives: Array<{
        key: string;
        description: string;
        achieved: boolean;
        points: number;
      }>;
      total: number;
      opponentTotal: number;
    };
  };
};

type Terms = {
  priceCredits: number; // integer 1..1000
  deliveryDays: number; // integer 1..7
  exclusive: boolean;
};
```

The server filters each response for the authenticated member. The snapshot never
contains the other player's brief, objectives, email, auth ID, or invite hash.
Only competitive totals are shared in results; objective explanations stay private.

### Commands

Every command requires the latest `room.version` as `expectedVersion`:

```json
{
  "expectedVersion": 7,
  "command": {
    "type": "propose",
    "terms": {
      "priceCredits": 575,
      "deliveryDays": 3,
      "exclusive": false
    }
  }
}
```

| Command   | Additional fields  | Rules                                                                       |
| --------- | ------------------ | --------------------------------------------------------------------------- |
| `consent` | `granted: boolean` | Acknowledge before readying; withdrawal ends an active round without a deal |
| `ready`   | —                  | Both players consent and ready independently                                |
| `propose` | `terms`            | Negotiation only; creates a new revision and clears confirmations           |
| `accept`  | `proposalId: UUID` | Explicit acceptance of the exact current proposal                           |
| `rematch` | —                  | After completion; both ready independently; roles swap                      |

The second ready starts a 45-second briefing followed by five minutes of
negotiation. Both acceptances of one proposal finish the round early. Without
agreement at the deadline, the server completes it as no agreement. A player
cannot accept terms violating their own private price limit. A room permits up
to 20 rounds.

The active imported scenario uses three objectives worth 100 points each: **300
mission points maximum**. Scoring is deterministic server code. No agreement earns
zero. AI coaching is not part of this running mode.

For acceptance, send the exact proposal ID shown to the player:

```json
{
  "expectedVersion": 8,
  "command": {
    "type": "accept",
    "proposalId": "00000000-0000-4000-8000-000000000001"
  }
}
```

On a 409, fetch a new snapshot and ask the player to review it. **Never
automatically accept a replacement proposal.**

## Text messages and polling

Messages are allowed during negotiation only. Each round permits 200 messages,
each containing 1–1000 nonblank characters. The server assigns the sender's seat;
clients cannot choose it. Text is not speech evidence and is not sent to an LLM.

```json
{ "text": "Could we trade a later delivery for a lower price?" }
```

The read endpoint returns the current round's messages:

```ts
type MessageResponse = {
  messages: Array<{
    id: number;
    seat: number;
    text: string;
    createdAt: string; // ISO timestamp
  }>;
};
```

Poll room and message endpoints once per second while visible. Schedule the next
poll after the previous one finishes. Ignore snapshots older than the current
version. Pause in hidden tabs and refresh on return. Use `serverTime` for countdown
offsets; the browser clock never decides when a round ends.

Escape message text when rendering it; do not use it as HTML. The supplied frontend
does this. Persisted deadlines and results survive application restarts.

## Errors and health

Application error example:

```json
{
  "error": {
    "code": "STALE_VERSION",
    "message": "Room changed. Refresh its snapshot before retrying."
  },
  "requestId": "req-example"
}
```

| HTTP | Typical codes                                                                                                        | Client action                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 400  | `INVALID_REQUEST`, `INVALID_TERMS`                                                                                   | Correct the request                                        |
| 401  | `UNAUTHENTICATED`                                                                                                    | Sign in; do not retry a write blindly                      |
| 403  | `INVALID_ORIGIN`                                                                                                     | Match the configured origin                                |
| 404  | `NOT_FOUND`, `NOT_A_MEMBER`, `INVALID_INVITE`                                                                        | Check invite/access                                        |
| 409  | `STALE_VERSION`, `STALE_PROPOSAL`, `ROOM_FULL`, `CONSENT_REQUIRED`, `HARD_LIMIT`, `NOT_NEGOTIATING`, `MESSAGE_LIMIT` | Refresh and explain the conflict                           |
| 410  | `ROOM_EXPIRED`                                                                                                       | Create a new room                                          |
| 429  | `RATE_LIMITED`                                                                                                       | Back off before retrying                                   |
| 500  | `INTERNAL_ERROR`                                                                                                     | Retry reads cautiously; investigate server/database health |

Authentication errors use Better Auth's own response format.

- `GET /health` → 200 `{status:"ok"}`.
- `GET /ready` → 200 `{status:"ready"}`, or 503 `{status:"unavailable"}`.
- `GET /api/config` → active feature flags and processing notice.
- `GET /api/openapi.json` → generated request-schema documentation.

Unknown API paths return JSON 404 responses, never the frontend HTML.

## Verification

```powershell
npm run check
npm test
npm run build
npm --prefix backend run test:browser
```

The browser test needs the local server running. It exercises settings, account
creation, two distinct sessions, private briefs, typed chat, revision resets,
two-party confirmation, results, reload persistence, and mobile layout.
For real PostgreSQL concurrency tests, follow the fresh test-database instructions
in [INTEGRATION.md](../docs/INTEGRATION.md).

# Timed voice turns and coaching

See [the voice integration API](../docs/VOICE_INTEGRATION.md#speaking-turns-and-optional-ai-coaching) for `/api/vc/coaching/consent`, `/api/vc/coaching/transcribe`, and `/api/vc/coaching/evaluate`. Voice calls alternate six 45-second speaking turns with a 10-second warning and automatic microphone muting. Coaching needs both players' opt-in plus server-side ElevenLabs and LLM keys; it remains disabled without them. Mission scoring works independently.

## Server-driven frontend configuration

`GET /api/vc/config` returns public scenario identities, legal proposal prices/packages, timing rules, mission limits, and authored demo dialogue. It never returns private briefs. `GET /api/vc/me/summary` returns authenticated all-time `{points, rounds, deals}` from PostgreSQL, independent of the bounded history list. `POST /api/vc/preview` accepts `{deal, confirmed, code?}`; with a room code it returns only the authenticated player’s `{yours}` objective-point preview. Without a code it returns `{scores}` for the explicitly labelled public sandbox. Final scores still require the signed revision.
