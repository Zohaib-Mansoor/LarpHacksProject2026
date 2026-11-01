# RoleCall backend

## Integrated app (default)

`DEMO_MODE=true` serves the PlayCall frontend and PostgreSQL-backed API on one
origin. It uses polling and text chat, with no audio, WebSockets, or worker loops
registered. Optional Gemini scene generation uses GEMINI_API_KEY on the server.
Accounts, settings, history, messages, and results persist. Conversation grading
remains disabled in text mode.

See [the integration guide](../docs/INTEGRATION.md) for setup and the active API.
See [API_README.md](API_README.md) for endpoint contracts, cookie authentication,
PowerShell examples, polling, and errors.
The sections below describe the imported experimental backend; its optional media
and AI routes are not mounted in the default text demo.

Local Fastify + TypeScript API for a two-player negotiation game. The AI generates
a fictional situation, two job titles and private objectives. Players negotiate a
price, delivery schedule and exclusivity, confirm the same deal, and earn points.
Ranked matches update Elo; transcript-based AI feedback uses a published rubric.

## Run locally

Use Node.js 24 LTS and PostgreSQL 17 (or Docker Desktop with its Linux engine running).
From this directory:

```powershell
npm ci
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Paste that generated secret into BETTER_AUTH_SECRET in .env. Set GEMINI_API_KEY
(and AI_PROVIDER=gemini) for Gemini situations and the experimental grading adapter.
OPENAI_API_KEY remains an optional alternative provider. ELEVENLABS_API_KEY is
needed for live speech to text in the experimental voice mode.
These are server secrets; never put them in Vite variables or client code. On
macOS/Linux, use cp .env.example .env instead of Copy-Item.

```powershell
docker compose up -d db
npm run db:migrate
npm run dev
```

For an existing database, set DATABASE_URL and skip Docker. The API listens on
http://localhost:3001. GET /health checks the process; GET /ready checks the DB.
Without provider keys, the built-in practice scenario works, and provider-dependent
endpoints report unavailable. No generated content or feedback is simulated.

## Game flow

1. Guest sign-in (or optional Google sign-in).
2. Create a room. With an AI key, generate and validate a fresh situation immediately.
3. Invite the second player. The owner can select ranked mode before anyone readies.
4. Both players explicitly acknowledge audio, transcription, and AI processing.
5. Read private briefs for 45 seconds, then negotiate for five minutes.
6. Confirm an identical structured proposal. Editing terms clears both confirmations.
7. Receive objective points, Elo changes when ranked, and asynchronous AI feedback.
8. Rematch with roles swapped, or generate a fresh situation before readying again.

Generated scenarios are frozen with each round, including their model, targets and
hard limits. Scoring code evaluates that saved definition. Never revise a scenario
already used by a round. The AI cannot declare a deal or award objective points.

## Direct calls and speech to text

The browser helper at [client/voice.ts](client/voice.ts) uses RTCPeerConnection for
encrypted browser-to-browser audio. The API passes SDP/ICE signaling messages only;
it does not receive the peer call media. The old SFU audio-token endpoint returns 410.

RTC_ALLOW_RELAY=false is the default. STUN discovers connectivity; it does not carry
the call. Direct-only calls can fail on restrictive networks. If you explicitly
enable relay, configure coturn's shared-secret authentication via TURN_URL and
TURN_SHARED_SECRET. Temporary TURN credentials expire after ten minutes. Relayed
WebRTC audio remains encrypted between browsers, but is no longer a direct path.

For grading, a separate copy of each player's microphone goes to an authenticated
backend WebSocket, which forwards PCM audio to ElevenLabs Scribe v2 Realtime.
Only provider-committed text is persisted. A browser cannot upload its own transcript
text or choose another player's speaker ID. The two streams are bound to the two
authenticated seats, rather than guessed from a mixed audio recording.

This processing means ElevenLabs receives that microphone copy and OpenAI receives
the transcript text. It is not a promise that third parties cannot access the
transcription input. Display /api/config.audioNotice before consent. Withdrawing
consent ends the round and stops accepting transcription. Raw audio is not stored
by this backend. Transcript text and quote-based feedback expire after seven days;
cleanup runs every 30 seconds while the API is running. Provider retention follows
each provider's policies. Server arrival offsets are approximate, not word timestamps.

Client code must disconnect at the round deadline, completed state, and logout.
The helper does this on deadline and when signaling stops being authorized.
A server cannot forcibly disconnect two modified clients that continue talking
directly; competitive deal commands still stop at the server deadline.

## Scores and rankings

See the complete [grading rubric](docs/SCORING.md).

- Three objectives × 100 = 300 mission points maximum.
- Overall grade /100 = 60 objective points + 40 AI communication points.
- Elo starts at 1000, uses K=32, and updates once per completed ranked round.
- Practice earns objective XP without changing Elo.
- The first five ranked games are provisional; tiers run Bronze through Master.
- Missing or insufficient transcripts produce an unavailable AI grade, not zero.
- Public rankings use generated handles, never account names, emails or user IDs.

Elo uses mission outcomes, not AI feedback. Audio from an untrusted browser cannot
prove what was actually said on the peer call, so AI grades are coaching estimates.
Invite-based ranked play is an MVP; matchmaking, anti-collusion, abuse controls,
and rating calibration are needed before a public competitive launch.

## Frontend integration

[docs/API.md](docs/API.md) documents endpoints, commands, direct-call integration and
the new debrief. GET /api/openapi.json exposes request schemas. Never import
src/game.ts or src/scenario.ts into browser runtime code: they contain private roles.

Google sign-in is optional. Configure both Google variables, and register
<BETTER_AUTH_URL>/api/auth/callback/google with Google. Guest ownership and stats
move transactionally; combining two seats in one room is rejected. If an established
account already has rating history, its Elo is preserved while XP is combined.
Google OAuth still needs actual provider setup and browser verification.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run format:check
```

Local integration tests use an isolated PGlite PostgreSQL engine, real Better Auth
sessions, HTTP/WebSocket routes, and injected AI/speech providers. They require no
API keys and make no paid provider calls. The API suite uses real PostgreSQL when
TEST_DATABASE_URL is supplied; CI supplies it and tests simultaneous writes.
PGlite is single-connection and cannot establish PostgreSQL locking correctness.
The AI/speech feature suite remains isolated in PGlite.

Real provider keys, Google OAuth, and a two-browser microphone test are still needed
to verify live external integration and device/network behavior.

Generate application migrations with npm run db:generate. When changing auth
plugins, run npm run auth:generate first. Review and commit SQL plus package-lock.json.
Never apply migrations automatically at API startup. The lockfile overrides
transitive esbuild/minimatch to patched releases; schema generation and lint are
tested with those versions.

## Persistence and deployment

PostgreSQL is authoritative. Each bounded game aggregate (two members, twenty
rounds) is serialized by a row lock and version check. Separate tables store stats,
idempotent round settlements, transcript segments, transcription leases, ephemeral
signaling, and leased AI evaluation jobs. A legacy media cleanup table remains for
migration compatibility; new calls never use the legacy SFU endpoint.

Deadlines survive restarts. Evaluation jobs retry up to three times after transient
failures, verify every evidence quote, and never block the timer worker. Signaling
expires after 30 seconds. Room access expires after 24 hours; room/auth history is
not automatically deleted. Define a full account deletion policy before launch.

Build with docker build -t rolecall-api . from this directory. Supply secrets and
a managed PostgreSQL connection through the deployment environment. Run
node dist/db/migrate.js once as a release task, then start the image.

Set NODE_ENV=production, HOST=0.0.0.0, exact HTTPS CLIENT_ORIGINS, and an HTTPS
BETTER_AUTH_URL. Prefer one hostname: frontend at /, proxy /api/* to the API with
WebSocket upgrades. PCM capture needs HTTPS (localhost is allowed for development).

The API must stay running for deadline, evaluation, and retention work. WebSocket
snapshots and signaling poll PostgreSQL for this MVP. Rate limits are per process
and use the socket IP. Configure trusted proxy rules and shared/edge rate limits
before scaling. Do not blindly trust forwarded IP headers.

This work does not provision hosting, publish a website, or commit/push the repo.

References: [ElevenLabs realtime protocol](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime),
[OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[WebRTC connectivity](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity).
