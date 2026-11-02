# Registered accounts and Render rubric rating

The React frontend and Fastify API run together on the existing `playcall` Docker
Web Service. Accounts, password hashes, sessions, rooms, mission scores, and rating
jobs are stored in `playcall-db` PostgreSQL. `REQUIRE_ACCOUNT=true` blocks guest
creation and guest access at the API as well as protecting gameplay pages.
Registration and login do not require email verification. Account ownership is
established by the password, not proof of email ownership. Email recovery is not
configured. Passwords are hashed by Better Auth; plaintext passwords are never
stored or logged by application code.

## Workflow setup

This workspace deploys from `codex/score-render-workspace`.

1. Deploy `render.yaml` to migrate the existing app database, including
   `voice_rating_jobs`.
2. Create a separate Render Blueprint using `render-workflows.yaml`, selecting
   `codex/score-render-workspace`. It registers `rateNegotiation` on the Node
   runtime. It references the existing database and the web service's private
   Gemini key. It runs no HTTP server and does not run migrations.
3. Set `ELEVENLABS_API_KEY` privately on the **web service**. Speech is uploaded
   only for consented speaking turns. The workflow needs only the stored transcript,
   not raw microphone audio or the ElevenLabs key.
4. Create a Render API key with the narrowest scope Render offers. Store it only
   in the web service's private `RENDER_API_KEY` environment variable. This key can
   confer broader Render account access; review its permissions before creating it.
5. Copy the **Workflow Slug** from Render and set `RENDER_WORKFLOWS_ENABLED=true`
   and `RENDER_WORKFLOW_TASK=<actual-workflow-slug>/rateNegotiation` on the web
   service, then redeploy. Render can append a suffix to the service name when
   generating this slug. The Blueprint preserves the value you configure rather
   than assuming the slug is `playcall-ratings`. The queue activates only when
   both the task slug and API key exist.

The workflow entry point is `backend/src/workflow-entry.ts`. SDK task registration
does not connect to the database. Each task run creates and closes its own pool.
Use `render workflows dev -- node dist/workflow-entry.js` from `backend` to run the
official local task server after building, if the Render CLI is installed.

Render Workflows task execution is usage-billed, including task state retention.
The task requests `flex` compute and a 120-second timeout. Review a usage budget
before enabling public dispatch. There is no application-level monetary cap.
See the official [Workflows docs](https://render.com/docs/workflows) and
[pricing](https://render.com/docs/workflows-limits).

## Execution and privacy

Both participants must opt into speech rating before their round starts. The
existing API validates completed turns, transcript availability, room membership,
and the completed round before inserting one job per player and round in the same
transaction as the pending rating state. Existing rounds are not retroactively
recorded or rated.

The web service dispatches durable jobs after commit without waiting for Gemini.
Render receives only a job UUID. The workflow loads the player's own brief and
consented transcript from PostgreSQL. It rechecks the round and consent before
processing and before saving. Results are visible only through participant-authenticated
room/history endpoints. Task return values contain only a status, never feedback,
briefs, transcripts, passwords, or provider responses.

The dispatcher retries failed submissions and recovers expired processing leases.
Database claims and fencing tokens prevent a delayed worker from overwriting a
replacement worker's result. Jobs allow at most three assessment attempts and
five dispatch attempts. Gemini failures or fabricated evidence never become a
zero communication score. Terminal jobs clear their copied evidence payload;
unprocessed payloads expire after seven days and are cleared by the next dispatch.
While the free web service sleeps, pending jobs wait until it wakes.

Mission points remain deterministic: three objectives worth 20 points each in the
React satellite game. AI communication adds up to 40 points: strategy 15,
listening/collaboration 10, clarity/closing 10, respect/composure 5. Each dimension
requires a verified quote from that player's transcript. The combined rating is
out of 100. The workflow never modifies mission points, XP, or leaderboard points.

The current recording sends clips after each 45-second speaking turn; it does not
provide word-by-word streaming captions. Direct peer audio and mutual deal signing
are independent of speech rating. Both human players must sign the exact same
proposal revision; practice bots can sign automatically under their fixed rules.

## Validation

Run `npm --prefix backend run typecheck`, `lint`, `format:check`, `test`, and `build`;
also run `npm --prefix web run build`. Tests cover registered persistence, guest
blocking, duplicate enqueue/delivery, dispatch recovery, invalid evidence, expired
jobs, and stale-worker fencing. A live speech test additionally requires the
private ElevenLabs and Render keys and two opted-in participants.
