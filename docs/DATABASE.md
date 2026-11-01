# RoleCall database — Phase 1

**Historical phase:** follow [INTEGRATION.md](INTEGRATION.md) for the active app's
separate database. These original tables are preserved; do not mix the schemas.

This phase contains the database only. There are five application tables and
four Better Auth tables. Drizzle also keeps its own migration journal in the
`drizzle` schema; it is not an application table.

## Local PostgreSQL 16 (PowerShell)

Run from the repository root with Node.js 24 and Docker Desktop's Linux engine running.
The password below is for local development only. The port is bound to loopback.

```powershell
docker run --name rolecall-postgres -e POSTGRES_USER=rolecall -e POSTGRES_PASSWORD=rolecall_local -e POSTGRES_DB=rolecall -p 127.0.0.1:5432:5432 -v rolecall_pgdata:/var/lib/postgresql/data -d postgres:16
docker exec rolecall-postgres pg_isready -U rolecall -d rolecall
npm ci
$env:DATABASE_URL = 'postgresql://rolecall:rolecall_local@localhost:5432/rolecall'
npm run db:migrate
npm run db:verify
npm run db:typecheck
```

Wait for `pg_isready` to report that it is accepting connections before migrating.
If this container already exists, use `docker start rolecall-postgres` instead
of creating it again. Its named volume preserves the database between starts.

Alternatively, copy `.env.example` to `.env`. Both Drizzle commands and the
verification script load this file; `src/db/index.ts` reads `process.env` only.
The future application entry point must load its environment before importing it.

Inspect all nine public tables and the constraints:

```powershell
docker exec -it rolecall-postgres psql -U rolecall -d rolecall -c '\dt public.*'
docker exec -it rolecall-postgres psql -U rolecall -d rolecall -c '\d room_members'
docker exec -it rolecall-postgres psql -U rolecall -d rolecall -c '\d proposals'
docker exec -it rolecall-postgres psql -U rolecall -d rolecall -c '\d acceptances'
```

If `psql` is installed on the host:

```powershell
psql $env:DATABASE_URL -c '\dt public.*'
```

Optional schema browser: `npm run db:studio`. Keep it local.

## Better Auth generation

Approach (a): the official `auth` CLI generated `src/db/auth-schema.ts`.
`better-auth` and `auth` are pinned to **1.7.15**. The generation input is
`scripts/auth-schema.config.ts`, not a runtime auth handler. It enables UUID
generation and the anonymous plugin, which adds `user.isAnonymous`.

```powershell
npm run db:auth:generate
npx drizzle-kit generate
```

Phase 2 must retain `advanced.database.generateId: "uuid"` and the anonymous
plugin and pass the exported schema to the Drizzle auth adapter. Do not create
a separate users table. The four generated tables retain the CLI's timestamp
definitions; all application timestamps use `timestamptz`.

References:
- https://better-auth.com/docs/concepts/cli
- https://better-auth.com/docs/concepts/database
- https://better-auth.com/docs/plugins/anonymous

## Migrations and invariants

- `0000_initial_database.sql` was produced by `npx drizzle-kit generate --name initial_database`.
- `0001_immutable_proposals.sql` was created with `drizzle-kit generate --custom`
  and contains the SQL trigger rejecting proposal updates.
- Review and commit SQL plus metadata, then apply with `npm run db:migrate`.
- Do not use `drizzle-kit push` or Better Auth's migration command for this schema.
- `room_members` has `created_at` as well as `joined_at`, per the every-table rule.
- `(room_id, role)` is unique and `role` is a two-value enum: at most two seats.
- `(room_id, user_id)` is unique: one seat per user in a room.
- `rounds.room_id` is unique: one round total per room in v1, including confirmed
  rounds. This deliberately does not implement rematches in the same room.
- `(round_id, revision)` is unique. The highest revision for that round is the
  latest proposal. Acceptances count only for that proposal ID. Old acceptances
  remain attached to their original revision.
- Future proposal creation must lock the round while allocating `max(revision)+1`.
- Updates to rounds must include `WHERE id = ... AND version = expectedVersion`,
  increment `version`, and set `updated_at`. Defaults alone do not implement
  optimistic locking or automatically maintain `updated_at`.
- The schema does not yet enforce that an acceptor belongs to the room. Phase 2
  must authorize membership, phases, and current-proposal acceptance in services.
- `invite_code_hash` has the requested non-unique index. Token creation and
  collision handling remain future service responsibilities.
- No additional confirmed-deals table or game rules were added.

## Verification

`scripts/verify-schema.ts` uses a transaction and savepoints to check the exact
PostgreSQL constraint names and SQLSTATEs. It rolls back its fixtures on success
and failure, and closes the pool. It refuses a non-local connection string.

Docker Desktop was unable to start during this implementation. The migrations
and checks instead ran against a temporary native **PostgreSQL 16.11** instance
on `127.0.0.1:15432`. This used the same `pg` driver and generated SQL, not an
emulator. The portable binary is outside this repository and is not a dependency.

## Boundaries for the next phase

The DB module exports `db` and `pool`, requires `DATABASE_URL`, and caps its pool
at five connections. Import it only from server code or scripts. Future shutdown
handling must call `pool.end()` after requests have drained.

No routes, services, frontend, authentication handlers, or deployment configuration
are included. Before running migrations on Render, use the intended database URL
and review both SQL files.
