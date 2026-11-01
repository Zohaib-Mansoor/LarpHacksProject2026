import { and, eq, gt, lte } from 'drizzle-orm';
import type { Database } from './db/client.js';
import { evaluations, rooms, transcriptSegments } from './db/schema.js';
import type { AiProvider } from './ai.js';
import { gradeAssessment } from './rubric.js';
import { builtinScenario } from './scenario.js';
import { CONSENT_VERSION, score } from './game.js';

export async function drainEvaluations(
  db: Database,
  ai: AiProvider | undefined,
  clock: () => number,
) {
  for (let i = 0; i < 5; i++) {
    const job = await db.transaction(async (tx) => {
      const [next] = await tx
        .select()
        .from(evaluations)
        .where(
          and(
            lte(evaluations.nextAttemptAt, new Date(clock())),
            // Terminal rows are never picked again, including during retries or restarts.
            // A processing row becomes claimable after its lease expires.
            eq(evaluations.status, 'pending'),
          ),
        )
        .orderBy(evaluations.nextAttemptAt)
        .limit(1)
        .for('update', { skipLocked: true });
      if (!next) return null;
      await tx
        .update(evaluations)
        .set({
          status: 'processing',
          attempts: next.attempts + 1,
          nextAttemptAt: new Date(clock() + 300_000),
        })
        .where(eq(evaluations.roundId, next.roundId));
      return { ...next, attempts: next.attempts + 1 };
    });
    if (!job) break;
    const unavailable = async (reason: string) => {
      await db
        .update(evaluations)
        .set({ status: 'unavailable', reason, feedback: null })
        .where(eq(evaluations.roundId, job.roundId));
    };
    if (job.attempts > 3) {
      await unavailable('retry_limit');
      continue;
    }
    if (job.expiresAt.getTime() <= clock()) {
      await unavailable('evidence_expired');
      continue;
    }
    if (!ai) {
      await unavailable('ai_not_configured');
      continue;
    }
    const [room] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, job.roomId));
    const round = room?.game.rounds.find((r) => r.id === job.roundId);
    if (
      !room ||
      !round ||
      room.game.members.some(
        (m) => m.consentAt === null || m.consentVersion !== CONSENT_VERSION,
      )
    ) {
      await unavailable('consent_missing_or_withdrawn');
      continue;
    }
    const transcript = await db
      .select({
        id: transcriptSegments.id,
        seat: transcriptSegments.seat,
        text: transcriptSegments.text,
        atMs: transcriptSegments.atMs,
      })
      .from(transcriptSegments)
      .where(
        and(
          eq(transcriptSegments.roundId, round.id),
          gt(transcriptSegments.expiresAt, new Date(clock())),
        ),
      )
      .orderBy(transcriptSegments.atMs, transcriptSegments.id);
    if (
      [0, 1].some(
        (seat) =>
          transcript
            .filter((s) => s.seat === seat)
            .reduce((n, s) => n + s.text.length, 0) < 50,
      )
    ) {
      await unavailable('insufficient_transcript');
      continue;
    }
    try {
      const definition = round.scenario ?? builtinScenario;
      const feedback = [];
      for (const seat of [0, 1]) {
        const role = round.buyerSeat === seat ? 'buyer' : 'seller';
        const points = score(role, round.deal, definition).reduce(
          (n, o) => n + o.points,
          0,
        );
        const assessment = await ai.assess({
          seat,
          role,
          scenario: definition,
          transcript,
          deal: round.deal,
        });
        feedback.push({
          seat,
          feedback: gradeAssessment(
            assessment,
            transcript,
            seat,
            points,
            ai.model,
          ),
        });
      }
      await db
        .update(evaluations)
        .set({ status: 'completed', feedback, reason: null })
        .where(eq(evaluations.roundId, round.id));
    } catch {
      await db
        .update(evaluations)
        .set({
          status: job.attempts >= 3 ? 'unavailable' : 'pending',
          reason: 'assessment_failed',
          nextAttemptAt: new Date(clock() + 30_000),
        })
        .where(eq(evaluations.roundId, job.roundId));
    }
  }
  // Recover a worker that died after claiming a job. Never run a second live evaluation before its lease.
  await db
    .update(evaluations)
    .set({ status: 'pending' })
    .where(
      and(
        eq(evaluations.status, 'processing'),
        lte(evaluations.nextAttemptAt, new Date(clock())),
      ),
    );
}
