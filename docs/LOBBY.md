# Phase 2: guest sessions and two-player lobby API

This phase adds Fastify and mounts Better Auth against the existing Drizzle schema.
No tables or migrations changed. Gameplay, readiness, and the React screens are
the next phase; the returned `/join?token=...` URL is for that future frontend.

## Run locally

1. Follow [DATABASE.md](DATABASE.md) to start PostgreSQL and apply migrations.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to that local database.
3. Generate your own `BETTER_AUTH_SECRET` using the command in `.env.example`.
4. Keep `APP_ORIGIN=http://localhost:3000` and `PORT=3000` together.
5. Run `npm run api:dev` (watch) or `npm run api:start`.

The root `start`/`dev` commands belong to the teammate's `playcall` prototype;
the independent `api:*` commands run this backend.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/sign-in/anonymous` | Create guest session; save returned cookies |
| GET | `/api/me` | Verify session; own user ID and guest flag only |
| POST | `/api/auth/sign-out` | Revoke session |
| POST | `/api/rooms` | Create room, owner seat, and one-hour invite |
| POST | `/api/rooms/join` | Claim player2 using `{ "inviteToken": "..." }` |
| GET | `/api/rooms/:id` | Member-only room snapshot; poll once per second |
| GET | `/health/live` | Process health |
| GET | `/health/ready` | Database connectivity |

All POST requests require `Origin: http://localhost:3000` (the configured
`APP_ORIGIN`). Browser clients must keep their session cookies. API responses
are non-cacheable. The backend does not enable cross-origin access.

Create/join/read responses use the TypeBox definitions exported from
`packages/contracts/src/index.ts`; both client and server can import these.
API errors return `{ error: { code, message, requestId } }`.

Joining locks the room row inside a transaction. Retrying a join as an existing
member returns the same seat. A competing third user receives `409 ROOM_FULL`.
Only an invite hash is stored. Room snapshots contain fictional aliases and
roles, never another user's ID, email, invite hash, or auth records. Outsiders
receive a 404 instead of learning a room exists. Expired rooms return 410.

## Verify

```powershell
npm run api:typecheck
npm run api:test
```

Tests require a migrated local database; they refuse remote database URLs.
They use real Better Auth cookies and PostgreSQL transactions, verify concurrent
join capacity, retries, outsider access, response filtering, expiry, malformed
invites, cross-origin rejection, session revocation, and JSON API 404s. Created
test users and rooms are deleted afterward.

Production needs HTTPS and a private auth secret. The backend listens on
`0.0.0.0` and `PORT`. SIGTERM/SIGINT drain Fastify before closing the database
pool. Static frontend serving and Render deployment remain a later phase.
