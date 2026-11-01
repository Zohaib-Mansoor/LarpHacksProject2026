// Integrated text app. Optional AI situations; no media, socket, or worker code.
import { randomUUID } from 'node:crypto';
import { resolve, extname, sep } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import Fastify, { type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { fromNodeHeaders } from 'better-auth/node';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import { rooms, roomMessages, userSettings } from './db/schema.js';
import { createAuth } from './auth.js';
import { GameStore } from './store.js';
import { GameError, memberFor, snapshot } from './game.js';
import { configuredAi } from './ai-provider.js';
import { registerVoice } from './voice-routes.js';
import type { AiProvider } from './ai.js';
import { configuredVoiceCoach, type VoiceCoach } from './voice-coach.js';

const Room = Type.Object({ roomId: Type.String({ format: 'uuid' }) });
const Command = Type.Union([
  Type.Object(
    { type: Type.Literal('consent'), granted: Type.Boolean() },
    { additionalProperties: false },
  ),
  Type.Object({ type: Type.Literal('ready') }, { additionalProperties: false }),
  Type.Object(
    { type: Type.Literal('rematch') },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal('propose'),
      terms: Type.Object(
        {
          priceCredits: Type.Integer({ minimum: 1, maximum: 1000 }),
          deliveryDays: Type.Integer({ minimum: 1, maximum: 7 }),
          exclusive: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal('accept'),
      proposalId: Type.String({ format: 'uuid' }),
    },
    { additionalProperties: false },
  ),
]);
const Settings = Type.Object(
  {
    displayName: Type.String({ minLength: 1, maxLength: 40, pattern: '\\S' }),
    theme: Type.Union([
      Type.Literal('system'),
      Type.Literal('light'),
      Type.Literal('dark'),
    ]),
    captions: Type.Boolean(),
    reducedMotion: Type.Boolean(),
    leaderboardOptIn: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

export async function buildDemoApp(options: {
  db: Database;
  config: Config;
  clock?: () => number;
  ai?: AiProvider;
  voiceCoach?: VoiceCoach;
}) {
  const { db, config } = options;
  const clock = options.clock ?? Date.now;
  const store = new GameStore(db, clock);
  const ai = options.ai ?? configuredAi(config);
  const auth = createAuth(db, config, store);
  const app = Fastify({
    bodyLimit: 16_384,
    ajv: { customOptions: { removeAdditional: false } },
  }).withTypeProvider<TypeBoxTypeProvider>();
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(swagger, {
    openapi: { info: { title: 'PlayCall text demo API', version: '1.0.0' } },
  });
  app.get('/api/openapi.json', { schema: { hide: true } }, async () =>
    app.swagger(),
  );
  const principal = async (request: FastifyRequest) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) throw new GameError('UNAUTHENTICATED', 'Sign in first.', 401);
    if (config.requireAccount && session.user.isAnonymous)
      throw new GameError(
        'ACCOUNT_REQUIRED',
        'Sign in with a registered account.',
        401,
      );
    return session.user;
  };
  app.addHook('onRequest', async (request, reply) => {
    if (
      config.requireAccount &&
      request.url.split('?')[0] === '/api/auth/sign-in/anonymous'
    )
      throw new GameError(
        'ACCOUNT_REQUIRED',
        'Create an account or sign in to play.',
        403,
      );
    if (request.url.startsWith('/api/'))
      reply.header('cache-control', 'no-store');
    if (
      ['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method) &&
      request.headers.origin !== config.authUrl
    )
      throw new GameError(
        'INVALID_ORIGIN',
        'A matching Origin header is required.',
        403,
      );
  });
  app.setErrorHandler((error, request, reply) => {
    const e = error as { statusCode?: number; validation?: unknown };
    const status =
      error instanceof GameError
        ? error.status
        : e.statusCode && e.statusCode < 500
          ? e.statusCode
          : 500;
    return reply.status(status).send({
      error: {
        code:
          error instanceof GameError
            ? error.code
            : status === 400
              ? 'INVALID_REQUEST'
              : status === 429
                ? 'RATE_LIMITED'
                : 'INTERNAL_ERROR',
        message:
          error instanceof GameError
            ? error.message
            : status < 500
              ? 'Invalid request.'
              : 'Unexpected server error.',
      },
      requestId: request.id,
    });
  });
  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: 'Not found.' },
      requestId: request.id,
    }),
  );
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    async handler(request, reply) {
      const response = await auth.handler(
        new Request(new URL(request.url, config.authUrl), {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        }),
      );
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value);
      });
      if (response.headers.getSetCookie().length)
        reply.header('set-cookie', response.headers.getSetCookie());
      return reply.send(await response.text());
    },
  });
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { status: 'ready' };
    } catch {
      return reply.status(503).send({ status: 'unavailable' });
    }
  });
  app.get('/api/config', async () => ({
    requireAccount: !!config.requireAccount,
    mode: 'database-text',
    realtimeVoice: true,
    matchmaking: true,
    voiceProtocol: '/api/vc',
    audio: false,
    voiceReady: false,
    transcription: false,
    ai: !!ai,
    aiProvider: ai ? (config.ai?.provider ?? 'configured') : null,
    aiModel: ai?.model ?? null,
    websockets: false,
    workers: false,
    google: !!config.google,
    missionMax: 300,
    objectivePoints: 100,
    notice: ai
      ? 'The configured AI generates fictional situations and private job briefs. Text negotiation is stored in PostgreSQL. Microphone, transcription, and conversation grading are off in this text mode. Room access expires after 24 hours; records remain until deleted by the operator.'
      : 'Text negotiation is stored in PostgreSQL. No microphone, transcription, or AI processing is active. Room access expires after 24 hours; records remain until deleted by the operator.',
  }));
  app.get('/api/me', async (request) => {
    const user = await principal(request);
    return { authenticated: true, guest: !!user.isAnonymous, userId: user.id };
  });
  app.get('/api/me/settings', async (request) => {
    const user = await principal(request);
    const [saved] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, user.id));
    return {
      displayName: saved?.displayName ?? user.name,
      theme: saved?.theme ?? 'system',
      captions: saved?.captions ?? true,
      reducedMotion: saved?.reducedMotion ?? false,
      leaderboardOptIn: saved?.leaderboardOptIn ?? false,
      guest: !!user.isAnonymous,
    };
  });
  app.patch(
    '/api/me/settings',
    { schema: { body: Settings } },
    async (request) => {
      const user = await principal(request);
      const values = {
        ...request.body,
        displayName: request.body.displayName.trim(),
        updatedAt: new Date(clock()),
      };
      await db
        .insert(userSettings)
        .values({ userId: user.id, ...values })
        .onConflictDoUpdate({ target: userSettings.userId, set: values });
      return {
        ...request.body,
        displayName: values.displayName,
        guest: !!user.isAnonymous,
      };
    },
  );
  app.get('/api/me/stats', async (request) =>
    store.stats((await principal(request)).id),
  );
  app.get('/api/me/history', async (request) => {
    const user = await principal(request);
    const rows = await db
      .select()
      .from(rooms)
      .where(
        sql`${rooms.game}->'members' @> ${JSON.stringify([{ userId: user.id }])}::jsonb`,
      )
      .orderBy(desc(rooms.createdAt))
      .limit(50);
    return {
      rooms: rows.map((row) => {
        const view = snapshot(row.game, user.id, row.id, row.version, clock());
        return {
          id: row.id,
          title: view.scenario.title,
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
          rounds: row.game.rounds.length,
          state: view.round?.state ?? 'waiting',
          points: view.round?.results?.total ?? null,
        };
      }),
    };
  });
  app.post(
    '/api/rooms',
    {
      schema: {
        body: Type.Object(
          {
            scenarioSource: Type.Optional(
              Type.Union([Type.Literal('ai'), Type.Literal('builtin')]),
            ),
          },
          { additionalProperties: false },
        ),
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const user = await principal(request);
      let definition;
      if (request.body.scenarioSource === 'ai' && !ai)
        throw new GameError(
          'AI_UNAVAILABLE',
          'AI is not configured. Choose built-in practice.',
          503,
        );
      if (ai && request.body.scenarioSource !== 'builtin') {
        try {
          definition = await ai.generate();
        } catch {
          throw new GameError(
            'GENERATION_FAILED',
            'The AI could not create a valid scene in time. Retry or choose built-in practice.',
            502,
          );
        }
      }
      return reply.status(201).send(await store.create(user.id, definition));
    },
  );
  app.post(
    '/api/rooms/join',
    {
      schema: {
        body: Type.Object(
          { inviteToken: Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' }) },
          { additionalProperties: false },
        ),
      },
    },
    async (request) =>
      store.join((await principal(request)).id, request.body.inviteToken),
  );
  app.get('/api/rooms/:roomId', { schema: { params: Room } }, async (request) =>
    store.read((await principal(request)).id, request.params.roomId),
  );
  app.post(
    '/api/rooms/:roomId/commands',
    {
      schema: {
        params: Room,
        body: Type.Object(
          { expectedVersion: Type.Integer({ minimum: 1 }), command: Command },
          { additionalProperties: false },
        ),
      },
    },
    async (request) => {
      const command = request.body.command;
      return store.command(
        (await principal(request)).id,
        request.params.roomId,
        request.body.expectedVersion,
        command.type === 'propose'
          ? { ...command, proposalId: randomUUID() }
          : command,
      );
    },
  );
  app.get(
    '/api/rooms/:roomId/messages',
    { schema: { params: Room } },
    async (request) => {
      const view = await store.read(
        (await principal(request)).id,
        request.params.roomId,
      );
      if (!view.round) return { messages: [] };
      const messages = await db
        .select({
          id: roomMessages.id,
          seat: roomMessages.seat,
          text: roomMessages.text,
          createdAt: roomMessages.createdAt,
        })
        .from(roomMessages)
        .where(
          and(
            eq(roomMessages.roomId, view.id),
            eq(roomMessages.roundId, view.round.id),
          ),
        )
        .orderBy(roomMessages.id)
        .limit(200);
      return { messages };
    },
  );
  app.post(
    '/api/rooms/:roomId/messages',
    {
      schema: {
        params: Room,
        body: Type.Object(
          {
            text: Type.String({
              minLength: 1,
              maxLength: 1000,
              pattern: '\\S',
            }),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request, reply) => {
      const user = await principal(request);
      // Reconcile deadlines before locking again; recheck the deadline inside the write transaction.
      await store.read(user.id, request.params.roomId);
      await db.transaction(async (tx) => {
        const [room] = await tx
          .select()
          .from(rooms)
          .where(eq(rooms.id, request.params.roomId))
          .for('update');
        if (!room) throw new GameError('NOT_FOUND', 'Room not found.', 404);
        const member = memberFor(room.game, user.id);
        const round = room.game.rounds.at(-1);
        if (
          room.expiresAt.getTime() <= clock() ||
          !round ||
          round.state !== 'negotiating' ||
          round.endsAt <= clock()
        )
          throw new GameError(
            'NOT_NEGOTIATING',
            'Messages are available during negotiation.',
          );
        const [count] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(roomMessages)
          .where(eq(roomMessages.roundId, round.id));
        if ((count?.n ?? 0) >= 200)
          throw new GameError('MESSAGE_LIMIT', 'Round message limit reached.');
        await tx.insert(roomMessages).values({
          roomId: room.id,
          roundId: round.id,
          seat: member.seat,
          text: request.body.text.trim(),
        });
      });
      return reply.status(201).send({ saved: true });
    },
  );
  await registerVoice(
    app,
    db,
    principal,
    clock,
    options.voiceCoach ?? configuredVoiceCoach(config),
  );
  // Exact static routes: missing /api paths can never fall through to HTML.
  const publicRoot = resolve(import.meta.dirname, '../../playcall/public');
  const webRoot = resolve(import.meta.dirname, '../../web/dist');
  if (existsSync(resolve(webRoot, 'index.html'))) {
    for (const route of [
      '/',
      '/play',
      '/setup',
      '/demo',
      '/account',
      '/login',
      '/signup',
      '/privacy',
      '/terms',
      '/leaderboard',
      '/room/:code',
      '/results/:code',
    ]) {
      app.get(route, async (_r, reply) =>
        reply
          .type('text/html')
          .header('cache-control', 'no-store')
          .header('permissions-policy', 'camera=(), microphone=(self)')
          .send(await readFile(resolve(webRoot, 'index.html'))),
      );
    }
    app.get(
      '/assets/*',
      { schema: { params: Type.Object({ '*': Type.String() }) } },
      async (r, reply) => {
        const path = resolve(webRoot, 'assets', r.params['*']);
        if (
          !path.startsWith(resolve(webRoot, 'assets') + sep) ||
          !existsSync(path)
        )
          return reply.status(404).send({ error: 'Not found' });
        const mime: Record<string, string> = {
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.woff2': 'font/woff2',
          '.svg': 'image/svg+xml',
        };
        return reply
          .type(mime[extname(path)] ?? 'application/octet-stream')
          .send(await readFile(path));
      },
    );
  }
  const files: Record<string, string> = {
    '/': 'text/html; charset=utf-8',
    '/style.css': 'text/css',
    '/refinement.css': 'text/css',
    '/database.css': 'text/css',
    '/bootstrap.js': 'text/javascript',
    '/database-app.js': 'text/javascript',
    '/api-client.js': 'text/javascript',
    '/app.js': 'text/javascript',
    '/demo-data.js': 'text/javascript',
    '/favicon.svg': 'image/svg+xml',
  };
  for (const [path, contentType] of Object.entries(files)) {
    if (path === '/' && existsSync(resolve(webRoot, 'index.html'))) continue;
    app.get(path, async (_request, reply) =>
      reply
        .type(contentType)
        .header('x-content-type-options', 'nosniff')
        .header('permissions-policy', 'camera=(), microphone=()')
        .header('referrer-policy', 'no-referrer')
        .header('cache-control', 'no-store')
        .send(
          await readFile(
            resolve(publicRoot, path === '/' ? 'index.html' : path.slice(1)),
          ),
        ),
    );
  }
  return { app, store, auth };
}
