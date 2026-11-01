import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Database } from './db/client.js';
import { voiceRooms, voiceResults } from './db/schema.js';
import { GameError } from './game.js';

type Role = 'alex' | 'morgan';
type Player = {
  token: string;
  role: Role;
  ready: boolean;
  lastSeen: number;
  muted: boolean;
  reveal: boolean;
  rematch: boolean;
  signals: unknown[];
};
type State = {
  matchmaking?: boolean;
  code: string;
  mode: string;
  created: number;
  phase: string;
  players: Player[];
  messages: { speaker: Role; text: string }[];
  round: number;
  revision: number;
  accepted: Role[];
  deal: { price: number; package: string; proposer: Role } | null;
  deadline: number | null;
};
export type VoiceView = {
  code: string;
  phase: string;
  round: number;
  revision: number;
  serverNow: number;
  you: { id: Role };
  result: null | {
    confirmed: boolean;
    yours: number[];
    scores: Record<string, number>;
  };
  [key: string]: unknown;
};
type Engine = {
  rooms: Map<string, State>;
  create(data: object): VoiceView & { token: string };
  join(data: object): VoiceView & { token: string };
  auth(code: string, token: string): { room: State; player: Player };
  action(code: string, token: string, data: Record<string, unknown>): VoiceView;
  view(room: State, player: Player): VoiceView;
};
// Load the teammate's unchanged pure game engine without bundling server briefs into React.
const { GameStore } = (await import(
  pathToFileURL(resolve(import.meta.dirname, '../../playcall/lib/game.mjs'))
    .href
)) as {
  GameStore: new (options: {
    now: () => number;
    voiceReady: boolean;
  }) => Engine;
};
type Row = typeof voiceRooms.$inferSelect;
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
export class VoiceStore {
  constructor(
    private db: Database,
    private clock = Date.now,
  ) {}
  private engine(row?: Row) {
    const engine = new GameStore({ now: this.clock, voiceReady: false });
    if (row) engine.rooms.set(row.code, row.state as State);
    return engine;
  }
  private seat(row: Row, userId: string) {
    if (row.playerOneId === userId) return 0;
    if (row.playerTwoId === userId) return 1;
    throw new GameError('NOT_A_MEMBER', 'Room not found.', 404);
  }
  private stepBot(engine: Engine, state: State) {
    const bot = state.players[1];
    if (!bot) return;
    bot.lastSeen = this.clock();
    if (state.phase === 'prep' && !bot.ready)
      engine.action(state.code, bot.token, { type: 'ready' });
    if (state.phase !== 'talk') return;
    if (!state.messages.some((m) => m.speaker === bot.role))
      engine.action(state.code, bot.token, {
        type: 'message',
        text: 'Scripted practice partner here. Could we find common ground on staged delivery and 525?',
      });
    if (
      state.deal &&
      state.deal.proposer !== bot.role &&
      !state.accepted.includes(bot.role)
    ) {
      const fair =
        bot.role === 'morgan'
          ? state.deal.price <= 525
          : state.deal.price >= 525;
      if (!fair || state.deal.package !== 'phased')
        engine.action(state.code, bot.token, {
          type: 'propose',
          deal: { price: 525, package: 'phased' },
        });
      engine.action(state.code, bot.token, {
        type: 'confirm',
        revision: state.revision,
      });
    }
  }
  private view(engine: Engine, row: Row, seat: number) {
    const state = row.state as State;
    const view = engine.view(state, state.players[seat]!);
    return {
      ...view,
      token: 'cookie-session',
      sparring: row.sparring,
      matched: !!row.playerTwoId,
    };
  }
  private async save(tx: Tx, row: Row, engine: Engine) {
    const state = row.state as State;
    await tx
      .update(voiceRooms)
      .set({ state, playerTwoId: row.playerTwoId, queued: row.queued })
      .where(eq(voiceRooms.code, row.code));
    if (state.phase === 'complete') {
      for (const [seat, userId] of [
        row.playerOneId,
        row.playerTwoId,
      ].entries()) {
        if (!userId) continue;
        const view = this.view(engine, row, seat);
        if (!view.result) continue;
        await tx
          .insert(voiceResults)
          .values({
            code: row.code,
            round: state.round,
            userId,
            points: view.result.yours.reduce((a, b) => a + b, 0),
            confirmed: view.result.confirmed,
            snapshot: view,
          })
          .onConflictDoNothing();
      }
    }
  }
  private async locked<T>(
    userId: string,
    code: string,
    run: (engine: Engine, row: Row, seat: number) => T,
  ) {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(voiceRooms)
          .where(eq(voiceRooms.code, code.toUpperCase()))
          .for('update');
        if (!row) throw new GameError('NOT_FOUND', 'Room not found.', 404);
        const seat = this.seat(row, userId);
        if (row.expiresAt.getTime() <= this.clock())
          throw new GameError('ROOM_EXPIRED', 'Room expired.', 410);
        const engine = this.engine(row);
        const state = row.state as State;
        if (row.sparring && state.players[1])
          state.players[1].lastSeen = this.clock();
        engine.auth(row.code, state.players[seat]!.token);
        const result = run(engine, row, seat);
        await this.save(tx, row, engine);
        return result;
      });
    } catch (error) {
      if (
        error instanceof Error &&
        'status' in error &&
        !(error instanceof GameError)
      )
        throw new GameError(
          'INVALID_ACTION',
          error.message,
          Number(error.status),
        );
      throw error;
    }
  }
  async create(userId: string, sparring = false, role?: string) {
    return this.db.transaction(async (tx) =>
      this.createIn(tx, userId, sparring, role),
    );
  }
  private async createIn(
    tx: Tx,
    userId: string,
    sparring: boolean,
    role?: string,
    queued = false,
  ) {
    const engine = this.engine();
    const created = engine.create({ consent: true, mode: 'text' });
    if (sparring) engine.join({ code: created.code, consent: true });
    const state = engine.rooms.get(created.code)!;
    state.matchmaking = queued;
    if (sparring && role === 'morgan') {
      state.players[0]!.role = 'morgan';
      state.players[1]!.role = 'alex';
    }
    const row = {
      code: state.code,
      playerOneId: userId,
      playerTwoId: null,
      state,
      sparring,
      queued,
      createdAt: new Date(this.clock()),
      expiresAt: new Date(this.clock() + 3600000),
    };
    await tx.insert(voiceRooms).values(row);
    if (sparring) this.stepBot(engine, state);
    await this.save(tx, row, engine);
    return this.view(engine, row, 0);
  }
  async join(userId: string, code: string) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(voiceRooms)
        .where(eq(voiceRooms.code, code.toUpperCase()))
        .for('update');
      if (!row) throw new GameError('NOT_FOUND', 'Invite not found.', 404);
      if (row.expiresAt.getTime() <= this.clock())
        throw new GameError('ROOM_EXPIRED', 'Invite expired.', 410);
      if ([row.playerOneId, row.playerTwoId].includes(userId))
        return this.view(this.engine(row), row, this.seat(row, userId));
      if (row.playerTwoId || row.sparring)
        throw new GameError('ROOM_FULL', 'Both seats are taken.');
      if (
        (row.state as State).phase !== 'waiting' ||
        row.createdAt.getTime() < this.clock() - 900000
      )
        throw new GameError(
          'ROOM_CLOSED',
          'This invite is no longer accepting players.',
        );
      const engine = this.engine(row);
      engine.join({ code: row.code, consent: true });
      row.playerTwoId = userId;
      row.queued = false;
      await this.save(tx, row, engine);
      return this.view(engine, row, 1);
    });
  }
  async match(userId: string) {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(74017001)`);
      const own = await tx
        .select()
        .from(voiceRooms)
        .where(
          and(
            sql`(${voiceRooms.playerOneId} = ${userId} or ${voiceRooms.playerTwoId} = ${userId})`,
            sql`${voiceRooms.state}->>'matchmaking' = 'true'`,
            sql`${voiceRooms.state}->>'phase' in ('waiting', 'prep', 'talk', 'finalize')`,
            sql`(${voiceRooms.state}->>'phase' <> 'waiting' or ${voiceRooms.createdAt} > ${new Date(this.clock() - 900000)})`,
            gt(voiceRooms.expiresAt, new Date(this.clock())),
          ),
        )
        .limit(1);
      if (own[0])
        return this.view(
          this.engine(own[0]),
          own[0],
          this.seat(own[0], userId),
        );
      const [row] = await tx
        .select()
        .from(voiceRooms)
        .where(
          and(
            eq(voiceRooms.queued, true),
            gt(voiceRooms.createdAt, new Date(this.clock() - 900000)),
            isNull(voiceRooms.playerTwoId),
            gt(voiceRooms.expiresAt, new Date(this.clock())),
          ),
        )
        .orderBy(asc(voiceRooms.createdAt))
        .for('update')
        .limit(1);
      if (row) {
        const engine = this.engine(row);
        // The queue is bounded to fresh rooms; the engine rejects stale/finished invites.
        try {
          engine.join({ code: row.code, consent: true });
        } catch {
          await tx
            .update(voiceRooms)
            .set({ queued: false })
            .where(eq(voiceRooms.code, row.code));
          return this.createIn(tx, userId, false, undefined, true);
        }
        row.playerTwoId = userId;
        row.queued = false;
        await this.save(tx, row, engine);
        return this.view(engine, row, 1);
      }
      return this.createIn(tx, userId, false, undefined, true);
    });
  }
  read(userId: string, code: string) {
    return this.locked(userId, code, (engine, row, seat) => {
      if (row.sparring) this.stepBot(engine, row.state as State);
      return this.view(engine, row, seat);
    });
  }
  action(userId: string, code: string, data: Record<string, unknown>) {
    return this.locked(userId, code, (engine, row, seat) => {
      const state = row.state as State;
      engine.action(row.code, state.players[seat]!.token, data);
      if (data.type === 'leave' || data.type === 'report') row.queued = false;
      if (row.sparring) this.stepBot(engine, state);
      return this.view(engine, row, seat);
    });
  }
  history(userId: string) {
    return this.db
      .select()
      .from(voiceResults)
      .where(eq(voiceResults.userId, userId))
      .orderBy(desc(voiceResults.createdAt))
      .limit(50);
  }
  async standings() {
    const rows = await this.db.execute(
      sql`select max(callsign) as callsign, count(*)::int as rounds, count(*) filter (where confirmed)::int as deals, sum(points)::int as points, max(points)::int as best, (extract(epoch from max(created_at))*1000)::double precision as "updatedAt" from voice_results where callsign is not null group by user_id order by sum(points) desc limit 25`,
    );
    return { entries: rows.rows };
  }
  async publish(userId: string, code: string, callsign: string) {
    const view = await this.read(userId, code);
    if (!view.result)
      throw new GameError('NOT_FINISHED', 'Finish the round first.');
    await this.db
      .update(voiceResults)
      .set({ callsign })
      .where(
        and(
          eq(voiceResults.code, code),
          eq(voiceResults.round, view.round),
          eq(voiceResults.userId, userId),
        ),
      );
    return this.standings();
  }
}
