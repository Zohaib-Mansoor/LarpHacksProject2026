import { afterAll, beforeAll, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema.js';
import type { Database } from '../src/db/client.js';
import { VoiceStore, type State } from '../src/voice-store.js';
import type { VoiceCoach } from '../src/voice-coach.js';
import {
  dispatchRatings,
  runRatingJob,
  workflowsEnabled,
} from '../src/workflow-ratings.js';
import { type Assessment } from '../src/rubric.js';
const pg = new PGlite(),
  embedded = drizzle(pg, { schema });
const db = embedded as unknown as Database;
let now = Date.now();
const quote = 'I can offer staged delivery so we both meet our goals.';
const assessment: Assessment = {
  dimensions: (
    ['strategy', 'listening', 'clarity', 'professionalism'] as const
  ).map((key) => ({
    key,
    level: 3,
    explanation: 'Specific evidence supports this communication skill.',
    evidence: [{ segmentId: 'turn-0', quote }],
  })),
};
const coach: VoiceCoach = {
  model: 'test',
  transcribe: async () => quote,
  assess: async () => assessment,
};
beforeAll(async () => {
  await migrate(embedded, { migrationsFolder: 'drizzle' });
}, 30000);
afterAll(async () => {
  await pg.close();
});
async function fixture() {
  const uid = randomUUID();
  await embedded.insert(schema.user).values({
    id: uid,
    name: 'Test player',
    email: `${uid}@workflow.test`,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const store = new VoiceStore(db, () => now, coach);
  store.workflowRatings = true;
  const room = await store.create(uid, true);
  const [row] = await embedded
    .select()
    .from(schema.voiceRooms)
    .where(eq(schema.voiceRooms.code, room.code));
  const state = row!.state as State;
  state.phase = 'complete';
  state.finishedAt = now - 6000;
  state.talkStartedAt = now - 10000;
  state.deal = { price: 525, package: 'phased', proposer: 'alex' };
  state.accepted = ['alex', 'morgan'];
  state.coach = {
    consent: ['alex'],
    evaluations: {},
    clips: [
      {
        turn: 0,
        role: 'alex',
        status: 'complete',
        at: now,
        attempts: 1,
        text: quote,
      },
    ],
  };
  await embedded
    .update(schema.voiceRooms)
    .set({ state })
    .where(eq(schema.voiceRooms.code, room.code));
  await store.evaluate(uid, room.code, 1);
  const [job] = await embedded
    .select()
    .from(schema.voiceRatingJobs)
    .where(eq(schema.voiceRatingJobs.code, room.code));
  return { store, uid, code: room.code, job: job! };
}
it('requires explicit activation and both Render credentials', () => {
  expect(
    workflowsEnabled({
      RENDER_WORKFLOWS_ENABLED: 'true',
      RENDER_WORKFLOW_TASK: 'x/y',
    }),
  ).toBe(false);
  expect(
    workflowsEnabled({
      RENDER_WORKFLOWS_ENABLED: 'true',
      RENDER_WORKFLOW_TASK: 'x/y',
      RENDER_API_KEY: 'test',
    }),
  ).toBe(true);
});
it('atomically queues one job, rejects outsiders, retries a dispatch failure and never changes mission points', async () => {
  const { store, uid, code, job } = await fixture();
  await store.evaluate(uid, code, 1);
  await expect(store.evaluate('outsider', code, 1)).rejects.toThrow();
  expect(
    await embedded
      .select()
      .from(schema.voiceRatingJobs)
      .where(eq(schema.voiceRatingJobs.code, code)),
  ).toHaveLength(1);
  await dispatchRatings(
    db,
    async () => {
      throw Error('offline');
    },
    () => now,
  );
  expect(
    (
      await embedded
        .select()
        .from(schema.voiceRatingJobs)
        .where(eq(schema.voiceRatingJobs.id, job.id))
    )[0]!.status,
  ).toBe('pending');
  now += 31_000;
  const received: string[] = [];
  await dispatchRatings(
    db,
    async (id) => {
      received.push(id);
      return 'run-test';
    },
    () => now,
  );
  expect(received).toContain(job.id);
  let calls = 0;
  await runRatingJob(
    db,
    job.id,
    {
      model: 'test',
      assess: async () => {
        calls++;
        return assessment;
      },
    },
    () => now,
  );
  await runRatingJob(db, job.id, coach, () => now);
  expect(calls).toBe(1);
  const [finished] = await embedded
    .select()
    .from(schema.voiceRatingJobs)
    .where(eq(schema.voiceRatingJobs.id, job.id));
  expect(finished!.status).toBe('completed');
  expect(finished!.payload).toBeNull();
  const view = await store.read(uid, code);
  expect(view.coaching).toMatchObject({
    status: 'complete',
    feedback: { objectivePoints: 40, communicationPoints: 30, overall: 70 },
  });
  const [result] = await embedded
    .select()
    .from(schema.voiceResults)
    .where(eq(schema.voiceResults.code, code));
  expect(result!.points).toBe(40);
});
it('rejects invented transcript quotes and ends safely after three attempts', async () => {
  const { job, store, uid, code } = await fixture();
  const invalid = {
    model: 'bad',
    assess: async () => ({
      ...assessment,
      dimensions: assessment.dimensions.map((d) => ({
        ...d,
        evidence: [{ segmentId: 'turn-0', quote: 'This quote never occurred' }],
      })),
    }),
  };
  for (let i = 0; i < 3; i++)
    await expect(runRatingJob(db, job.id, invalid, () => now)).rejects.toThrow(
      'could not be validated',
    );
  const view = await store.read(uid, code);
  expect(view.coaching).toMatchObject({ status: 'failed', feedback: null });
  expect(
    (
      await embedded
        .select()
        .from(schema.voiceResults)
        .where(eq(schema.voiceResults.code, code))
    )[0]!.points,
  ).toBe(40);
});
it('recovers an expired lease and fences a late worker from overwriting newer feedback', async () => {
  const { job, store, uid, code } = await fixture();
  let release!: (value: Assessment) => void;
  let started!: () => void;
  const ready = new Promise<void>((r) => {
    started = r;
  });
  const first = runRatingJob(
    db,
    job.id,
    {
      model: 'old',
      assess: async () => {
        started();
        return new Promise<Assessment>((r) => {
          release = r;
        });
      },
    },
    () => now,
  );
  await ready;
  now += 181_000;
  await dispatchRatings(
    db,
    async () => 'replacement-run',
    () => now,
  );
  await runRatingJob(db, job.id, { ...coach, model: 'new' }, () => now);
  release(assessment);
  await first;
  expect((await store.read(uid, code)).coaching).toMatchObject({
    feedback: { model: 'new' },
  });
});
it('expires queued evidence without sending it to the model', async () => {
  const { job } = await fixture();
  let called = false;
  await embedded
    .update(schema.voiceRatingJobs)
    .set({ expiresAt: new Date(now - 1) })
    .where(eq(schema.voiceRatingJobs.id, job.id));
  await runRatingJob(
    db,
    job.id,
    {
      ...coach,
      assess: async () => {
        called = true;
        return assessment;
      },
    },
    () => now,
  );
  expect(called).toBe(false);
  expect(
    (
      await embedded
        .select()
        .from(schema.voiceRatingJobs)
        .where(eq(schema.voiceRatingJobs.id, job.id))
    )[0],
  ).toMatchObject({ status: 'failed', payload: null });
});
