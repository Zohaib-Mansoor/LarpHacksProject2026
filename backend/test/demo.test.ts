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
import type { VoiceView } from '../src/voice-store.js';
import type { VoiceCoach } from '../src/voice-coach.js';
import { rubric } from '../src/rubric.js';

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

describe('React realtime voice + persistent backend', () => {
  it('lets the practice partner sign during finalization and accept a rematch', async () => {
    const a = await guest();
    const room = (
      await post('/api/vc/sparring', a, { consent: true, role: 'alex' })
    ).json();
    await post('/api/vc/coaching/consent', a, {
      code: room.code,
      round: 1,
      granted: true,
    });
    await vc(a, room.code, { type: 'ready' });
    // Keep the human present through all six speaking turns.
    for (let i = 0; i < 54; i++) {
      now += 5000;
      await built.app.inject({
        url: `/api/vc/room?code=${room.code}`,
        headers: a,
      });
    }
    const offer = await vc(a, room.code, {
      type: 'propose',
      deal: { price: 525, package: 'phased' },
    });
    expect(offer.json().phase).toBe('finalize');
    expect(offer.json().accepted).toContain('morgan');
    const result = await vc(a, room.code, { type: 'confirm', revision: 1 });
    expect(result.json().phase).toBe('complete');
    const rematch = await vc(a, room.code, { type: 'rematch' });
    expect(rematch.json()).toMatchObject({
      phase: 'prep',
      round: 2,
      you: { id: 'morgan' },
    });
    expect(rematch.json().coaching.consent).toBe(false);
    const started = await vc(a, room.code, { type: 'ready' });
    expect(started.json().speakingTurn).toMatchObject({
      index: 0,
      speaker: 'alex',
    });
    expect(started.json().deadline - now).toBe(270000);
  });

  it('publishes verified points when the room code is lowercase', async () => {
    const a = await guest();
    const room = (await post('/api/vc/sparring', a, { consent: true })).json();
    await vc(a, room.code, { type: 'ready' });
    await vc(a, room.code, {
      type: 'propose',
      deal: { price: 525, package: 'phased' },
    });
    await vc(a, room.code, { type: 'confirm', revision: 1 });
    const callsign = `case-${randomUUID().slice(0, 8)}`;
    const response = await post('/api/vc/leaderboard', a, {
      code: room.code.toLowerCase(),
      callsign,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().entries).toContainEqual(
      expect.objectContaining({ callsign, rounds: 1 }),
    );
  });

  it('enforces turn ownership and has no coaching without configured keys', async () => {
    const { a, b, code } = await pair();
    await vc(a, code, { type: 'ready' });
    const start = (await vc(b, code, { type: 'ready' })).json();
    expect(start.speakingTurn).toMatchObject({
      index: 0,
      speaker: 'alex',
      warningMs: 10000,
    });
    expect(start.coaching.configured).toBe(false);
    expect(
      (
        await post('/api/vc/call-audio', b, {
          code,
          rate: 16000,
          pcm: Buffer.alloc(300).toString('base64'),
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await post('/api/vc/coaching/evaluate', a, { code, round: 1 }))
        .statusCode,
    ).toBe(503);
  });
  it('transcribes consented turns once and stores only private, quote-verified AI feedback', async () => {
    const { a, b, code } = await pair();
    let speechCalls = 0,
      gradeCalls = 0;
    const coach: VoiceCoach = {
      model: 'test-coach',
      transcribe: async () => {
        speechCalls++;
        return 'Could we agree on staged delivery to meet your deadline?';
      },
      assess: async (input) => {
        gradeCalls++;
        expect(input.yourBrief.objectives).toContain(
          'Agree a price of at least $5.50M',
        );
        expect(JSON.stringify(input)).not.toContain(
          'Agree a price of at most $5.00M',
        );
        return {
          dimensions: rubric.dimensions.map((d) => ({
            key: d.key,
            level: 3,
            explanation: 'The player asked a clear, constructive question.',
            evidence: [{ segmentId: 'turn-0', quote: 'staged delivery' }],
          })),
        };
      },
    };
    const server = await buildDemoApp({
      db,
      config,
      clock: () => now,
      voiceCoach: coach,
    });
    const request = (path: string, headers: Headers, payload: object) =>
      server.app.inject({
        method: 'POST',
        url: `/api/vc/coaching/${path}`,
        headers,
        payload,
      });
    try {
      await request('consent', a, { code, round: 1, granted: true });
      await request('consent', b, { code, round: 1, granted: true });
      await vc(a, code, { type: 'ready' });
      await vc(b, code, { type: 'ready' });
      const clip = {
        code,
        round: 1,
        turn: 0,
        mime: 'audio/webm',
        audio: Buffer.alloc(300).toString('base64'),
      };
      expect((await request('transcribe', b, clip)).statusCode).toBe(403);
      expect((await request('transcribe', a, clip)).statusCode).toBe(409);
      // Early agreement ends the first turn and permits its final partial clip.
      await vc(a, code, {
        type: 'propose',
        deal: { price: 550, package: 'phased' },
      });
      await vc(a, code, { type: 'confirm', revision: 1 });
      await vc(b, code, { type: 'confirm', revision: 1 });
      const uploaded = await request('transcribe', a, clip);
      expect(uploaded.statusCode, uploaded.body).toBe(200);
      expect((await request('transcribe', a, clip)).statusCode).toBe(200);
      expect(speechCalls).toBe(1);
      now += 6000;
      const graded = await request('evaluate', a, { code, round: 1 });
      expect(graded.statusCode, graded.body).toBe(200);
      expect(graded.json().coaching.feedback.overall).toBe(90);
      await request('evaluate', a, { code, round: 1 });
      expect(gradeCalls).toBe(1);
      const other = await server.app.inject({
        url: `/api/vc/room?code=${code}`,
        headers: b,
      });
      expect(other.json().coaching.feedback).toBeNull();
      const history = await server.app.inject({
        url: '/api/vc/me/history',
        headers: a,
      });
      expect(
        history.json().rounds.find((r: VoiceView) => r.code === code).coaching
          .feedback.overall,
      ).toBe(90);
    } finally {
      await server.app.close();
    }
  });
  const vc = (
    headers: Headers,
    code: string,
    action: Record<string, unknown>,
  ) => post('/api/vc/action', headers, { code, ...action });
  async function pair() {
    const a = await guest(),
      b = await guest();
    const created = await post('/api/vc/rooms', a, {
      consent: true,
      mode: 'text',
    });
    expect(created.statusCode, created.body).toBe(201);
    const code = created.json<VoiceView>().code;
    const joined = await post('/api/vc/join', b, { code, consent: true });
    expect(joined.statusCode, joined.body).toBe(200);
    return { a, b, code };
  }
  it('persists rooms, enforces identity/capacity, resets confirmations, and settles results once', async () => {
    const { a, b, code } = await pair();
    const third = await guest();
    expect(
      (await post('/api/vc/join', third, { code, consent: true })).statusCode,
    ).toBe(409);
    expect(
      (
        await built.app.inject({
          url: `/api/vc/room?code=${code}`,
          headers: third,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await built.app.inject({
          url: `/api/vc/room?code=${code}`,
          headers: { authorization: 'Bearer cookie-session' },
        })
      ).statusCode,
    ).toBe(401);
    const av = (
      await built.app.inject({ url: `/api/vc/room?code=${code}`, headers: a })
    ).json<VoiceView>();
    expect(av.token).toBe('cookie-session');
    expect(JSON.stringify(av.peer)).not.toContain('objectives');
    expect(JSON.stringify(av.peer)).not.toContain('token');
    await vc(a, code, { type: 'ready' });
    await vc(b, code, { type: 'ready' });
    const offer = { type: 'propose', deal: { price: 500, package: 'phased' } };
    expect((await vc(a, code, offer)).statusCode).toBe(200);
    await vc(a, code, { type: 'confirm', revision: 1 });
    const revised = await vc(b, code, {
      ...offer,
      deal: { price: 525, package: 'phased' },
    });
    expect(revised.json().accepted).toEqual([]);
    expect(
      (await vc(a, code, { type: 'confirm', revision: 1 })).statusCode,
    ).toBe(409);
    await vc(a, code, { type: 'confirm', revision: 2 });
    const result = await vc(b, code, { type: 'confirm', revision: 2 });
    expect(result.json().phase).toBe('complete');
    expect(result.json().result.scores).toEqual({ alex: 40, morgan: 40 });
    const restarted = await buildDemoApp({ db, config, clock: () => now });
    try {
      const saved = await restarted.app.inject({
        url: `/api/vc/room?code=${code}`,
        headers: a,
      });
      expect(saved.json().deal.price).toBe(525);
      expect(saved.json().result.otherObjectives).toBeNull();
    } finally {
      await restarted.app.close();
    }
    const history = (
      await built.app.inject({ url: '/api/vc/me/history', headers: a })
    ).json();
    expect(
      history.rounds.filter((r: { code: string }) => r.code === code),
    ).toHaveLength(1);
    const published = await post('/api/vc/leaderboard', a, {
      code,
      callsign: 'Test Caller',
    });
    expect(published.statusCode).toBe(200);
    await post('/api/vc/leaderboard', a, { code, callsign: 'Test Caller' });
    expect(
      (await built.app.inject('/api/vc/leaderboard'))
        .json()
        .entries.find((r: { callsign: string }) => r.callsign === 'Test Caller')
        .points,
    ).toBe(40);
  });
  it('provides a disclosed scripted solo partner', async () => {
    const a = await guest();
    const room = (
      await post('/api/vc/sparring', a, { consent: true, role: 'alex' })
    ).json();
    expect(room.sparring).toBe(true);
    await vc(a, room.code, { type: 'ready' });
    const offer = await vc(a, room.code, {
      type: 'propose',
      deal: { price: 525, package: 'phased' },
    });
    expect(offer.json().accepted).toContain('morgan');
    const result = await vc(a, room.code, { type: 'confirm', revision: 1 });
    expect(result.json().phase).toBe('complete');
  });
  it.skipIf(!process.env.DEMO_TEST_DATABASE_URL)(
    'pairs two queue entrants atomically using PostgreSQL',
    async () => {
      const a = await guest(),
        b = await guest();
      const responses = await Promise.all(
        [a, b].map((h) => post('/api/vc/match', h, { consent: true })),
      );
      expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
      expect(responses[0]!.json().code).toBe(responses[1]!.json().code);
      expect(
        (
          await built.app.inject({
            url: `/api/vc/room?code=${responses[0]!.json().code}`,
            headers: a,
          })
        ).json().matched,
      ).toBe(true);
    },
  );
  it('moves voice rooms and results safely when a guest creates an account', async () => {
    const a = await guest();
    const room = (await post('/api/vc/rooms', a, { consent: true })).json();
    const signup = await post('/api/auth/sign-up/email', a, {
      name: 'VC Account',
      email: `${randomUUID()}@example.invalid`,
      password: 'voice-test-password-1234',
    });
    expect(signup.statusCode, signup.body).toBe(200);
    const linked = {
      origin,
      cookie: signup.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    };
    expect(
      (
        await built.app.inject({
          url: `/api/vc/room?code=${room.code}`,
          headers: linked,
        })
      ).statusCode,
    ).toBe(200);
  });
  it('delivers authorized SSE signaling and transient PCM, closes after logout', async () => {
    const { a, b, code } = await pair();
    await vc(a, code, { type: 'ready' });
    await vc(b, code, { type: 'ready' });
    const server = await buildDemoApp({ db, config, clock: () => now });
    await server.app.listen({ host: '127.0.0.1', port: 0 });
    const address = server.app.server.address();
    if (!address || typeof address === 'string')
      throw Error('Missing server address');
    const base = `http://127.0.0.1:${address.port}`;
    const abort = new AbortController();
    const response = await fetch(`${base}/api/vc/call-stream?code=${code}`, {
      headers: b,
      signal: abort.signal,
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    let buffer = '';
    async function until(event: string) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const found = buffer.indexOf('\n\n');
        if (found >= 0) {
          const chunk = buffer.slice(0, found);
          buffer = buffer.slice(found + 2);
          if (chunk.startsWith(`event: ${event}\n`))
            return JSON.parse(chunk.split('\ndata: ')[1]!);
          continue;
        }
        const { value, done } = await reader.read();
        if (done) return null;
        buffer += new TextDecoder().decode(value);
      }
      throw Error(`Missing SSE event ${event}`);
    }
    try {
      expect((await until('hello')).role).toBe('morgan');
      const call = (path: string, body: object) =>
        server.app.inject({
          method: 'POST',
          url: `/api/vc/${path}`,
          headers: a,
          payload: body,
        });
      expect(
        (
          await call('call-signal', {
            code,
            signal: { description: { type: 'offer', sdp: 'test-sdp' } },
          })
        ).statusCode,
      ).toBe(200);
      expect((await until('signal')).signal.description.sdp).toBe('test-sdp');
      expect(
        (
          await call('call-audio', {
            code,
            rate: 16000,
            pcm: Buffer.alloc(3200).toString('base64'),
          })
        ).statusCode,
      ).toBe(200);
      expect((await until('audio')).rate).toBe(16000);
      const stranger = await guest();
      expect(
        (
          await server.app.inject({
            method: 'POST',
            url: '/api/vc/call-signal',
            headers: stranger,
            payload: { code, signal: {} },
          })
        ).statusCode,
      ).toBe(404);
      await server.app.inject({
        method: 'POST',
        url: '/api/auth/sign-out',
        headers: b,
        payload: {},
      });
      expect(await until('never')).toBeNull();
    } finally {
      abort.abort();
      await server.app.close();
    }
  }, 15000);
});
