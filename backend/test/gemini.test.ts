import { describe, expect, it } from 'vitest';
import { createGeminiAi } from '../src/gemini.js';
import { builtinScenario } from '../src/scenario.js';
import { loadConfig } from '../src/config.js';
import { rubric, gradeAssessment } from '../src/rubric.js';

const draft = {
  title: 'The Harbor Repair',
  description:
    'A harbor station needs replacement equipment before an approaching storm.',
  amountLabel: 'credits',
  buyer: { ...builtinScenario.buyer, priceTarget: 400 },
  seller: { ...builtinScenario.seller, priceTarget: 650 },
};
const completed = (data: unknown) =>
  Response.json({
    candidates: [
      {
        finishReason: 'STOP',
        content: {
          parts: [
            { thought: true, text: 'not the answer' },
            { text: JSON.stringify(data) },
          ],
        },
      },
    ],
  });

describe('server-only Gemini integration', () => {
  it('grades only the requested private brief and preserves verifiable evidence', async () => {
    const transcript = [
      {
        id: 'qa-1',
        seat: 0,
        text: 'I can offer 575 credits if delivery takes three days.',
        atMs: 0,
      },
    ];
    const assessment = {
      dimensions: rubric.dimensions.map((d) => ({
        key: d.key,
        level: 2,
        explanation: 'The quoted offer demonstrates some relevant evidence.',
        evidence: [{ segmentId: 'qa-1', quote: 'I can offer 575 credits' }],
      })),
    };
    const transport: typeof fetch = async (_url, init) => {
      const request = JSON.parse(String(init?.body));
      const input = request.contents[0].parts[0].text;
      expect(input).toContain('Mara Voss');
      expect(input).not.toContain('Eli Soren');
      return completed(assessment);
    };
    const result = await createGeminiAi(
      'test-key',
      'gemini-3.1-flash-lite',
      transport,
    ).assess({
      seat: 0,
      role: 'buyer',
      scenario: builtinScenario,
      transcript,
      deal: { priceCredits: 575, deliveryDays: 3, exclusive: false },
    });
    expect(gradeAssessment(result, transcript, 0, 300, 'test').overall).toBe(
      80,
    );
  });
  it('uses header authentication and validates a structured scene', async () => {
    const transport: typeof fetch = async (url, init) => {
      expect(String(url)).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent',
      );
      expect(String(url)).not.toContain('test-server-key');
      expect(new Headers(init?.headers).get('x-goog-api-key')).toBe(
        'test-server-key',
      );
      const body = JSON.parse(String(init?.body));
      expect(body.generationConfig.responseJsonSchema.type).toBe('object');
      expect(body.generationConfig.responseMimeType).toBe('application/json');
      expect(body.systemInstruction.parts[0].text).toContain(
        'reservationPrice',
      );
      return completed(draft);
    };
    const scene = await createGeminiAi(
      'test-server-key',
      'gemini-3.1-flash-lite',
      transport,
    ).generate();
    expect(scene.source).toBe('ai');
    expect(scene.model).toBe('gemini/gemini-3.1-flash-lite');
    expect(scene.title).toBe(draft.title);
  });
  it('does not leak provider errors or keys to the caller', async () => {
    const ai = createGeminiAi('test-server-key', 'gemini-3.8-flash', async () =>
      Response.json(
        { error: { message: 'test-server-key secret provider internals' } },
        { status: 403 },
      ),
    );
    await expect(ai.generate()).rejects.toThrow('HTTP 403');
    await expect(ai.generate()).rejects.not.toThrow('test-server-key');
  });
  it('rejects incomplete output and impossible generated goals', async () => {
    const incomplete = createGeminiAi(
      'test-key',
      'gemini-3.8-flash',
      async () => Response.json({ status: 'in_progress', steps: [] }),
    );
    await expect(incomplete.generate()).rejects.toThrow('incomplete');
    const invalid = createGeminiAi('test-key', 'gemini-3.8-flash', async () =>
      completed({
        ...draft,
        seller: { ...draft.seller, reservationPrice: 999 },
      }),
    );
    await expect(invalid.generate()).rejects.toThrow('incompatible');
  });
  it('selects Gemini from server environment without changing provider configuration', () => {
    const config = loadConfig({
      NODE_ENV: 'development',
      BETTER_AUTH_SECRET: 'test-only-config-secret-at-least-32-characters',
      BETTER_AUTH_URL: 'http://localhost:4173',
      CLIENT_ORIGINS: 'http://localhost:4173',
      DATABASE_URL: 'postgresql://localhost/test',
      GEMINI_API_KEY: 'test-key',
    });
    expect(config.ai).toEqual({
      provider: 'gemini',
      apiKey: 'test-key',
      model: 'gemini-3.1-flash-lite',
    });
  });
});
