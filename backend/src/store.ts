import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, lte, sql } from 'drizzle-orm';
import type { Database } from './db/client.js';
import {
  evaluations,
  mediaCleanupJobs,
  playerStats,
  rooms,
  roundResults,
  transcriptSegments,
  userSettings,
  voiceRooms,
  voiceResults,
} from './db/schema.js';
import { settleRound } from './ratings.js';
import { rankTier } from './rubric.js';
import type { ScenarioDefinition } from './scenario.js';
import {
  advance,
  apply,
  GameError,
  join,
  memberFor,
  snapshot,
  type Command,
  type Game,
} from './game.js';

const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const nextWake = (game: Game) => {
  const round = game.rounds.at(-1);
  return round && round.state !== 'completed'
    ? new Date(round.state === 'briefing' ? round.briefEndsAt : round.endsAt)
    : null;
};

export class GameStore {
  constructor(
    private db: Database,
    private clock: () => number = Date.now,
  ) {}

  async create(userId: string, definition?: ScenarioDefinition) {
    const token = randomBytes(32).toString('base64url');
    const game: Game = { members: [], rounds: [] };
    if (definition) game.scenario = structuredClone(definition);
    join(game, userId);
    const now = this.clock();
    const id = randomUUID();
    await this.db.insert(rooms).values({
      id,
      ownerId: userId,
      inviteHash: hash(token),
      expiresAt: new Date(now + 24 * 60 * 60_000),
      game,
    });
    return { room: snapshot(game, userId, id, 1, now), inviteToken: token };
  }

  private async locked<T>(
    id: string,
    run: (row: typeof rooms.$inferSelect, now: number) => T,
    allowExpired = false,
  ) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(rooms)
        .where(eq(rooms.id, id))
        .for('update');
      if (!row) throw new GameError('NOT_FOUND', 'Room not found.', 404);
      const now = this.clock();
      if (!allowExpired && row.expiresAt.getTime() <= now)
        throw new GameError('ROOM_EXPIRED', 'This room has expired.', 410);
      const previous = row.game.rounds.at(-1);
      const activeRoundId =
        previous && previous.state !== 'completed' ? previous.id : null;
      const result = run(row, now);
      await tx
        .update(rooms)
        .set({
          game: row.game,
          version: row.version,
          wakeAt: nextWake(row.game),
        })
        .where(eq(rooms.id, row.id));
      if (activeRoundId && row.game.rounds.at(-1)?.state === 'completed') {
        await settleRound(tx, row.id, row.game, row.game.rounds.at(-1)!, now);
        await tx
          .insert(mediaCleanupJobs)
          .values({
            roundId: activeRoundId,
            roomName: `rolecall-${activeRoundId}`,
            closeUntil: new Date(now + 70_000),
            nextAttemptAt: new Date(now),
          })
          .onConflictDoNothing();
      }
      return result;
    });
  }

  async join(userId: string, token: string) {
    const [room] = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.inviteHash, hash(token)));
    if (!room) throw new GameError('INVALID_INVITE', 'Invite not found.', 404);
    return this.locked(room.id, (row, now) => {
      const existing = row.game.members.some((m) => m.userId === userId);
      join(row.game, userId);
      if (advance(row.game, now) || !existing) row.version++;
      return snapshot(row.game, userId, row.id, row.version, now);
    });
  }

  async read(userId: string, roomId: string) {
    return this.locked(roomId, (row, now) => {
      memberFor(row.game, userId);
      if (advance(row.game, now)) row.version++;
      return snapshot(row.game, userId, row.id, row.version, now);
    });
  }

  async command(
    userId: string,
    roomId: string,
    expectedVersion: number,
    command: Command,
  ) {
    return this.locked(roomId, (row, now) => {
      memberFor(row.game, userId);
      if (command.type === 'mode' && row.ownerId !== userId)
        throw new GameError(
          'OWNER_REQUIRED',
          'Only the room owner can choose ranked mode.',
          403,
        );
      if (row.version !== expectedVersion)
        throw new GameError(
          'STALE_VERSION',
          'Room changed. Refresh its snapshot before retrying.',
        );
      if (
        (command.type === 'ready' || command.type === 'rematch') &&
        row.expiresAt.getTime() - now < 10 * 60_000
      )
        throw new GameError(
          'ROOM_EXPIRING',
          'Create a new room; this invite expires soon.',
        );
      apply(row.game, userId, command, now, randomUUID());
      row.version++;
      return snapshot(row.game, userId, row.id, row.version, now);
    });
  }

  async prepareScenario(
    userId: string,
    roomId: string,
    expectedVersion: number,
    definition?: ScenarioDefinition,
  ) {
    return this.locked(roomId, (row, now) => {
      memberFor(row.game, userId);
      if (row.ownerId !== userId)
        throw new GameError(
          'OWNER_REQUIRED',
          'Only the owner can generate a situation.',
          403,
        );
      if (row.version !== expectedVersion)
        throw new GameError(
          'STALE_VERSION',
          'The room changed while generating. Refresh and retry.',
        );
      const current = row.game.rounds.at(-1);
      if (
        (current && current.state !== 'completed') ||
        row.game.members.some((m) => m.ready)
      )
        throw new GameError(
          'ROUND_ACTIVE',
          'Generate the situation before either player readies.',
        );
      if (definition) {
        row.game.scenario = structuredClone(definition);
        row.version++;
      }
      return snapshot(row.game, userId, row.id, row.version, now);
    });
  }

  async roundFor(userId: string, roomId: string, roundId: string) {
    const [row] = await this.db
      .select()
      .from(rooms)
      .where(eq(rooms.id, roomId));
    if (!row) throw new GameError('NOT_FOUND', 'Room not found.', 404);
    const member = memberFor(row.game, userId);
    const round = row.game.rounds.find((r) => r.id === roundId);
    if (!round) throw new GameError('NOT_FOUND', 'Round not found.', 404);
    return { row, member, round };
  }

  async debrief(userId: string, roomId: string, roundId: string) {
    const { member, round } = await this.roundFor(userId, roomId, roundId);
    if (round.state !== 'completed')
      throw new GameError('NOT_FINISHED', 'Finish the round first.');
    const [result] = await this.db
      .select()
      .from(roundResults)
      .where(eq(roundResults.roundId, roundId));
    const [evaluation] = await this.db
      .select()
      .from(evaluations)
      .where(eq(evaluations.roundId, roundId));
    const expired =
      evaluation && evaluation.expiresAt.getTime() <= this.clock();
    return {
      roundId,
      ranked: !!result?.ranked,
      result: result?.players.find((p) => p.seat === member.seat) ?? null,
      opponentPoints:
        result?.players.find((p) => p.seat !== member.seat)?.points ?? null,
      ai: {
        status: expired ? 'unavailable' : (evaluation?.status ?? 'pending'),
        reason: expired ? 'evidence_expired' : (evaluation?.reason ?? null),
        feedback: expired
          ? null
          : (evaluation?.feedback?.find((f) => f.seat === member.seat)
              ?.feedback ?? null),
      },
    };
  }

  async stats(userId: string) {
    const [stats] = await this.db
      .select()
      .from(playerStats)
      .where(eq(playerStats.userId, userId));
    if (!stats)
      return {
        rating: 1000,
        tier: 'Provisional',
        rankedPlayed: 0,
        totalRounds: 0,
        xp: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        publicId: null,
        handle: null,
      };
    return {
      publicId: stats.publicId,
      handle: stats.handle,
      rating: stats.rating,
      rankedPlayed: stats.rankedPlayed,
      totalRounds: stats.totalRounds,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      xp: stats.xp,
      tier: rankTier(stats.rating, stats.rankedPlayed),
    };
  }

  async leaderboard() {
    const rows = await this.db
      .select({
        publicId: playerStats.publicId,
        handle: playerStats.handle,
        rating: playerStats.rating,
        rankedPlayed: playerStats.rankedPlayed,
        wins: playerStats.wins,
      })
      .from(playerStats)
      .where(gt(playerStats.rankedPlayed, 0))
      .orderBy(
        desc(playerStats.rating),
        desc(playerStats.rankedPlayed),
        playerStats.publicId,
      )
      .limit(100);
    return {
      entries: rows.map((r, i) => ({
        ...r,
        position: i + 1,
        tier: rankTier(r.rating, r.rankedPlayed),
      })),
    };
  }

  async transcript(userId: string, roomId: string, roundId: string) {
    await this.roundFor(userId, roomId, roundId);
    return this.db
      .select({
        id: transcriptSegments.id,
        seat: transcriptSegments.seat,
        text: transcriptSegments.text,
        atMs: transcriptSegments.atMs,
      })
      .from(transcriptSegments)
      .where(
        and(
          eq(transcriptSegments.roundId, roundId),
          gt(transcriptSegments.expiresAt, new Date(this.clock())),
        ),
      )
      .orderBy(transcriptSegments.atMs, transcriptSegments.id);
  }

  async advanceDue() {
    const now = new Date(this.clock());
    const due = await this.db
      .select({ id: rooms.id })
      .from(rooms)
      .where(lte(rooms.wakeAt, now))
      .limit(100);
    for (const room of due) {
      // Rooms cannot begin a round within ten minutes of expiry, so active deadlines precede TTL.
      await this.locked(
        room.id,
        (row, at) => {
          if (advance(row.game, at)) row.version++;
        },
        true,
      );
    }
  }

  async drainMediaCleanup(deleteRoom: (name: string) => Promise<void>) {
    for (let i = 0; i < 20; i++) {
      const job = await this.db.transaction(async (tx) => {
        const [next] = await tx
          .select()
          .from(mediaCleanupJobs)
          .where(lte(mediaCleanupJobs.nextAttemptAt, new Date(this.clock())))
          .orderBy(mediaCleanupJobs.nextAttemptAt)
          .limit(1)
          .for('update', { skipLocked: true });
        if (!next) return null;
        // Lease before external I/O; no transaction stays open during the LiveKit request.
        await tx
          .update(mediaCleanupJobs)
          .set({ nextAttemptAt: new Date(this.clock() + 10_000) })
          .where(eq(mediaCleanupJobs.roundId, next.roundId));
        return next;
      });
      if (!job) return;
      await deleteRoom(job.roomName);
      if (this.clock() >= job.closeUntil.getTime())
        await this.db
          .delete(mediaCleanupJobs)
          .where(eq(mediaCleanupJobs.roundId, job.roundId));
      else
        await this.db
          .update(mediaCleanupJobs)
          .set({ nextAttemptAt: new Date(this.clock() + 5_000) })
          .where(eq(mediaCleanupJobs.roundId, job.roundId));
    }
  }

  async transferGuest(anonymousId: string, accountId: string) {
    if (anonymousId === accountId) return;
    // A single transaction locks affected rooms in stable order. Never combine two seats.
    await this.db.transaction(async (tx) => {
      const voice = await tx
        .select()
        .from(voiceRooms)
        .where(
          sql`${voiceRooms.playerOneId} = ${anonymousId} or ${voiceRooms.playerTwoId} = ${anonymousId}`,
        )
        .orderBy(voiceRooms.code)
        .for('update');
      for (const row of voice) {
        if ([row.playerOneId, row.playerTwoId].includes(accountId))
          throw new GameError(
            'ACCOUNT_CONFLICT',
            'That account already occupies a seat in this room.',
          );
        await tx
          .update(voiceRooms)
          .set({
            playerOneId:
              row.playerOneId === anonymousId ? accountId : row.playerOneId,
            playerTwoId:
              row.playerTwoId === anonymousId ? accountId : row.playerTwoId,
          })
          .where(eq(voiceRooms.code, row.code));
      }
      await tx
        .update(voiceResults)
        .set({ userId: accountId })
        .where(eq(voiceResults.userId, anonymousId));
      const affected = await tx
        .select()
        .from(rooms)
        .where(
          sql`${rooms.game}->'members' @> ${JSON.stringify([{ userId: anonymousId }])}::jsonb`,
        )
        .orderBy(rooms.id)
        .for('update');
      for (const row of affected) {
        if (row.game.members.some((m) => m.userId === accountId))
          throw new GameError(
            'ACCOUNT_CONFLICT',
            'That account already occupies a seat in this room.',
          );
        // Rounds reference seats, not auth IDs, so ownership can move without changing a role,
        // proposal, or confirmed deal. The anonymous auth row is retained by the auth plugin.
        memberFor(row.game, anonymousId).userId = accountId;
        await tx
          .update(rooms)
          .set({
            game: row.game,
            version: row.version + 1,
            ownerId: row.ownerId === anonymousId ? accountId : row.ownerId,
          })
          .where(eq(rooms.id, row.id));
      }
      const accountStats = [];
      for (const id of [anonymousId, accountId].sort()) {
        const [stats] = await tx
          .select()
          .from(playerStats)
          .where(eq(playerStats.userId, id))
          .for('update');
        if (stats) accountStats.push(stats);
      }
      const old = accountStats.find((s) => s.userId === anonymousId);
      const destination = accountStats.find((s) => s.userId === accountId);
      if (old && !destination)
        await tx
          .update(playerStats)
          .set({ userId: accountId })
          .where(eq(playerStats.userId, anonymousId));
      else if (old && destination) {
        // Preserve an established account's competitive rating; XP/history counts can be combined.
        await tx
          .update(playerStats)
          .set({
            xp: old.xp + destination.xp,
            totalRounds: old.totalRounds + destination.totalRounds,
          })
          .where(eq(playerStats.userId, accountId));
        await tx.delete(playerStats).where(eq(playerStats.userId, anonymousId));
      }
      const [settings] = await tx
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, anonymousId));
      if (settings) {
        await tx
          .insert(userSettings)
          .values({ ...settings, userId: accountId })
          .onConflictDoNothing();
        await tx
          .delete(userSettings)
          .where(eq(userSettings.userId, anonymousId));
      }
    });
  }
}
