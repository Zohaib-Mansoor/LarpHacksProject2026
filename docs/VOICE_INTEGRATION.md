# React + realtime voice + PostgreSQL

Merged sources: `supert33/realtime-vc` (`28795a8`) and `codex/backend` (`268792a`).
React/Vite is now served by Fastify on the same origin as Better Auth and PostgreSQL.
The standalone in-memory server remains a prototype, not the default application.

## Run

```powershell
npm --prefix web ci
npm --prefix backend ci
# Configure backend/.env as described in INTEGRATION.md.
npm run db:migrate
npm run build
npm start
```

Open http://127.0.0.1:4173/play. For frontend HMR run `npm run web:dev` with the
backend running; its local proxy forwards same-origin API and SSE traffic.

Use different browser profiles/private contexts for the two players. Two normal
tabs with the same session cookie are the same person. For solo testing, choose
the labelled scripted sparring partner. It uses deterministic rules and browser
speech synthesis, not an LLM pretending to be a human.

## What is connected

- Guest and email/password sessions use the real Better Auth cookie.
- Preferences load from `user_settings` and save through `/api/me/settings`.
- React room/game/call requests use `/api/vc/*`, not the old prototype endpoints.
- `voice_rooms` persists game state, two authenticated seats, proposal revisions,
  confirmations, messages, deadlines, reveal choices, and rematches.
- `voice_results` stores each player's private receipt once per room/round/user.
- History reloads from PostgreSQL. Browser storage is only a display cache and
  room marker; `cookie-session` is not a credential and cannot grant access.
- Opt-in standings are calculated from settled server results. Reposting cannot
  create duplicate points. Account linking transfers voice ownership and receipts.

Migration `0005` adds these two tables and the standings preference. It preserves
the imported database and earlier records; it does not rewrite auth IDs.

## Matchmaking

`POST /api/vc/match` implements a FIFO queue backed by PostgreSQL. A transaction
and advisory lock serialize pairing; one person cannot occupy both seats. Retries
resume their current queued/matched room. Leaving cancels their waiting entry.
Expired waiting rooms are excluded. This is invite/demo matchmaking, not a public
abuse-prevention or identity-verification system.

## Voice transport

The branch's glare-safe WebRTC hook uses the authenticated SSE signaling bus. The
answerer reuses the offered audio transceiver, fixing the source branch's one-way
audio issue. Tests verify RTP audio reaches both browsers, not just ICE connectivity.

If direct WebRTC is blocked, bounded PCM frames can relay through HTTP POST + SSE.
Audio, signaling, presence, and interim captions are transient and are not saved
to the database. This bus currently requires one API instance or sticky routing;
multiple replicas need a shared transient message transport.

Microphone capture starts only from a user action. Camera capture is disabled by
HTTP policy. Mute/PTT controls disable the actual sender track. CC is opt-in and
may use the browser vendor's recognition service. Typed notes are labelled text.
P2P can expose network addresses to the other participant; voices are identifying.
PCM fallback passes through the app server in memory. HTTPS is required publicly.

## Active React API

All endpoints use the session cookie. POST requests require the configured Origin.
Code is six uppercase hexadecimal characters. Client-supplied bearer markers and
speaker IDs never replace session/membership checks.

| Method | Endpoint                               | Purpose                                                  |
| ------ | -------------------------------------- | -------------------------------------------------------- |
| POST   | `/api/vc/rooms`                        | `{consent:true,mode:"text"}` creates an invite room      |
| POST   | `/api/vc/join`                         | `{code,consent:true}` claims the second seat             |
| POST   | `/api/vc/match`                        | `{consent:true}` queues/pairs a player                   |
| POST   | `/api/vc/sparring`                     | `{consent:true,role?:"alex"                              | "morgan"}` starts scripted practice |
| GET    | `/api/vc/room?code=...`                | Caller-specific room view                                |
| POST   | `/api/vc/action`                       | `{code,type,...fields}` applies a game action            |
| GET    | `/api/vc/call-stream?code=...`         | Authorized SSE: sync, signal, presence, telemetry, audio |
| POST   | `/api/vc/call-signal`                  | `{code,signal}` sends bounded SDP/ICE to the peer        |
| GET    | `/api/vc/call-signal?code=...&after=0` | Bounded transient signal replay                          |
| POST   | `/api/vc/call-telemetry`               | `{code,speaking?,muted?,interim?}`                       |
| POST   | `/api/vc/call-audio`                   | `{code,rate,pcm}` sends bounded base64 PCM16             |
| GET    | `/api/vc/me/history`                   | Own persisted receipts only                              |
| GET    | `/api/vc/leaderboard`                  | Opt-in aggregate standings                               |
| POST   | `/api/vc/leaderboard`                  | `{code,callsign}` publishes own verified score once      |

Actions: ready, mute, message, propose, confirm, decline, reveal, rematch, leave,
report. A proposal is `{price:450..600 in steps of 25,package:"phased"|"full-6"|"full-8"}`.
Confirm requires the exact current `revision`; stale acceptance gets 409. Editing
terms clears both confirmations. Secret objectives reveal only with mutual consent.
The Satellite Deal uses three 20-point goals (60 maximum).

The pre-existing `/api/rooms/:id/commands` structured scenario API remains available
for the separate 300-point backend scenario. Do not mix its IDs/contracts with VC
room codes. `/api/openapi.json` includes the new routes as well.

## Checks

```powershell
npm run check
npm test
npm run build
npm --prefix backend run test:browser
```

Real PostgreSQL tests use fresh dedicated `TEST_DATABASE_URL` and
`DEMO_TEST_DATABASE_URL` databases. The browser regression runs two independent
contexts with synthetic microphones, verifies bidirectional RTP, mute/unmute,
proposal resets, signatures, saved receipts, reload, and profile persistence.
No physical microphone is recorded by these tests. Remote NAT/firewall combinations
and real devices still need deployment/device testing.

Render's blueprint now targets main. The Docker image includes React's built
assets and the server-only game engine. Docker execution remains unverified on
this machine because its Docker daemon cannot start.

# Speaking turns and optional AI coaching

The voice game has six alternating 45-second turns (Alex first), then a 45-second signing window. A visible reminder appears with 10 seconds left. The browser disables the actual outgoing microphone track outside its turn, including preparation, pauses, and signing. The receiver suppresses off-turn audio; the HTTP PCM relay also rejects off-turn uploads on the server. Direct WebRTC muting relies on these application clients, not a server media mixer.

AI coaching is disabled without `ELEVENLABS_API_KEY` plus the existing Gemini or OpenAI configuration. No keys are included. Both players opt in during preparation. Each browser records only its own permitted speaking turn, sends the bounded clip to the authenticated backend, and the backend calls ElevenLabs Scribe v2. Audio is kept only in memory for the request; provider retention policies apply. Text and private feedback persist in the existing room/result JSONB, with no new migration.

After a completed round, the results screen requests private rubric feedback from the configured LLM. The model receives conversation transcripts and only the assessed player's brief. Every rubric category must cite a verified quote from that player's speech. Mission achievement stays deterministic: 60 points from the signed deal, plus up to 40 communication points. Missing speech, missing keys, and provider failures show unavailable feedback instead of a fabricated score. AI scores do not change the mission leaderboard.

Authenticated, same-origin APIs:

| Endpoint                           | Body                               | Behavior                                                                                         |
| ---------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `POST /api/vc/coaching/consent`    | `{code, round, granted}`           | Consent before speaking starts; both seats must opt in.                                          |
| `POST /api/vc/coaching/transcribe` | `{code, round, turn, mime, audio}` | Zero-based turn; base64 audio, max 1 MB decoded; only own ended turn, idempotent once committed. |
| `POST /api/vc/coaching/evaluate`   | `{code, round}`                    | Completed round; waits for clips, verifies evidence, returns only caller's feedback.             |

All three return the caller-filtered room view with `speakingTurn` and `coaching`. Limits bound upload size, rate, retries, and provider timeouts. Tests mock the providers; real paid provider calls require separately configured keys.
