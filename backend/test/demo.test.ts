import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { buildDemoApp } from '../src/demo-app.js';
import { connectDatabase, type Database } from '../src/db/client.js';
import * as schema from '../src/db/schema.js';
import { BRIEF_MS, type RoomSnapshot } from '../src/game.js';
import type { Config } from '../src/config.js';
import { builtinScenario, freezeScenario } from '../src/scenario.js';
import type { AiProvider } from '../src/ai.js';

const origin = 'http://127.0.0.1:4173';
const config: Config = {
  production: false,
  host: '127.0.0.1',
  port: 4173,
  authUrl: origin,
  origins: [origin],
  databaseUrl: '',
  authSecret: 'integration-test-secret-at-least-32-characters',
  demoMode: true,
};
let now = Date.now();
let db: Database;
let close: () => Promise<void>;
let built: Awaited<ReturnType<typeof buildDemoApp>>;
type Headers = { origin: string; cookie: string };
beforeAll(async () => {
  if (process.env.DEMO_TEST_DATABASE_URL) {
    const url = new URL(process.env.DEMO_TEST_DATABASE_URL);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('Use a local dedicated test database.');
    const connection = connectDatabase(url.toString());
    db = connection.db;
    close = connection.close;
    await migratePg(db, { migrationsFolder: 'drizzle' });
  } else {
    const pg = new PGlite();
    const embedded = drizzle(pg, { schema });
    await migrate(embedded, { migrationsFolder: 'drizzle' });
    db = embedded as unknown as Database;
    close = () => pg.close();
  }
  built = await buildDemoApp({ db, config, clock: () => now });
}, 30000);
afterAll(async () => {
  await built?.app.close();
  await close?.();
});
const post = (
  url: string,
  headers: Headers,
  payload: Record<string, unknown> = {},
) => built.app.inject({ method: 'POST', url, headers, payload });
async function guest(): Promise<Headers> {
  const response = await built.app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/anonymous',
    headers: { origin },
    payload: {},
  });
  expect(response.statusCode, response.body).toBe(200);
  return {
    origin,
    cookie: response.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
  };
}
const read = async (id: string, headers: Headers) =>
  (
    await built.app.inject({ url: `/api/rooms/${id}`, headers })
  ).json<RoomSnapshot>();
async function command(id: string, headers: Headers, command: unknown) {
  const current = await read(id, headers);
  const response = await post(`/api/rooms/${id}/commands`, headers, {
    expectedVersion: current.version,
    command,
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<RoomSnapshot>();
}
async function setup() {
  const a = await guest(),
    b = await guest();
  const create = await post('/api/rooms', a);
  expect(create.statusCode).toBe(201);
  const { room, inviteToken } = create.json<{
    room: RoomSnapshot;
    inviteToken: string;
  }>();
  const join = await post('/api/rooms/join', b, { inviteToken });
  expect(join.statusCode).toBe(200);
  for (const player of [a, b]) {
    await command(room.id, player, { type: 'consent', granted: true });
    await command(room.id, player, { type: 'ready' });
  }
  return { a, b, id: room.id, inviteToken };
}

describe('one-origin database demo', () => {
  it('creates genuine generated scenes and allows an explicit disclosed built-in choice', async () => {
    let calls = 0;
    const ai: AiProvider = {
      model: 'mock-gemini',
      generate: async () => {
        calls++;
        return freezeScenario(
          {
            title: 'The Harbor Repair',
            description:
              'A station needs repairs and an independent contractor has one slot remaining.',
            amountLabel: 'credits',
            buyer: { ...builtinScenario.buyer, priceTarget: 400 },
            seller: { ...builtinScenario.seller, priceTarget: 650 },
          },
          'mock-gemini',
        );
      },
      assess: async () => {
        throw new Error('Not used in text mode.');
      },
    };
    const generatedApp = await buildDemoApp({ db, config, ai });
    try {
      const a = await guest();
      const response = await generatedApp.app.inject({
        method: 'POST',
        url: '/api/rooms',
        headers: a,
        payload: {},
      });
      expect(response.statusCode, response.body).toBe(201);
      expect(response.json().room.scenario.source).toBe('ai');
      expect(response.json().room.scenario.title).toBe('The Harbor Repair');
      const practice = await generatedApp.app.inject({
        method: 'POST',
        url: '/api/rooms',
        headers: a,
        payload: { scenarioSource: 'builtin' },
      });
      expect(practice.statusCode).toBe(201);
      expect(practice.json().room.scenario.source).toBe('builtin');
      expect(calls).toBe(1);
      expect(
        JSON.stringify((await generatedApp.app.inject('/api/config')).json()),
      ).not.toContain('apiKey');
    } finally {
      await generatedApp.app.close();
    }
  });
  it('returns a real AI failure without substituting a fake scene', async () => {
    const failing: AiProvider = {
      model: 'mock-gemini',
      generate: async () => {
        throw new Error('provider failure');
      },
      assess: async () => {
        throw new Error('not used');
      },
    };
    const failingApp = await buildDemoApp({ db, config, ai: failing });
    try {
      const a = await guest();
      const response = await failingApp.app.inject({
        method: 'POST',
        url: '/api/rooms',
        headers: a,
        payload: {},
      });
      expect(response.statusCode).toBe(502);
      expect(response.json().error.code).toBe('GENERATION_FAILED');
      expect(response.json().room).toBeUndefined();
    } finally {
      await failingApp.app.close();
    }
  });
  it('serves frontend, disables excluded systems, and never sends HTML for API 404s', async () => {
    expect((await built.app.inject('/')).headers['content-type']).toContain(
      'text/html',
    );
    expect((await built.app.inject('/database-app.js')).statusCode).toBe(200);
    expect(
      (await built.app.inject('/api/openapi.json')).json().paths[
        '/api/rooms/{roomId}/commands'
      ],
    ).toBeDefined();
    expect(
      (
        await built.app.inject(
          '/api/rooms/00000000-0000-4000-8000-000000000000/events',
        )
      ).statusCode,
    ).toBe(404);
    expect((await built.app.inject('/api/not-real')).statusCode).toBe(404);
    expect(
      (await built.app.inject('/api/not-real')).headers['content-type'],
    ).toContain('application/json');
    const config = (await built.app.inject('/api/config')).json();
    expect(config).toMatchObject({
      audio: false,
      ai: false,
      workers: false,
      websockets: false,
    });
    expect((await built.app.inject('/.env')).statusCode).toBe(404);
  });
  it('saves isolated settings and transfers them with room history to an email account', async () => {
    const a = await guest(),
      b = await guest();
    const preferences = {
      displayName: 'Private Name',
      theme: 'dark',
      captions: false,
      reducedMotion: true,
    };
    const save = await built.app.inject({
      method: 'PATCH',
      url: '/api/me/settings',
      headers: a,
      payload: preferences,
    });
    expect(save.statusCode).toBe(200);
    expect(
      (await built.app.inject({ url: '/api/me/settings', headers: b })).json()
        .displayName,
    ).toBe('Negotiator');
    const create = (await post('/api/rooms', a)).json<{ room: RoomSnapshot }>();
    const account = await post('/api/auth/sign-up/email', a, {
      name: 'Private Name',
      email: `${randomUUID()}@example.invalid`,
      password: 'demo-strong-password-1234',
    });
    expect(account.statusCode, account.body).toBe(200);
    const linked = {
      origin,
      cookie: account.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    };
    const settings = (
      await built.app.inject({ url: '/api/me/settings', headers: linked })
    ).json();
    expect(settings).toMatchObject({ ...preferences, guest: false });
    const history = (
      await built.app.inject({ url: '/api/me/history', headers: linked })
    ).json();
    expect(history.rooms.map((r: { id: string }) => r.id)).toContain(
      create.room.id,
    );
    expect(
      (
        await built.app.inject({
          url: `/api/rooms/${create.room.id}`,
          headers: linked,
        })
      ).statusCode,
    ).toBe(200);
    expect(JSON.stringify(await read(create.room.id, linked))).not.toContain(
      'Private Name',
    );
    expect(
      (await built.app.inject({ url: '/api/me/settings' })).statusCode,
    ).toBe(401);
  });
  it('plays two private roles, persists chat, rejects stale acceptance, scores once, and survives restart', async () => {
    const { a, b, id } = await setup();
    now += BRIEF_MS;
    const av = await read(id, a),
      bv = await read(id, b);
    expect(av.round?.yourBrief.character).not.toBe(
      bv.round?.yourBrief.character,
    );
    expect(JSON.stringify(av)).not.toContain(bv.round!.yourBrief.character);
    expect(JSON.stringify(bv)).not.toContain(av.round!.yourBrief.character);
    const message = '<img src=x onerror=alert(1)>';
    expect(
      (await post(`/api/rooms/${id}/messages`, a, { text: message }))
        .statusCode,
    ).toBe(201);
    const chat = (
      await built.app.inject({ url: `/api/rooms/${id}/messages`, headers: b })
    ).json();
    expect(chat.messages[0].text).toBe(message);
    const outsider = await guest();
    expect(
      (
        await built.app.inject({
          url: `/api/rooms/${id}/messages`,
          headers: outsider,
        })
      ).statusCode,
    ).toBe(404);
    const first = await command(id, a, {
      type: 'propose',
      terms: { priceCredits: 575, deliveryDays: 3, exclusive: false },
    });
    await command(id, a, {
      type: 'accept',
      proposalId: first.round!.proposal!.id,
    });
    const revised = await command(id, b, {
      type: 'propose',
      terms: { priceCredits: 600, deliveryDays: 3, exclusive: false },
    });
    expect(revised.round!.proposal!.acceptedSeats).toEqual([]);
    const stale = await post(`/api/rooms/${id}/commands`, a, {
      expectedVersion: revised.version,
      command: { type: 'accept', proposalId: first.round!.proposal!.id },
    });
    expect(stale.statusCode).toBe(409);
    await command(id, a, {
      type: 'accept',
      proposalId: revised.round!.proposal!.id,
    });
    const result = await command(id, b, {
      type: 'accept',
      proposalId: revised.round!.proposal!.id,
    });
    expect(result.round?.outcome).toBe('agreement');
    expect((await read(id, a)).round?.results?.total).toBe(300);
    expect(result.round?.results?.total).toBe(100);
    const restart = await buildDemoApp({ db, config, clock: () => now });
    try {
      expect(
        (
          await restart.app.inject({ url: `/api/rooms/${id}`, headers: a })
        ).json<RoomSnapshot>().round?.deal?.priceCredits,
      ).toBe(600);
      expect(
        (
          await restart.app.inject({
            url: `/api/rooms/${id}/messages`,
            headers: a,
          })
        ).json().messages[0].text,
      ).toBe(message);
    } finally {
      await restart.app.close();
    }
    const stats = (
      await built.app.inject({ url: '/api/me/stats', headers: a })
    ).json();
    expect(stats.totalRounds).toBe(1);
    expect(
      (await post(`/api/rooms/${id}/messages`, a, { text: 'too late' }))
        .statusCode,
    ).toBe(409);
  });
  it.skipIf(!process.env.DEMO_TEST_DATABASE_URL)(
    'serializes competing joins and writes using real PostgreSQL locks',
    async () => {
      const owner = await guest(),
        a = await guest(),
        b = await guest();
      const { room, inviteToken } = (await post('/api/rooms', owner)).json<{
        room: RoomSnapshot;
        inviteToken: string;
      }>();
      const joins = await Promise.all(
        [a, b].map((h) => post('/api/rooms/join', h, { inviteToken })),
      );
      expect(joins.map((j) => j.statusCode).sort()).toEqual([200, 409]);
      const v = await read(room.id, owner);
      const writes = await Promise.all(
        [1, 2].map(() =>
          post(`/api/rooms/${room.id}/commands`, owner, {
            expectedVersion: v.version,
            command: { type: 'consent', granted: true },
          }),
        ),
      );
      expect(writes.map((w) => w.statusCode).sort()).toEqual([200, 409]);
    },
  );
});
