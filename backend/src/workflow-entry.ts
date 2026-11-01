import 'dotenv/config';
import { task, type TaskContext } from '@renderinc/sdk/workflows';
import { connectDatabase } from './db/client.js';
import { runRatingJob } from './workflow-ratings.js';
import { createGeminiJson } from './gemini.js';
import { VOICE_RATING_SYSTEM, type VoiceGradeInput } from './voice-coach.js';
import { Assessment } from './rubric.js';

// Registration never opens a database connection or starts the HTTP server.
task(
  {
    name: 'rateNegotiation',
    plan: 'flex',
    timeoutSeconds: 120,
    retry: { maxRetries: 2, waitDurationMs: 30_000, backoffScaling: 2 },
  },
  async (_ctx: TaskContext, jobId: string) => {
    if (!process.env.DATABASE_URL || !process.env.GEMINI_API_KEY)
      throw new Error('Workflow database or Gemini configuration missing.');
    const connection = connectDatabase(process.env.DATABASE_URL);
    const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
    const generate = createGeminiJson(process.env.GEMINI_API_KEY, model);
    try {
      return await runRatingJob(connection.db, jobId, {
        model: `gemini/${model}`,
        assess: (input: VoiceGradeInput) =>
          generate(Assessment, VOICE_RATING_SYSTEM, JSON.stringify(input)),
      });
    } finally {
      await connection.close();
    }
  },
);
