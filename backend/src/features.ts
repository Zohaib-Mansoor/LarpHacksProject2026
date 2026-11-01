import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Type } from '@fastify/type-provider-typebox';
import { lte } from 'drizzle-orm';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import {
  evaluations,
  rtcSignals,
  transcriptSegments,
  transcriptionLeases,
} from './db/schema.js';
import type { GameStore } from './store.js';
import { GameError } from './game.js';
import type { AiProvider } from './ai.js';
import { configuredAi } from './ai-provider.js';
import { RtcService } from './rtc.js';
import { rubric } from './rubric.js';
import { drainEvaluations } from './evaluation.js';
import {
  elevenLabsProvider,
  TranscriptStore,
  type SpeechProvider,
  type SpeechStream,
} from './transcription.js';

const Room = Type.Object({ roomId: Type.String({ format: 'uuid' }) });
const Round = Type.Object({
  roomId: Type.String({ format: 'uuid' }),
  roundId: Type.String({ format: 'uuid' }),
});
const RtcQuery = Type.Object({
  roundId: Type.String({ format: 'uuid' }),
  after: Type.Optional(
    Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }),
  ),
});

export async function registerFeatures(
  app: FastifyInstance,
  options: {
    db: Database;
    store: GameStore;
    config: Config;
    clock: () => number;
    principal: (request: FastifyRequest) => Promise<string>;
    ai?: AiProvider;
    speech?: SpeechProvider;
    timers?: boolean;
  },
) {
  const { db, store, config, clock, principal } = options;
  const ai = options.ai ?? configuredAi(config);
  const speech =
    options.speech ??
    (config.elevenLabsApiKey
      ? elevenLabsProvider(config.elevenLabsApiKey)
      : undefined);
  const transcripts = new TranscriptStore(db, clock);
  const rtc = new RtcService(db, store, config, clock);
  const typed =
    app.withTypeProvider<
      import('@fastify/type-provider-typebox').TypeBoxTypeProvider
    >();

  typed.get('/api/rubric', async () => rubric);
  typed.get('/api/me/stats', async (request) =>
    store.stats(await principal(request)),
  );
  typed.get('/api/leaderboard', async () => store.leaderboard());
  typed.post(
    '/api/rooms/:roomId/scenario',
    {
      schema: {
        params: Room,
        body: Type.Object(
          { expectedVersion: Type.Integer({ minimum: 1 }) },
          { additionalProperties: false },
        ),
      },
      config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
    },
    async (request) => {
      const userId = await principal(request);
      await store.prepareScenario(
        userId,
        request.params.roomId,
        request.body.expectedVersion,
      );
      if (!ai)
        throw new GameError(
          'AI_UNAVAILABLE',
          'Set OPENAI_API_KEY to generate a live situation.',
          503,
        );
      let definition;
      try {
        definition = await ai.generate();
      } catch {
        throw new GameError(
          'GENERATION_FAILED',
          'The AI could not produce a valid situation. Retry before readying.',
          502,
        );
      }
      return store.prepareScenario(
        userId,
        request.params.roomId,
        request.body.expectedVersion,
        definition,
      );
    },
  );
  typed.get(
    '/api/rooms/:roomId/rounds/:roundId/debrief',
    { schema: { params: Round } },
    async (request) =>
      store.debrief(
        await principal(request),
        request.params.roomId,
        request.params.roundId,
      ),
  );
  typed.get(
    '/api/rooms/:roomId/rounds/:roundId/transcript',
    { schema: { params: Round } },
    async (request) => ({
      segments: await store.transcript(
        await principal(request),
        request.params.roomId,
        request.params.roundId,
      ),
    }),
  );
  typed.get(
    '/api/rooms/:roomId/rtc/config',
    { schema: { params: Room, querystring: RtcQuery } },
    async (request) =>
      rtc.configuration(
        await principal(request),
        request.params.roomId,
        request.query.roundId,
      ),
  );
  typed.get(
    '/api/rooms/:roomId/rtc/signals',
    {
      schema: { params: Room, querystring: RtcQuery },
      // Signaling polls four times per second while a call connects.
      config: { rateLimit: { max: 600, timeWindow: '1 minute' } },
    },
    async (request) =>
      rtc.receive(
        await principal(request),
        request.params.roomId,
        request.query.roundId,
        request.query.after ?? 0,
      ),
  );
  typed.post(
    '/api/rooms/:roomId/rtc/signals',
    {
      schema: {
        params: Room,
        body: Type.Object(
          { roundId: Type.String({ format: 'uuid' }), signal: Type.Unknown() },
          { additionalProperties: false },
        ),
      },
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    },
    async (request, reply) =>
      reply
        .status(202)
        .send(
          await rtc.send(
            await principal(request),
            request.params.roomId,
            request.body.roundId,
            request.body.signal,
          ),
        ),
  );

  type Context = {
    userId: string;
    roundId: string;
    seat: number;
    streamId: string;
  };
  const contexts = new WeakMap<FastifyRequest, Context>();
  const stops = new Set<() => void>();
  typed.get(
    '/api/rooms/:roomId/transcription',
    {
      websocket: true,
      schema: {
        params: Room,
        querystring: Type.Object({ roundId: Type.String({ format: 'uuid' }) }),
        hide: true,
      },
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
        const room = await store.read(userId, request.params.roomId);
        if (
          room.round?.id !== request.query.roundId ||
          room.round.state !== 'negotiating'
        )
          throw new GameError(
            'NOT_NEGOTIATING',
            'Transcription is available during negotiation.',
          );
        if (!speech)
          throw new GameError(
            'TRANSCRIPTION_UNAVAILABLE',
            'Set ELEVENLABS_API_KEY to enable speech to text.',
            503,
          );
        const seat = room.members.find((m) => m.isYou)!.seat;
        const streamId = await transcripts.claim(request.query.roundId, seat);
        contexts.set(request, {
          userId,
          roundId: request.query.roundId,
          seat,
          streamId,
        });
      },
    },
    (socket, request) => {
      const ctx = contexts.get(request)!;
      let ready = false;
      let closing = false;
      let provider: SpeechStream | undefined;
      let sequence = 0;
      let pending = Promise.resolve();
      let credits = 64_000;
      let lastChunk = Date.now();
      let validating = false;
      let finishTimer: ReturnType<typeof setTimeout> | undefined;
      const emit = (data: unknown) => {
        if (socket.readyState === 1 && socket.bufferedAmount < 65_536)
          socket.send(JSON.stringify(data));
      };
      const dispose = () => {
        closing = true;
        clearInterval(validation);
        if (finishTimer) clearTimeout(finishTimer);
        socket.terminate();
        provider?.close();
        void pending
          .finally(() =>
            transcripts.release(ctx.roundId, ctx.seat, ctx.streamId),
          )
          .catch(() => {});
        stops.delete(dispose);
      };
      const stop = (code = 1000, reason = 'Round ended') => {
        if (closing) return;
        closing = true;
        clearInterval(validation);
        try {
          provider?.finish();
        } catch {
          /* Connection may already be down. */
        }
        if (socket.readyState === 1) socket.close(code, reason);
        finishTimer = setTimeout(dispose, 2000);
        finishTimer.unref();
      };
      const validation = setInterval(() => {
        if (validating || closing) return;
        validating = true;
        const check = async () => {
          if ((await principal(request)) !== ctx.userId) {
            stop(1008, 'Session expired');
            return;
          }
          const room = await store.read(ctx.userId, request.params.roomId);
          if (
            room.round?.id !== ctx.roundId ||
            room.round.state !== 'negotiating' ||
            !(await transcripts.renew(ctx.roundId, ctx.seat, ctx.streamId))
          )
            stop();
        };
        void check()
          .catch(() => stop(1008, 'Stream no longer authorized'))
          .finally(() => {
            validating = false;
          });
      }, 1000);
      socket.on('close', () => stop());
      socket.on('error', () => stop(1011, 'Stream failed'));
      socket.on('message', (raw, binary) => {
        const data = Buffer.isBuffer(raw)
          ? raw
          : Buffer.from(raw as ArrayBuffer);
        credits = Math.min(64_000, credits + (Date.now() - lastChunk) * 32);
        lastChunk = Date.now();
        if (
          closing ||
          !ready ||
          !binary ||
          !data.length ||
          data.length % 2 ||
          data.length > 32_000 ||
          data.length > credits
        ) {
          stop(1008, 'Send realtime mono PCM16 at 16000 Hz');
          return;
        }
        credits -= data.length;
        try {
          provider!.send(data);
        } catch {
          emit({ type: 'transcription.error' });
          stop(1011, 'Speech provider unavailable');
        }
      });
      stops.add(dispose);
      try {
        provider = speech!((event) => {
          if (event.type === 'ready') {
            ready = true;
            emit({
              type: 'transcription.ready',
              sampleRate: 16000,
              format: 'pcm_s16le',
            });
          } else if (event.type === 'partial')
            emit({ type: 'transcription.partial', text: event.text });
          else if (event.type === 'committed') {
            const sourceId = `${ctx.streamId}:${sequence++}`;
            pending = pending
              .then(async () => {
                const segment = await transcripts.append(
                  ctx.userId,
                  request.params.roomId,
                  ctx.roundId,
                  sourceId,
                  event.text,
                );
                if (segment) emit({ type: 'transcription.committed', segment });
              })
              .catch(() => stop(1008, 'Transcript is closed or full'));
          } else {
            emit({ type: 'transcription.error' });
            stop(1011, 'Speech provider unavailable');
          }
        });
      } catch {
        stop(1011, 'Speech provider unavailable');
      }
    },
  );

  let evaluating = false;
  const tick =
    options.timers === false
      ? null
      : setInterval(() => {
          if (evaluating) return;
          evaluating = true;
          const run = async () => {
            await drainEvaluations(db, ai, clock);
          };
          void run()
            .catch((err: unknown) =>
              app.log.error({ err }, 'Evaluation worker failed'),
            )
            .finally(() => {
              evaluating = false;
            });
        }, 2000);
  tick?.unref();
  const maintenance =
    options.timers === false
      ? null
      : setInterval(() => {
          const purge = async () => {
            await db
              .delete(transcriptSegments)
              .where(lte(transcriptSegments.expiresAt, new Date(clock())));
            await db
              .delete(rtcSignals)
              .where(lte(rtcSignals.expiresAt, new Date(clock())));
            await db
              .delete(transcriptionLeases)
              .where(lte(transcriptionLeases.expiresAt, new Date(clock())));
            await db
              .update(evaluations)
              .set({
                feedback: null,
                status: 'unavailable',
                reason: 'evidence_expired',
              })
              .where(lte(evaluations.expiresAt, new Date(clock())));
          };
          void purge().catch((err: unknown) =>
            app.log.error({ err }, 'Retention cleanup failed'),
          );
        }, 30_000);
  maintenance?.unref();
  app.addHook('preClose', async () => {
    if (tick) clearInterval(tick);
    if (maintenance) clearInterval(maintenance);
    for (const stop of stops) stop();
  });
  return { ai, speech, transcripts, rtc };
}
