import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { WebSocket } from 'ws';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import { connectDatabase, type Database } from '../src/db/client.js';
import * as schema from '../src/db/schema.js';
import type { Config } from '../src/config.js';
import type { RoomSnapshot } from '../src/game.js';
import { BRIEF_MS } from '../src/game.js';

const origin = 'http://localhost:5173';
const config: Config = {
  production: false,
  host: '127.0.0.1',
  port: 3001,
  databaseUrl: '',
  authUrl: 'http://localhost:3001',
  authSecret: 'test-secret-for-integration-only-1234567890',
  origins: [origin],
};
let now = Date.now();
let built: Awaited<ReturnType<typeof buildApp>>;
let closeDb: () => Promise<void>;
let testDb: Database;

beforeAll(async () => {
  let db: Database;
  if (process.env.TEST_DATABASE_URL) {
    // This must be a dedicated, empty test database: migrations are additive, never destructive.
    const connection = connectDatabase(process.env.TEST_DATABASE_URL);
    db = connection.db;
    closeDb = connection.close;
    await migratePg(db, { migrationsFolder: 'drizzle' });
  } else {
    const pglite = new PGlite();
    const embedded = drizzle(pglite, { schema });
    await migrate(embedded, { migrationsFolder: 'drizzle' });
    // Both adapters execute the same PostgreSQL dialect. Only the test boundary casts the driver type.
    db = embedded as unknown as Database;
    closeDb = () => pglite.close();
  }
  built = await buildApp({
    db,
    config,
    clock: () => now,
    timers: false,
    logger: false,
  });
  testDb = db;
  await built.app.ready();
}, 30_000);

afterAll(async () => {
  await built?.app.close();
  await closeDb?.();
});

async function guest() {
  const response = await built.app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/anonymous',
    headers: { origin },
    payload: {},
  });
  expect(response.statusCode, response.body).toBe(200);
  const cookies = response.cookies
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  expect(cookies).toContain('session_token');
  return { origin, cookie: cookies };
}

async function setupRoom() {
  const a = await guest();
  const b = await guest();
  const created = await built.app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: a,
  });
  expect(created.statusCode, created.body).toBe(201);
  const { room, inviteToken } = created.json<{
    room: RoomSnapshot;
    inviteToken: string;
  }>();
  const joined = await built.app.inject({
    method: 'POST',
    url: '/api/rooms/join',
    headers: b,
    payload: { inviteToken },
  });
  expect(joined.statusCode).toBe(200);
  return { a, b, room: joined.json<RoomSnapshot>(), inviteToken, id: room.id };
}

describe('HTTP, auth, persistence, and live events', () => {
  it('serves health and a valid OpenAPI document', async () => {
    expect((await built.app.inject('/ready')).statusCode).toBe(200);
    const doc = (await built.app.inject('/api/openapi.json')).json();
    expect(doc.paths['/api/rooms/{roomId}/commands']).toBeDefined();
    // The migration committed to Git is the schema actually exercised by tests.
    expect(await readFile('drizzle/meta/_journal.json', 'utf8')).toContain(
      '0000',
    );
  });

  it('requires sessions and rejects untrusted/missing mutation origins', async () => {
    expect(
      (
        await built.app.inject({
          method: 'POST',
          url: '/api/rooms',
          headers: { origin },
        })
      ).statusCode,
    ).toBe(401);
    for (const headers of [{}, { origin: 'https://evil.example' }]) {
      expect(
        (await built.app.inject({ method: 'POST', url: '/api/rooms', headers }))
          .statusCode,
      ).toBe(403);
    }
  });

  it('enforces capacity, membership, and stale version conflicts', async () => {
    const { a, room, inviteToken } = await setupRoom();
    const c = await guest();
    expect(
      (
        await built.app.inject({
          method: 'POST',
          url: '/api/rooms/join',
          headers: c,
          payload: { inviteToken },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await built.app.inject({ url: `/api/rooms/${room.id}`, headers: c }))
        .statusCode,
    ).toBe(404);
    const stale = await built.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/commands`,
      headers: a,
      payload: { expectedVersion: 1, command: { type: 'ready' } },
    });
    expect(stale.json().error.code).toBe('STALE_VERSION');
    const invalid = await built.app.inject({
      method: 'POST',
      url: `/api/rooms/${room.id}/commands`,
      headers: a,
      payload: {
        expectedVersion: room.version,
        command: { type: 'consent', granted: true, userId: 'impersonate' },
      },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('runs two real guest sessions through briefs, agreement, score, and restart-safe reads', async () => {
    const { a, b, id } = await setupRoom();
    const get = async (headers: typeof a) =>
      (
        await built.app.inject({ url: `/api/rooms/${id}`, headers })
      ).json<RoomSnapshot>();
    const command = async (headers: typeof a, cmd: object) => {
      const room = await get(headers);
      const response = await built.app.inject({
        method: 'POST',
        url: `/api/rooms/${id}/commands`,
        headers,
        payload: { expectedVersion: room.version, command: cmd },
      });
      expect(response.statusCode, response.body).toBe(200);
      return response.json<RoomSnapshot>();
    };
    for (const headers of [a, b]) {
      await command(headers, { type: 'consent', granted: true });
      await command(headers, { type: 'ready' });
    }
    expect((await get(a)).round?.state).toBe('briefing');
    now += BRIEF_MS;
    const proposed = await command(a, {
      type: 'propose',
      terms: { priceCredits: 575, deliveryDays: 3, exclusive: false },
    });
    expect(proposed.round?.state).toBe('negotiating');
    const proposalId = proposed.round!.proposal!.id;
    await command(a, { type: 'accept', proposalId });
    const result = await command(b, { type: 'accept', proposalId });
    expect(result.round?.outcome).toBe('agreement');
    expect(result.round?.results?.total).toBe(100);
    expect((await get(a)).round?.results?.total).toBe(300);
    expect(JSON.stringify(await get(a))).not.toContain('Eli Soren');
    expect(JSON.stringify(await get(b))).not.toContain('Mara Voss');
    const jobs = await testDb.select().from(schema.mediaCleanupJobs);
    expect(jobs.some((job) => job.roundId === result.round?.id)).toBe(true);
    // A new app instance reading the same DB has no in-memory game state to restore.
    const restarted = await buildApp({
      db: testDb,
      config,
      clock: () => now,
      timers: false,
      logger: false,
    });
    try {
      expect(
        (
          await restarted.app.inject({ url: `/api/rooms/${id}`, headers: a })
        ).json<RoomSnapshot>().round?.deal?.priceCredits,
      ).toBe(575);
    } finally {
      await restarted.app.close();
    }
  });

  it('persists and retries audio cleanup without holding a transaction during provider I/O', async () => {
    const jobs = await testDb.select().from(schema.mediaCleanupJobs);
    expect(jobs.length).toBeGreaterThan(0);
    await expect(
      built.store.drainMediaCleanup(async () => {
        throw new Error('provider down');
      }),
    ).rejects.toThrow('provider down');
    expect((await testDb.select().from(schema.mediaCleanupJobs)).length).toBe(
      jobs.length,
    );
    now += 11_000;
    const deleted: string[] = [];
    await built.store.drainMediaCleanup(async (name) => {
      deleted.push(name);
    });
    expect(deleted.length).toBeGreaterThan(0);
    now += 71_000;
    await built.store.drainMediaCleanup(async () => {});
    expect(await testDb.select().from(schema.mediaCleanupJobs)).toHaveLength(0);
  });

  it('disables legacy SFU tokens in favor of direct peer calls', async () => {
    const { a, b, id } = await setupRoom();
    for (const headers of [a, b]) {
      const session = await built.auth.api.getSession({
        headers: new Headers(headers),
      });
      const snapshot = await built.store.read(session!.user.id, id);
      const consented = await built.store.command(
        session!.user.id,
        id,
        snapshot.version,
        { type: 'consent', granted: true },
      );
      await built.store.command(session!.user.id, id, consented.version, {
        type: 'ready',
      });
    }
    now += BRIEF_MS;
    const response = await built.app.inject({
      method: 'POST',
      url: `/api/rooms/${id}/audio-token`,
      headers: a,
    });
    expect(response.statusCode).toBe(410);
    expect(response.json().error.code).toBe('DIRECT_CALLS_ONLY');
  });

  it('transfers guest ownership safely and rejects combining two occupied seats', async () => {
    const { a, b, id } = await setupRoom();
    const from = (await built.auth.api.getSession({ headers: new Headers(a) }))!
      .user.id;
    const occupied = (await built.auth.api.getSession({
      headers: new Headers(b),
    }))!.user.id;
    await expect(built.store.transferGuest(from, occupied)).rejects.toThrow(
      'already occupies',
    );
    const newAccount = (await built.auth.api.getSession({
      headers: new Headers(await guest()),
    }))!.user.id;
    await built.store.transferGuest(from, newAccount);
    expect((await built.store.read(newAccount, id)).members[0]?.isYou).toBe(
      true,
    );
    await expect(built.store.read(from, id)).rejects.toThrow('Room not found');
    const [stored] = await testDb
      .select()
      .from(schema.rooms)
      .where(eq(schema.rooms.id, id));
    expect(stored?.ownerId).toBe(newAccount);
    await built.store.transferGuest(newAccount, newAccount);
    expect((await built.store.read(newAccount, id)).members[0]?.isYou).toBe(
      true,
    );
  });

  it('recovers overdue rounds and durable audio cleanup even after the room expires', async () => {
    const active = await testDb.select().from(schema.rooms);
    const playing = active.find(
      (row) => row.game.rounds.at(-1)?.state === 'negotiating',
    );
    expect(playing).toBeDefined();
    now += 25 * 60 * 60_000;
    await built.store.advanceDue();
    const [updated] = await testDb
      .select()
      .from(schema.rooms)
      .where(eq(schema.rooms.id, playing!.id));
    expect(updated?.game.rounds.at(-1)?.outcome).toBe('no_agreement');
    expect(updated?.wakeAt).toBeNull();
    const jobs = await testDb.select().from(schema.mediaCleanupJobs);
    expect(
      jobs.some((job) => job.roundId === updated?.game.rounds.at(-1)?.id),
    ).toBe(true);
    await expect(
      built.store.read(playing!.ownerId, playing!.id),
    ).rejects.toThrow('expired');
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)(
    'serializes simultaneous writes using PostgreSQL row locks',
    async () => {
      const { a, b, room } = await setupRoom();
      const responses = await Promise.all(
        [a, b].map((headers) =>
          built.app.inject({
            method: 'POST',
            url: `/api/rooms/${room.id}/commands`,
            headers,
            payload: {
              expectedVersion: room.version,
              command: { type: 'consent', granted: true },
            },
          }),
        ),
      );
      expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    },
  );

  it('streams private snapshots and closes sockets after logout', async () => {
    const { a, id } = await setupRoom();
    const address = await built.app.listen({ host: '127.0.0.1', port: 0 });
    const socket = new WebSocket(
      `${address.replace('http:', 'ws:')}/api/rooms/${id}/events`,
      { headers: a },
    );
    try {
      const message = await new Promise<string>((resolve, reject) => {
        socket.once('message', (data) => resolve(data.toString()));
        socket.once('error', reject);
      });
      expect(JSON.parse(message).type).toBe('room.snapshot');
      expect(message).not.toContain('userId');
      const closed = new Promise<number>((resolve) =>
        socket.once('close', resolve),
      );
      const logout = await built.app.inject({
        method: 'POST',
        url: '/api/auth/sign-out',
        headers: a,
        payload: {},
      });
      expect(logout.statusCode, logout.body).toBe(200);
      expect(await closed).toBe(1008);
      expect(
        (await built.app.inject({ url: `/api/rooms/${id}`, headers: a }))
          .statusCode,
      ).toBe(401);
    } finally {
      socket.terminate();
    }
  });
});
