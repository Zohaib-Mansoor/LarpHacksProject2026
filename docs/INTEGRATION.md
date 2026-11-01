# Integrated PlayCall app

## Architecture

Imported backend: `codex/backend`, commit `969fda7`. Imported visual prototype:
`codev/supert33/work`, commit `0df1a9b`. The app reuses the backend's game rules,
row-locking persistence, Better Auth, scoring, statistics, and account linking.

`backend/src/demo-app.ts` is the default entry point. Fastify serves the frontend
and API on one origin. Polling reconciles persisted deadlines. No WebSockets,
media routes, or worker loops are registered. Optional server-side Gemini scene
generation is available when configured. `DEMO_MODE=false` opts into the original
experimental voice backend instead.

### Gemini configuration

Keep `GEMINI_API_KEY` in the ignored `backend/.env`, never in frontend code.
Set `AI_PROVIDER=gemini` and `GEMINI_MODEL=gemini-3.1-flash-lite` (the model verified
with the current local key). The integrated UI generates real situations when
creating a room. Generation errors are shown; they never silently become sample
data. The separate **Use built-in practice scene** button explicitly requests the
fixed sample without contacting an AI provider. The text-mode app still does not
transcribe audio or grade conversation content. Gemini's grading adapter is also
available to the experimental backend.

UI live testing can use a separate scripted guest that joins through the real
API; such messages must be visibly labelled synthetic. Stop and sign that guest
out afterward. No mock data routes or bypasses are registered in the normal app.

Use **a new empty database**: the imported auth IDs are text, incompatible with
the earlier UUID database. The user approved the expanded schema. The active
database is `rolecall_integrated`; the earlier `rolecall` database is untouched.
New migration `0004` adds `user_settings` and `room_messages`. Imported migrations
are preserved. Dormant media/evaluation records are not processed in text mode.

## Local setup (PowerShell)

Requires Node.js 24 and PostgreSQL 16+. With Docker Desktop running:

```powershell
docker run --name playcall-db -e POSTGRES_USER=rolecall -e POSTGRES_PASSWORD=rolecall_local -e POSTGRES_DB=rolecall_integrated -p 127.0.0.1:5432:5432 -v playcall_pgdata:/var/lib/postgresql/data -d postgres:16
npm --prefix backend ci
Copy-Item backend/.env.example backend/.env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put the generated secret in `backend/.env` as `BETTER_AUTH_SECRET`. Keep
`DEMO_MODE=true`, `PORT=4173`, `BETTER_AUTH_URL=http://127.0.0.1:4173`, and matching
`CLIENT_ORIGINS`. Set DATABASE_URL to the new database, then:

```powershell
npm run db:migrate
npm run build
npm start
```

Open http://127.0.0.1:4173/. Development: `npm run dev`. Use the same hostname as
the auth URL. No CORS/proxy setup is needed. Invites carry tokens in fragments,
not logged query strings. Email/password and anonymous sessions use HttpOnly
cookies; frontend storage contains only room IDs and invite links.

On this machine Docker cannot start, so native PostgreSQL 16.11 runs on loopback
port 15432, using the same SQL and `pg` driver. Its data and binaries are outside Git.

## Active API

Mutations require a matching Origin header (automatic in browsers). Application
errors return `{ error: { code, message }, requestId }`; auth uses Better Auth's
own format. Registered request schemas: `/api/openapi.json`. Browser type-only
contracts: `backend/client/contracts.ts`. Never import private game code into the
browser at runtime.

| Method | Endpoint                      | Body / result                                     |
| ------ | ----------------------------- | ------------------------------------------------- |
| POST   | `/api/auth/sign-in/anonymous` | `{}` → guest session                              |
| POST   | `/api/auth/sign-up/email`     | `{name,email,password}` → permanent account       |
| POST   | `/api/auth/sign-in/email`     | `{email,password}` → session                      |
| POST   | `/api/auth/sign-out`          | `{}` → revoke session                             |
| GET    | `/api/me`                     | Authentication state and guest flag               |
| GET    | `/api/me/settings`            | Own display name, theme, captions, reduced motion |
| PATCH  | `/api/me/settings`            | `{displayName,theme,captions,reducedMotion}`      |
| GET    | `/api/me/stats`               | Own completed rounds, XP, and rating data         |
| GET    | `/api/me/history`             | Own latest 50 rooms and own latest-round score    |
| POST   | `/api/rooms`                  | `{}` → `{room,inviteToken}`                       |
| POST   | `/api/rooms/join`             | `{inviteToken}` → private snapshot                |
| GET    | `/api/rooms/:roomId`          | Recipient-specific snapshot                       |
| POST   | `/api/rooms/:roomId/commands` | `{expectedVersion,command}` → snapshot            |
| GET    | `/api/rooms/:roomId/messages` | Current-round typed messages                      |
| POST   | `/api/rooms/:roomId/messages` | `{text}`; 1–1000 nonblank characters              |
| GET    | `/health`                     | Process health                                    |
| GET    | `/ready`                      | Database health                                   |

Commands: `consent {granted}`, `ready`, `rematch`, `propose {terms}`, and
`accept {proposalId}`. Terms: `{priceCredits: integer 1..1000, deliveryDays:
integer 1..7, exclusive: boolean}`. Version conflicts return 409; refresh and
review. Deal acceptance is never automatically retried.

The imported scenario is The Last Shipment, with three objectives worth 100 each
(300 maximum). The original satellite sample at `/?demo=1` is separately labelled
and keeps its original 60-point rubric.

## Accounts and data

Guest sessions bootstrap before navigation is enabled. Settings/history are private;
room aliases never use the private profile name. Registering/signing into an email
account transfers guest membership, ownership, statistics, and settings. Existing
destination settings win. Combining two occupied seats is rejected.

Passwords are handled by Better Auth. Email verification and password-reset delivery
need a mail provider before public launch. An unlinked guest loses access when its
cookies are removed. Google OAuth is optional and not configured locally.

Raw game JSON, opposing briefs, auth IDs, emails, and invite hashes are never
returned in room snapshots. Messages are escaped in the UI and never treated as
speech/AI evidence. The server assigns message seats from the session and limits
each round to 200 messages. Room access expires after 24 hours; records remain
until deleted. Define retention/account deletion before public launch.

Rooms, deadlines, proposals, acceptances, results, statistics, messages, accounts,
and settings persist across restarts. Root `src/` and `drizzle/` preserve the earlier
prototype; canonical runtime/migrations now live in `backend/`.

## Verification

```powershell
npm run check
npm test
npm run build
npm --prefix backend run format:check
npm --prefix backend run test:browser
```

Vitest defaults to isolated PGlite. To test real PostgreSQL locking, create two
fresh, empty, dedicated local test databases for each run. The imported tests
advance a virtual clock and leave fixtures behind. Set `TEST_DATABASE_URL` for the imported API tests
and `DEMO_TEST_DATABASE_URL` for the integrated tests. Never use production URLs.

Browser tests use installed Microsoft Edge on Windows or Playwright Chromium
elsewhere (`npx playwright install chromium` if needed). The local app must be
running at port 4173. The test creates synthetic accounts/rooms, waits through the
real 45-second briefing, and verifies both players independently. Its synthetic
records remain in the local database as demo data.

## Container and CI

Build from the repository root: `docker build -f backend/Dockerfile -t playcall .`.
The image includes the frontend, backend build, and reviewed migrations. Supply
DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, and CLIENT_ORIGINS as deployment
secrets/configuration. Run `node dist/db/migrate.js` once as a release operation,
then start the image. HTTPS is required in production. Container execution was
not verified locally because Docker Desktop cannot start on this machine.

GitHub Actions runs type checks, lint, formatting, all tests against two fresh
PostgreSQL 16 databases, and the TypeScript build. The local equivalent passed;
the remote workflow result still needs to be observed after pushing.
