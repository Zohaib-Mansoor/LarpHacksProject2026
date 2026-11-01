import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { WebSocket } from 'ws';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.js';
import type { Database } from '../src/db/client.js';
import * as schema from '../src/db/schema.js';
import type { Config } from '../src/config.js';
import { BRIEF_MS, type RoomSnapshot } from '../src/game.js';
import { builtinScenario, freezeScenario } from '../src/scenario.js';
import type { AiProvider } from '../src/ai.js';
import type { SpeechEvent, SpeechProvider } from '../src/transcription.js';
import { rubric } from '../src/rubric.js';
import { drainEvaluations } from '../src/evaluation.js';

const origin = 'http://localhost:5173';
const config: Config = {
  production: false,
  host: '127.0.0.1',
  port: 3001,
  databaseUrl: '',
  authUrl: 'http://localhost:3001',
  authSecret: 'feature-test-secret-not-a-real-secret-12345678',
  origins: [origin],
  rtc: { stunUrls: [], allowRelay: false },
};
const draft = {
  title: 'Emergency repairs',
  description:
    'A station needs an urgent repair and a contractor can provide it.',
  amountLabel: 'credits',
  buyer: {
    ...builtinScenario.buyer,
    jobTitle: 'Station engineer',
    priceTarget: 400,
  },
  seller: {
    ...builtinScenario.seller,
    jobTitle: 'Repair contractor',
    priceTarget: 650,
  },
};
let assessments = 0;
const ai: AiProvider = {
  model: 'mock-only',
  generate: async () => freezeScenario(draft, 'mock-only'),
  assess: async (input) => {
    assessments++;
    const evidence = input.transcript.find((s) => s.seat === input.seat)!;
    return {
      dimensions: rubric.dimensions.map((d) => ({
        key: d.key,
        level: 4,
        explanation: 'The cited negotiation statement demonstrates this skill.',
        evidence: [
          { segmentId: evidence.id, quote: evidence.text.slice(0, 25) },
        ],
      })),
    };
  },
};
const connections: { emit: (event: SpeechEvent) => void; chunks: number[] }[] =
  [];
const speech: SpeechProvider = (emit) => {
  const entry = { emit, chunks: [] as number[] };
  connections.push(entry);
  queueMicrotask(() => emit({ type: 'ready' }));
  return {
    send: (pcm) => entry.chunks.push(pcm.length),
    finish() {},
    close() {},
  };
};
let now = Date.now();
let pglite: PGlite;
let db: Database;
let built: Awaited<ReturnType<typeof buildApp>>;
let address: string;

beforeAll(async () => {
  pglite = new PGlite();
  const embedded = drizzle(pglite, { schema });
  await migrate(embedded, { migrationsFolder: 'drizzle' });
  db = embedded as unknown as Database;
  built = await buildApp({
    db,
    config,
    ai,
    speech,
    clock: () => now,
    timers: false,
    logger: false,
  });
  address = await built.app.listen({ host: '127.0.0.1', port: 0 });
}, 30_000);
afterAll(async () => {
  await built?.app.close();
  await pglite?.close();
});

async function guest() {
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
type Headers = Awaited<ReturnType<typeof guest>>;
const read = async (headers: Headers, id: string) =>
  (
    await built.app.inject({ url: `/api/rooms/${id}`, headers })
  ).json<RoomSnapshot>();
async function command(headers: Headers, id: string, cmd: object) {
  const latest = await read(headers, id);
  const response = await built.app.inject({
    method: 'POST',
    url: `/api/rooms/${id}/commands`,
    headers,
    payload: { expectedVersion: latest.version, command: cmd },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<RoomSnapshot>();
}
async function room(ranked = false) {
  const a = await guest(),
    b = await guest();
  const response = await built.app.inject({
    method: 'POST',
    url: '/api/rooms',
    headers: a,
  });
  expect(response.statusCode, response.body).toBe(201);
  const { room, inviteToken } = response.json<{
    room: RoomSnapshot;
    inviteToken: string;
  }>();
  await built.app.inject({
    method: 'POST',
    url: '/api/rooms/join',
    headers: b,
    payload: { inviteToken },
  });
  if (ranked) await command(a, room.id, { type: 'mode', ranked: true });
  return { a, b, id: room.id };
}
async function start(ctx: Awaited<ReturnType<typeof room>>) {
  for (const headers of [ctx.a, ctx.b]) {
    await command(headers, ctx.id, { type: 'consent', granted: true });
    await command(headers, ctx.id, { type: 'ready' });
  }
  now += BRIEF_MS;
  return read(ctx.a, ctx.id);
}
async function complete(ctx: Awaited<ReturnType<typeof room>>) {
  const proposal = await command(ctx.a, ctx.id, {
    type: 'propose',
    terms: { priceCredits: 350, deliveryDays: 3, exclusive: false },
  });
  await command(ctx.a, ctx.id, {
    type: 'accept',
    proposalId: proposal.round!.proposal!.id,
  });
  return command(ctx.b, ctx.id, {
    type: 'accept',
    proposalId: proposal.round!.proposal!.id,
  });
}
function next(socket: WebSocket, type: string) {
  return new Promise<ReturnType<typeof JSON.parse>>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', listener);
      reject(new Error(`No ${type} event.`));
    }, 4000);
    const listener = (raw: import('ws').RawData) => {
      const data = JSON.parse(raw.toString());
      if (data.type === type) {
        clearTimeout(timeout);
        socket.off('message', listener);
        resolve(data);
      }
    };
    socket.on('message', listener);
    socket.once('error', reject);
  });
}

describe('AI situations, peer signaling, speech, and ranked results', () => {
  it('creates AI situations, assigns private job titles, and enforces owner-only regeneration', async () => {
    const ctx = await room();
    const lobby = await read(ctx.a, ctx.id);
    expect(lobby.scenario.source).toBe('ai');
    const forbidden = await built.app.inject({
      method: 'POST',
      url: `/api/rooms/${ctx.id}/scenario`,
      headers: ctx.b,
      payload: { expectedVersion: lobby.version },
    });
    expect(forbidden.statusCode).toBe(403);
    const started = await start(ctx);
    expect(started.round?.yourBrief.jobTitle).toBe('Station engineer');
    expect(JSON.stringify(started)).not.toContain('Repair contractor');
    const other = await read(ctx.b, ctx.id);
    expect(other.round?.yourBrief.jobTitle).toBe('Repair contractor');
    const invalid = await command(ctx.a, ctx.id, {
      type: 'propose',
      terms: { priceCredits: 950, deliveryDays: 3, exclusive: false },
    });
    const denied = await built.app.inject({
      method: 'POST',
      url: `/api/rooms/${ctx.id}/commands`,
      headers: ctx.a,
      payload: {
        expectedVersion: invalid.version,
        command: { type: 'accept', proposalId: invalid.round!.proposal!.id },
      },
    });
    expect(denied.json().error.code).toBe('HARD_LIMIT');
  });

  it('delivers SDP and ICE only to the other member of the same round', async () => {
    const ctx = await room();
    const snapshot = await start(ctx);
    const roundId = snapshot.round!.id;
    const connectionId = randomUUID();
    const rtc = await built.app.inject({
      url: `/api/rooms/${ctx.id}/rtc/config?roundId=${roundId}`,
      headers: ctx.a,
    });
    expect(rtc.json().directOnly).toBe(true);
    expect(rtc.json().iceServers).toEqual([]);
    const sent = await built.app.inject({
      method: 'POST',
      url: `/api/rooms/${ctx.id}/rtc/signals`,
      headers: ctx.a,
      payload: {
        roundId,
        signal: { type: 'offer', connectionId, sdp: 'test-sdp' },
      },
    });
    expect(sent.statusCode).toBe(202);
    expect(
      (
        await built.app.inject({
          url: `/api/rooms/${ctx.id}/rtc/signals?roundId=${roundId}`,
          headers: ctx.a,
        })
      ).json().messages,
    ).toHaveLength(0);
    const received = await built.app.inject({
      url: `/api/rooms/${ctx.id}/rtc/signals?roundId=${roundId}`,
      headers: ctx.b,
    });
    expect(received.json().messages[0].payload.sdp).toBe('test-sdp');
    const outsider = await guest();
    expect(
      (
        await built.app.inject({
          url: `/api/rooms/${ctx.id}/rtc/signals?roundId=${roundId}`,
          headers: outsider,
        })
      ).statusCode,
    ).toBe(404);
    const relay = await built.app.inject({
      method: 'POST',
      url: `/api/rooms/${ctx.id}/rtc/signals`,
      headers: ctx.a,
      payload: {
        roundId,
        signal: {
          type: 'ice',
          connectionId,
          candidate: { candidate: 'candidate:1 1 udp 1 1.2.3.4 123 typ relay' },
        },
      },
    });
    expect(relay.json().error.code).toBe('DIRECT_ONLY');
    await complete(ctx);
    expect(
      (
        await built.app.inject({
          url: `/api/rooms/${ctx.id}/rtc/signals?roundId=${roundId}`,
          headers: ctx.b,
        })
      ).statusCode,
    ).toBe(409);
  });

  it('streams authenticated PCM, verifies grading evidence, and settles ranked Elo exactly once', async () => {
    const ctx = await room(true);
    const started = await start(ctx);
    const roundId = started.round!.id;
    const sockets: WebSocket[] = [];
    try {
      for (const headers of [ctx.a, ctx.b]) {
        const index = connections.length;
        const socket = new WebSocket(
          `${address.replace('http:', 'ws:')}/api/rooms/${ctx.id}/transcription?roundId=${roundId}`,
          { headers },
        );
        sockets.push(socket);
        await next(socket, 'transcription.ready');
        socket.send(Buffer.alloc(3200));
        await vi.waitFor(() =>
          expect(connections[index]!.chunks).toContain(3200),
        );
        const committed = next(socket, 'transcription.committed');
        connections[index]!.emit({
          type: 'committed',
          text: 'I can offer a reasonable price if we agree on delivery within three days and clarify the exclusivity terms together.',
        });
        const event = await committed;
        expect(event.segment.seat).toBe(sockets.length - 1);
      }
      const result = await complete(ctx);
      expect(result.round?.results?.total).toBe(0);
      const stats = (
        await built.app.inject({ url: '/api/me/stats', headers: ctx.a })
      ).json();
      expect(stats.rating).toBe(1016);
      expect(stats.xp).toBe(300);
      expect(stats.rankedPlayed).toBe(1);
      expect(
        JSON.stringify((await built.app.inject('/api/leaderboard')).json()),
      ).not.toContain('userId');
      now += 8_000;
      await drainEvaluations(db, ai, () => now);
      const debriefPath = `/api/rooms/${ctx.id}/rounds/${roundId}/debrief`;
      const debrief = (
        await built.app.inject({ url: debriefPath, headers: ctx.a })
      ).json();
      expect(debrief.ai.status).toBe('completed');
      expect(debrief.ai.feedback.overall).toBe(100);
      expect(debrief.result.after).toBe(1016);
      await built.store.advanceDue();
      await drainEvaluations(db, ai, () => now);
      expect(
        (
          await built.app.inject({ url: '/api/me/stats', headers: ctx.a })
        ).json().rating,
      ).toBe(1016);
      expect(assessments).toBe(2);
      const [ledger] = await db
        .select()
        .from(schema.roundResults)
        .where(eq(schema.roundResults.roundId, roundId));
      expect(ledger?.ranked).toBe(1);
    } finally {
      for (const socket of sockets) socket.terminate();
    }
  });

  it('leaves practice Elo unchanged and marks missing speech ungraded', async () => {
    const ctx = await room();
    await start(ctx);
    const result = await complete(ctx);
    now += 8_000;
    await drainEvaluations(db, ai, () => now);
    const stats = (
      await built.app.inject({ url: '/api/me/stats', headers: ctx.a })
    ).json();
    expect(stats.rating).toBe(1000);
    expect(stats.rankedPlayed).toBe(0);
    expect(stats.xp).toBe(300);
    const debrief = (
      await built.app.inject({
        url: `/api/rooms/${ctx.id}/rounds/${result.round!.id}/debrief`,
        headers: ctx.a,
      })
    ).json();
    expect(debrief.ai.status).toBe('unavailable');
    expect(debrief.ai.reason).toBe('insufficient_transcript');
    expect(debrief.ai.feedback).toBeNull();
  });
});
