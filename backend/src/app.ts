import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import swagger from '@fastify/swagger';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { fromNodeHeaders } from 'better-auth/node';
import { RoomServiceClient } from 'livekit-server-sdk';
import { sql } from 'drizzle-orm';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import { createAuth } from './auth.js';
import { GameStore } from './store.js';
import { CONSENT_VERSION, GameError } from './game.js';
import { registerFeatures } from './features.js';
import type { AiProvider } from './ai.js';
import type { SpeechProvider } from './transcription.js';

const RoomParams = Type.Object({ roomId: Type.String({ format: 'uuid' }) });
const TermsSchema = Type.Object(
  {
    priceCredits: Type.Integer({ minimum: 1, maximum: 1000 }),
    deliveryDays: Type.Integer({ minimum: 1, maximum: 7 }),
    exclusive: Type.Boolean(),
  },
  { additionalProperties: false },
);
const CommandSchema = Type.Union([
  Type.Object(
    { type: Type.Literal('mode'), ranked: Type.Boolean() },
    { additionalProperties: false },
  ),
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
    { type: Type.Literal('propose'), terms: TermsSchema },
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

export async function buildApp(options: {
  db: Database;
  config: Config;
  clock?: () => number;
  logger?: boolean;
  timers?: boolean;
  ai?: AiProvider;
  speech?: SpeechProvider;
}) {
  const { db, config } = options;
  const clock = options.clock ?? Date.now;
  const store = new GameStore(db, clock);
  const auth = createAuth(db, config, store);
  const app = Fastify({
    logger:
      options.logger === false
        ? false
        : {
            redact: [
              'req.headers.cookie',
              'req.headers.authorization',
              'res.headers.set-cookie',
            ],
            // Invite tokens are in POST bodies; request bodies are never logged.
          },
    bodyLimit: 16_384,
    ajv: { customOptions: { removeAdditional: false } },
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(cors, { origin: config.origins, credentials: true });
  await app.register(helmet);
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  await app.register(websocket, { options: { maxPayload: 32_768 } });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'RoleCall API',
        version: '0.1.0',
        description:
          'Cookie-authenticated two-player negotiation game. All mutation requests require a trusted Origin header.',
      },
      components: {
        securitySchemes: {
          session: {
            type: 'apiKey',
            in: 'cookie',
            name: config.production
              ? '__Secure-better-auth.session_token'
              : 'better-auth.session_token',
          },
        },
      },
    },
  });

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/api/'))
      reply.header('cache-control', 'no-store');
    return payload;
  });

  app.addHook('onRequest', async (request) => {
    if (
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      !request.url.startsWith('/api/auth/')
    ) {
      if (
        !request.headers.origin ||
        !config.origins.includes(request.headers.origin)
      )
        throw new GameError(
          'INVALID_ORIGIN',
          'A trusted Origin header is required.',
          403,
        );
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof GameError)
      return reply.status(error.status).send({
        error: { code: error.code, message: error.message },
        requestId: request.id,
      });
    const typed = error as {
      validation?: unknown;
      statusCode?: number;
      message?: string;
    };
    if (typed.validation)
      return reply.status(400).send({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request did not match the API schema.',
        },
        requestId: request.id,
      });
    if (typed.statusCode === 429)
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Try again shortly.',
        },
        requestId: request.id,
      });
    request.log.error({ err: error }, 'Request failed');
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
      requestId: request.id,
    });
  });

  const principal = async (request: FastifyRequest) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session)
      throw new GameError(
        'UNAUTHENTICATED',
        'Sign in as a guest or with Google first.',
        401,
      );
    return session.user.id;
  };

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    schema: { hide: true },
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
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
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
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
  app.get('/api/openapi.json', { schema: { hide: true } }, async () =>
    app.swagger(),
  );
  app.get('/api/config', async () => ({
    consentVersion: CONSENT_VERSION,
    audio: true,
    callTransport: 'webrtc-peer-to-peer',
    aiScenarios: !!config.ai || !!options.ai,
    transcription: !!config.elevenLabsApiKey || !!options.speech,
    google: !!config.google,
    audioNotice:
      'Your call audio travels directly to the other browser over encrypted WebRTC. A separate microphone copy is sent through our server to ElevenLabs for live transcription; transcript text is sent to the AI provider for grading. We store transcripts and quote-based feedback for seven days, but do not store raw audio. Provider retention follows their policies. Relay fallback is enabled only if explicitly configured.',
  }));
  app.get('/api/me', async (request) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) throw new GameError('UNAUTHENTICATED', 'Sign in first.', 401);
    return { authenticated: true, guest: !!session.user.isAnonymous };
  });
  const features = await registerFeatures(app, {
    db,
    store,
    config,
    clock,
    principal,
    ai: options.ai,
    speech: options.speech,
    timers: options.timers,
  });

  app.post(
    '/api/rooms',
    {
      schema: {
        security: [{ session: [] }],
        summary: 'Create a room and return its invite token once',
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const userId = await principal(request);
      let generated;
      if (features.ai) {
        try {
          generated = await features.ai.generate();
        } catch {
          throw new GameError(
            'GENERATION_FAILED',
            'The AI could not create a valid situation. Please retry.',
            502,
          );
        }
      }
      return reply.status(201).send(await store.create(userId, generated));
    },
  );

  app.post(
    '/api/rooms/join',
    {
      schema: {
        security: [{ session: [] }],
        body: Type.Object(
          {
            inviteToken: Type.String({
              minLength: 43,
              maxLength: 43,
              pattern: '^[A-Za-z0-9_-]+$',
            }),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request) =>
      store.join(await principal(request), request.body.inviteToken),
  );

  app.get(
    '/api/rooms/:roomId',
    {
      schema: { security: [{ session: [] }], params: RoomParams },
    },
    async (request) =>
      store.read(await principal(request), request.params.roomId),
  );

  app.post(
    '/api/rooms/:roomId/commands',
    {
      schema: {
        security: [{ session: [] }],
        params: RoomParams,
        body: Type.Object(
          {
            expectedVersion: Type.Integer({ minimum: 1 }),
            command: CommandSchema,
          },
          { additionalProperties: false },
        ),
      },
    },
    async (request) => {
      const { expectedVersion, command } = request.body;
      return store.command(
        await principal(request),
        request.params.roomId,
        expectedVersion,
        command.type === 'propose'
          ? { ...command, proposalId: randomUUID() }
          : command,
      );
    },
  );

  app.post(
    '/api/rooms/:roomId/audio-token',
    { schema: { params: RoomParams, deprecated: true } },
    async (request) => {
      await store.read(await principal(request), request.params.roomId);
      throw new GameError(
        'DIRECT_CALLS_ONLY',
        'Use /rtc/config and peer-to-peer signaling. SFU call tokens are no longer issued.',
        410,
      );
    },
  );

  const sockets = new Set<import('ws').WebSocket>();
  const socketCounts = new Map<string, number>();
  const socketUsers = new WeakMap<FastifyRequest, string>();
  app.get(
    '/api/rooms/:roomId/events',
    {
      websocket: true,
      schema: { params: RoomParams, hide: true },
      preValidation: async (request) => {
        if (
          !request.headers.origin ||
          !config.origins.includes(request.headers.origin)
        )
          throw new GameError(
            'INVALID_ORIGIN',
            'A trusted Origin header is required.',
            403,
          );
        const userId = await principal(request);
        if ((socketCounts.get(userId) ?? 0) >= 5)
          throw new GameError(
            'SOCKET_LIMIT',
            'Too many live connections.',
            429,
          );
        await store.read(userId, request.params.roomId);
        socketUsers.set(request, userId);
      },
    },
    (socket, request) => {
      const userId = socketUsers.get(request)!;
      socketCounts.set(userId, (socketCounts.get(userId) ?? 0) + 1);
      sockets.add(socket);
      let busy = false;
      let version = -1;
      const tick = async () => {
        if (busy || socket.readyState !== 1) return;
        busy = true;
        try {
          if ((await principal(request)) !== userId) {
            socket.close(1008, 'Session expired');
            return;
          }
          const room = await store.read(userId, request.params.roomId);
          if (socket.bufferedAmount > 65_536) {
            socket.close(1013, 'Client too slow');
            return;
          }
          if (room.version !== version && socket.readyState === 1) {
            socket.send(JSON.stringify({ type: 'room.snapshot', room }));
            version = room.version;
          }
        } catch (error) {
          socket.close(
            error instanceof GameError ? 1008 : 1011,
            'Reconnect and refresh the room',
          );
        } finally {
          busy = false;
        }
      };
      const timer = setInterval(() => void tick(), 1000);
      socket.on('error', () => socket.close());
      socket.on('message', () => socket.close(1008, 'Use HTTP for commands'));
      socket.on('close', () => {
        clearInterval(timer);
        sockets.delete(socket);
        const count = (socketCounts.get(userId) ?? 1) - 1;
        if (count > 0) socketCounts.set(userId, count);
        else socketCounts.delete(userId);
      });
      void tick();
    },
  );

  let sweeping = false;
  const media = config.livekit
    ? new RoomServiceClient(
        config.livekit.url.replace(/^ws/, 'http'),
        config.livekit.apiKey,
        config.livekit.apiSecret,
      )
    : null;
  const timer =
    options.timers === false
      ? null
      : setInterval(() => {
          if (sweeping) return;
          sweeping = true;
          const sweep = async () => {
            await store.advanceDue();
            if (media)
              await store.drainMediaCleanup(async (name) => {
                try {
                  await media.deleteRoom(name);
                } catch (error) {
                  if ((error as { code?: string }).code !== 'not_found')
                    throw error;
                }
              });
          };
          sweep()
            .catch((err: unknown) =>
              app.log.error({ err }, 'Round scheduler failed'),
            )
            .finally(() => {
              sweeping = false;
            });
        }, 1000);
  timer?.unref();
  app.addHook('preClose', async () => {
    if (timer) clearInterval(timer);
    for (const socket of sockets) socket.terminate();
  });
  return { app, store, auth, features };
}
