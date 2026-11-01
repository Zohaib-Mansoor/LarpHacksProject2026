import { randomUUID } from 'node:crypto';
import { Render } from '@renderinc/sdk';
import { and, eq, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db/client.js';
import {
  voiceRatingJobs as jobs,
  voiceRooms,
  voiceResults,
} from './db/schema.js';
import type { State } from './voice-store.js';
import type { VoiceCoach } from './voice-coach.js';
import { gradeAssessment, type Feedback } from './rubric.js';

export function workflowsEnabled(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.RENDER_WORKFLOWS_ENABLED === 'true' &&
    !!env.RENDER_API_KEY &&
    !!env.RENDER_WORKFLOW_TASK
  );
}

// Always lock room before job: API enqueue uses the same lock order.
async function finish(
  db: Database,
  id: string,
  token: string,
  feedback: Feedback | undefined,
  reason: string | null,
) {
  const [initial] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!initial) return;
  await db.transaction(async (tx) => {
    const [room] = await tx
      .select()
      .from(voiceRooms)
      .where(eq(voiceRooms.code, initial.code))
      .for('update');
    const [job] = await tx
      .select()
      .from(jobs)
      .where(eq(jobs.id, id))
      .for('update');
    if (
      !job ||
      job.leaseToken !== token ||
      !['pending', 'processing'].includes(job.status)
    )
      return;
    const state = room?.state as State | undefined;
    const evaluation = state?.coach?.evaluations[job.role];
    const current =
      state?.round === job.round &&
      state.phase === 'complete' &&
      evaluation?.jobId === id;
    const consented =
      room &&
      state?.players.every(
        (p, i) =>
          (room.sparring && i === 1) || state.coach?.consent.includes(p.role),
      );
    if (!current || !consented) {
      feedback = undefined;
      reason = 'round_changed_or_consent_missing';
    }
    await tx
      .update(jobs)
      .set({
        status: feedback ? 'completed' : 'failed',
        payload: null,
        reason,
        leaseToken: null,
        leaseUntil: null,
      })
      .where(eq(jobs.id, id));
    if (current && room && evaluation) {
      evaluation.status = feedback ? 'complete' : 'failed';
      evaluation.feedback = feedback;
      await tx
        .update(voiceRooms)
        .set({ state })
        .where(eq(voiceRooms.code, room.code));
      const status = feedback ? 'complete' : 'failed';
      // Update only this user's saved receipt, never the opponent's feedback or mission points.
      await tx
        .update(voiceResults)
        .set({
          snapshot: sql`jsonb_set(jsonb_set(${voiceResults.snapshot}, '{coaching,status}', ${JSON.stringify(status)}::jsonb), '{coaching,feedback}', ${JSON.stringify(feedback ?? null)}::jsonb)`,
        })
        .where(
          and(
            eq(voiceResults.code, job.code),
            eq(voiceResults.round, job.round),
            eq(voiceResults.userId, job.userId),
          ),
        );
    }
  });
}

export async function runRatingJob(
  db: Database,
  id: string,
  assessor: Pick<VoiceCoach, 'assess' | 'model'>,
  clock = Date.now,
) {
  z.uuid().parse(id);
  const claim = await db.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(jobs)
      .where(eq(jobs.id, id))
      .for('update');
    if (!job || ['completed', 'failed'].includes(job.status)) return null;
    if (
      job.status === 'processing' &&
      job.leaseUntil &&
      job.leaseUntil.getTime() > clock()
    )
      return null;
    const token = randomUUID();
    await tx
      .update(jobs)
      .set({
        status: 'processing',
        attempts: job.attempts + 1,
        leaseToken: token,
        leaseUntil: new Date(clock() + 180_000),
        nextDispatchAt: new Date(clock() + 180_000),
      })
      .where(eq(jobs.id, id));
    return { ...job, attempts: job.attempts + 1, token };
  });
  if (!claim) return { status: 'already_handled' };
  if (
    !claim.payload ||
    claim.expiresAt.getTime() <= clock() ||
    claim.attempts > 3
  ) {
    await finish(db, id, claim.token, undefined, 'expired_or_retry_limit');
    return { status: 'failed' };
  }
  const [room] = await db
    .select()
    .from(voiceRooms)
    .where(eq(voiceRooms.code, claim.code));
  const state = room?.state as State | undefined;
  if (
    !room ||
    state?.round !== claim.round ||
    state.phase !== 'complete' ||
    !state.players.every(
      (p, i) =>
        (room.sparring && i === 1) || state.coach?.consent.includes(p.role),
    )
  ) {
    await finish(
      db,
      id,
      claim.token,
      undefined,
      'round_changed_or_consent_missing',
    );
    return { status: 'failed' };
  }
  try {
    const { input, points } = claim.payload;
    const assessment = await assessor.assess(input);
    const feedback = gradeAssessment(
      assessment,
      input.transcript,
      input.seat,
      points * 5,
      assessor.model,
    );
    await finish(db, id, claim.token, feedback, null);
    return { status: 'completed' };
  } catch {
    if (claim.attempts >= 3)
      await finish(db, id, claim.token, undefined, 'assessment_failed');
    else
      await db
        .update(jobs)
        .set({
          status: 'pending',
          reason: 'assessment_failed',
          leaseToken: null,
          leaseUntil: null,
          nextDispatchAt: new Date(clock() + 30_000),
        })
        .where(
          and(
            eq(jobs.id, id),
            eq(jobs.leaseToken, claim.token),
            eq(jobs.status, 'processing'),
          ),
        );
    // Do not expose provider response bodies, briefs, transcript text, or secrets in task logs.
    throw new Error('Rating could not be validated; safe retry scheduled.');
  }
}

export async function dispatchRatings(
  db: Database,
  start: (id: string) => Promise<string>,
  clock = Date.now,
) {
  for (let i = 0; i < 3; i++) {
    const claim = await db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(jobs)
        .where(
          and(
            lte(jobs.nextDispatchAt, new Date(clock())),
            or(
              eq(jobs.status, 'pending'),
              and(
                eq(jobs.status, 'processing'),
                lte(jobs.leaseUntil, new Date(clock())),
              ),
            ),
          ),
        )
        .orderBy(jobs.nextDispatchAt)
        .limit(1)
        .for('update', { skipLocked: true });
      if (!job) return null;
      const token = randomUUID();
      await tx
        .update(jobs)
        .set({
          status: 'pending',
          leaseToken: token,
          leaseUntil: null,
          dispatchAttempts: job.dispatchAttempts + 1,
          nextDispatchAt: new Date(clock() + 180_000),
        })
        .where(eq(jobs.id, job.id));
      return { ...job, token };
    });
    if (!claim) return;
    if (claim.expiresAt.getTime() <= clock() || claim.dispatchAttempts >= 5) {
      await finish(
        db,
        claim.id,
        claim.token,
        undefined,
        'dispatch_expired_or_retry_limit',
      );
      continue;
    }
    try {
      const runId = await start(claim.id);
      await db.update(jobs).set({ runId }).where(eq(jobs.id, claim.id));
    } catch {
      await db
        .update(jobs)
        .set({
          reason: 'dispatch_failed',
          nextDispatchAt: new Date(clock() + 30_000),
        })
        .where(
          and(
            eq(jobs.id, claim.id),
            eq(jobs.leaseToken, claim.token),
            eq(jobs.status, 'pending'),
          ),
        );
    }
  }
}

export function startRatingDispatcher(db: Database, onError: () => void) {
  const client = new Render({ token: process.env.RENDER_API_KEY });
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  const tick = () => {
    active = dispatchRatings(db, async (id) => {
      const run = await client.workflows.startTask(
        process.env.RENDER_WORKFLOW_TASK!,
        [id],
      );
      return run.taskRunId;
    })
      .catch(onError)
      .finally(() => {
        if (!stopped) {
          timer = setTimeout(tick, 10_000);
          timer.unref();
        }
      });
  };
  tick();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await active;
  };
}
