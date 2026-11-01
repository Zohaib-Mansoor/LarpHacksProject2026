import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from './db/client.js';
import { evaluations, playerStats, roundResults } from './db/schema.js';
import { score, type Game, type Round } from './game.js';
import { builtinScenario } from './scenario.js';
import { elo } from './rubric.js';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export async function settleRound(
  tx: Transaction,
  roomId: string,
  game: Game,
  round: Round,
  now: number,
) {
  const [existing] = await tx
    .select()
    .from(roundResults)
    .where(eq(roundResults.roundId, round.id));
  if (existing) return;
  const orderedMembers = [...game.members].sort((a, b) =>
    a.userId.localeCompare(b.userId),
  );
  for (const member of orderedMembers) {
    const publicId = randomUUID();
    await tx
      .insert(playerStats)
      .values({
        userId: member.userId,
        publicId,
        handle: `Negotiator-${publicId.slice(0, 8)}`,
      })
      .onConflictDoNothing();
  }
  const stats = [];
  for (const member of orderedMembers) {
    const [stat] = await tx
      .select()
      .from(playerStats)
      .where(eq(playerStats.userId, member.userId))
      .for('update');
    stats.push({ ...stat!, seat: member.seat });
  }
  stats.sort((a, b) => a.seat - b.seat);
  const [a, b] = stats;
  if (!a || !b) throw new Error('A completed round requires two players.');
  const points = stats.map((s) =>
    score(
      s.seat === round.buyerSeat ? 'buyer' : 'seller',
      round.deal,
      round.scenario ?? builtinScenario,
    ).reduce((sum, o) => sum + o.points, 0),
  );
  const outcome =
    points[0]! > points[1]! ? 1 : points[0]! < points[1]! ? 0 : 0.5;
  const updated = game.ranked
    ? elo(a.rating, b.rating, outcome)
    : { a: a.rating, b: b.rating };
  for (const [i, s] of stats.entries()) {
    const won = points[i]! > points[1 - i]!;
    const draw = points[i] === points[1 - i];
    await tx
      .update(playerStats)
      .set({
        rating: i === 0 ? updated.a : updated.b,
        xp: s.xp + points[i]!,
        totalRounds: s.totalRounds + 1,
        rankedPlayed: s.rankedPlayed + (game.ranked ? 1 : 0),
        wins: s.wins + (game.ranked && won ? 1 : 0),
        losses: s.losses + (game.ranked && !won && !draw ? 1 : 0),
        draws: s.draws + (game.ranked && draw ? 1 : 0),
      })
      .where(eq(playerStats.userId, s.userId));
  }
  await tx.insert(roundResults).values({
    roundId: round.id,
    roomId,
    ranked: game.ranked ? 1 : 0,
    players: stats.map((s, i) => ({
      seat: s.seat,
      points: points[i]!,
      before: s.rating,
      after: i === 0 ? updated.a : updated.b,
    })),
  });
  await tx
    .insert(evaluations)
    .values({
      roundId: round.id,
      roomId,
      status: 'pending',
      nextAttemptAt: new Date(now + 8_000),
      expiresAt: new Date(now + 7 * 24 * 60 * 60_000),
    })
    .onConflictDoNothing();
}
