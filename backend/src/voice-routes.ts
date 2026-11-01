import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Type, type TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Database } from './db/client.js';
import { VoiceStore } from './voice-store.js';
import { GameError } from './game.js';

const Code = Type.String({ pattern: '^[A-Za-z0-9]{6}$' });
const Query = Type.Object({
  code: Code,
  after: Type.Optional(Type.Integer({ minimum: 0 })),
  token: Type.Optional(Type.String({ maxLength: 128 })),
});
type Peer = { userId: string; role: string; reply: FastifyReply };
export async function registerVoice(
  app: FastifyInstance,
  db: Database,
  principal: (r: FastifyRequest) => Promise<{ id: string }>,
  clock = Date.now,
) {
  const store = new VoiceStore(db, clock);
  const routes = app.withTypeProvider<TypeBoxTypeProvider>();
  const streams = new Map<string, Set<Peer>>();
  const signals = new Map<
    string,
    { id: number; from: string; signal: unknown; at: number }[]
  >();
  let sequence = 0;
  const emit = (peer: Peer, event: string, value: unknown) => {
    if (peer.reply.raw.destroyed || peer.reply.raw.writableLength > 262144) {
      peer.reply.raw.destroy();
      return;
    }
    peer.reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
  };
  const peerEmit = (
    code: string,
    userId: string,
    event: string,
    value: unknown,
  ) => {
    for (const peer of streams.get(code) ?? [])
      if (peer.userId !== userId) emit(peer, event, value);
  };
  const publish = async (code: string) => {
    for (const peer of streams.get(code) ?? []) {
      try {
        emit(peer, 'sync', await store.read(peer.userId, code));
      } catch {
        peer.reply.raw.end();
      }
    }
  };
  routes.post(
    '/api/vc/rooms',
    {
      schema: {
        body: Type.Object({
          consent: Type.Literal(true),
          mode: Type.Optional(Type.String()),
        }),
      },
    },
    async (r, reply) =>
      reply.status(201).send(await store.create((await principal(r)).id)),
  );
  routes.post(
    '/api/vc/join',
    {
      schema: {
        body: Type.Object({ code: Code, consent: Type.Literal(true) }),
      },
    },
    async (r) => {
      const view = await store.join((await principal(r)).id, r.body.code);
      await publish(view.code);
      return view;
    },
  );
  routes.post(
    '/api/vc/match',
    { schema: { body: Type.Object({ consent: Type.Literal(true) }) } },
    async (r) => {
      const view = await store.match((await principal(r)).id);
      await publish(view.code);
      return view;
    },
  );
  routes.post(
    '/api/vc/sparring',
    {
      schema: {
        body: Type.Object({
          consent: Type.Literal(true),
          role: Type.Optional(
            Type.Union([Type.Literal('alex'), Type.Literal('morgan')]),
          ),
        }),
      },
    },
    async (r) => store.create((await principal(r)).id, true, r.body.role),
  );
  routes.get('/api/vc/room', { schema: { querystring: Query } }, async (r) =>
    store.read((await principal(r)).id, r.query.code),
  );
  routes.post(
    '/api/vc/action',
    {
      schema: {
        body: Type.Object(
          {
            code: Code,
            type: Type.Union(
              [
                'ready',
                'mute',
                'message',
                'propose',
                'confirm',
                'decline',
                'reveal',
                'rematch',
                'leave',
                'report',
              ].map((v) => Type.Literal(v)),
            ),
            text: Type.Optional(Type.String({ maxLength: 1000 })),
            muted: Type.Optional(Type.Boolean()),
            allow: Type.Optional(Type.Boolean()),
            revision: Type.Optional(Type.Integer({ minimum: 1 })),
            deal: Type.Optional(
              Type.Object(
                {
                  price: Type.Integer({
                    minimum: 450,
                    maximum: 600,
                    multipleOf: 25,
                  }),
                  package: Type.Union([
                    Type.Literal('phased'),
                    Type.Literal('full-6'),
                    Type.Literal('full-8'),
                  ]),
                },
                { additionalProperties: false },
              ),
            ),
          },
          { additionalProperties: false },
        ),
      },
    },
    async (r) => {
      const view = await store.action(
        (await principal(r)).id,
        r.body.code,
        r.body,
      );
      await publish(view.code);
      return view;
    },
  );
  routes.get('/api/vc/me/history', async (r) => {
    const rows = await store.history((await principal(r)).id);
    return { rounds: rows.map((row) => row.snapshot) };
  });
  routes.get('/api/vc/leaderboard', async () => store.standings());
  routes.post(
    '/api/vc/leaderboard',
    {
      schema: {
        body: Type.Object({
          code: Code,
          callsign: Type.String({
            minLength: 1,
            maxLength: 28,
            pattern: '\\S',
          }),
        }),
      },
    },
    async (r) =>
      store.publish(
        (await principal(r)).id,
        r.body.code,
        r.body.callsign.trim(),
      ),
  );

  routes.get(
    '/api/vc/call-stream',
    {
      schema: { querystring: Query },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (r, reply) => {
      const user = await principal(r),
        code = r.query.code.toUpperCase();
      const view = await store.read(user.id, code);
      const set = streams.get(code) ?? new Set<Peer>();
      if ([...set].filter((p) => p.userId === user.id).length >= 3)
        throw new GameError('STREAM_LIMIT', 'Too many live streams.', 429);
      reply.hijack();
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      const peer: Peer = { userId: user.id, role: view.you.id, reply };
      set.add(peer);
      streams.set(code, set);
      emit(peer, 'hello', {
        role: peer.role,
        peerOnline: view.sparring || [...set].some((p) => p.userId !== user.id),
      });
      emit(peer, 'sync', view);
      peerEmit(code, user.id, 'peer-presence', {
        online: true,
        role: peer.role,
      });
      for (const item of signals.get(code) ?? [])
        if (item.from !== peer.role && item.at > Date.now() - 30000)
          emit(peer, 'signal', item);
      let busy = false;
      const timer = setInterval(() => {
        if (busy) return;
        busy = true;
        void (async () => {
          await principal(r); // Recheck session revocation and membership for every push.
          const next = await store.read(user.id, code);
          peer.role = next.you.id;
          emit(peer, 'sync', next);
          if (['complete', 'incomplete'].includes(next.phase)) reply.raw.end();
        })()
          .catch(() => reply.raw.end())
          .finally(() => {
            busy = false;
          });
      }, 1000);
      timer.unref();
      reply.raw.on('close', () => {
        clearInterval(timer);
        set.delete(peer);
        if (!set.size) {
          streams.delete(code);
          signals.delete(code);
        } else
          peerEmit(code, user.id, 'peer-presence', {
            online: [...set].some((p) => p.userId === user.id),
            role: peer.role,
          });
      });
    },
  );
  routes.get(
    '/api/vc/call-signal',
    { schema: { querystring: Query } },
    async (r) => {
      const view = await store.read((await principal(r)).id, r.query.code);
      const items = (signals.get(view.code) ?? []).filter(
        (s) =>
          s.from !== view.you.id &&
          s.id > (r.query.after ?? 0) &&
          s.at > Date.now() - 30000,
      );
      return { signals: items, cursor: sequence };
    },
  );
  const active = async (r: FastifyRequest, code: string) => {
    const user = await principal(r),
      view = await store.read(user.id, code);
    if (!['waiting', 'prep', 'talk', 'finalize'].includes(view.phase))
      throw new GameError('ROUND_ENDED', 'Call has ended.');
    return { user, view };
  };
  routes.post(
    '/api/vc/call-signal',
    {
      schema: {
        body: Type.Object(
          { code: Code, signal: Type.Unknown() },
          { additionalProperties: false },
        ),
      },
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    },
    async (r) => {
      const { user, view } = await active(r, r.body.code);
      if (
        !r.body.signal ||
        typeof r.body.signal !== 'object' ||
        JSON.stringify(r.body.signal).length > 24000
      )
        throw new GameError('INVALID_SIGNAL', 'Invalid signal.', 400);
      const list = (signals.get(view.code) ?? []).filter(
        (s) => s.at > Date.now() - 30000,
      );
      const item = {
        id: ++sequence,
        from: view.you.id,
        signal: r.body.signal,
        at: Date.now(),
      };
      list.push(item);
      signals.set(view.code, list.slice(-200));
      peerEmit(view.code, user.id, 'signal', item);
      return { ok: true, id: item.id };
    },
  );
  routes.post(
    '/api/vc/call-telemetry',
    {
      schema: {
        body: Type.Object(
          {
            code: Code,
            speaking: Type.Optional(Type.Boolean()),
            muted: Type.Optional(Type.Boolean()),
            interim: Type.Optional(Type.String({ maxLength: 260 })),
          },
          { additionalProperties: false },
        ),
      },
      config: { rateLimit: { max: 1200, timeWindow: '1 minute' } },
    },
    async (r) => {
      const { user, view } = await active(r, r.body.code);
      peerEmit(view.code, user.id, 'telemetry', {
        from: view.you.id,
        speaking: !!r.body.speaking,
        muted: !!r.body.muted,
        interim: r.body.interim ?? '',
      });
      return { ok: true };
    },
  );
  const budgets = new Map<string, { at: number; bytes: number }>();
  routes.post(
    '/api/vc/call-audio',
    {
      schema: {
        body: Type.Object(
          {
            code: Code,
            pcm: Type.String({
              maxLength: 24000,
              pattern: '^[A-Za-z0-9+/]*={0,2}$',
            }),
            rate: Type.Integer({ minimum: 8000, maximum: 48000 }),
          },
          { additionalProperties: false },
        ),
      },
      config: { rateLimit: { max: 1200, timeWindow: '1 minute' } },
    },
    async (r) => {
      const { user, view } = await active(r, r.body.code);
      if (!['prep', 'talk', 'finalize'].includes(view.phase))
        throw new GameError('NOT_STARTED', 'Start the round first.');
      const now = Date.now();
      const budget = budgets.get(user.id) ?? { at: now, bytes: 0 };
      if (now - budget.at >= 1000) {
        budget.at = now;
        budget.bytes = 0;
      }
      budget.bytes += Buffer.byteLength(r.body.pcm, 'base64');
      budgets.set(user.id, budget);
      if (budget.bytes > 64000)
        throw new GameError('AUDIO_LIMIT', 'Audio rate exceeded.', 429);
      peerEmit(view.code, user.id, 'audio', {
        from: view.you.id,
        pcm: r.body.pcm,
        rate: r.body.rate,
      });
      return { ok: true };
    },
  );
  app.addHook('preClose', async () => {
    for (const set of streams.values())
      for (const peer of set) peer.reply.raw.end();
    streams.clear();
    signals.clear();
    budgets.clear();
  });
  return store;
}
