import { describe, expect, it } from 'vitest';
import { speakingTurn, TALK_MS, TURN_MS } from '../src/voice-turns.js';
import { configuredVoiceCoach } from '../src/voice-coach.js';
import type { Config } from '../src/config.js';

describe('timed speaking and speech provider', () => {
  it('alternates six equal turns, freezes on pause, and closes at the deadline', () => {
    const start = 1000,
      state = { phase: 'talk', deadline: start + TALK_MS };
    for (let index = 0; index < 6; index++) {
      const turn = speakingTurn(state, start + index * TURN_MS)!;
      expect(turn).toMatchObject({
        index,
        speaker: index % 2 ? 'morgan' : 'alex',
        warningMs: 10_000,
      });
      expect(turn.endsAt - turn.startsAt).toBe(45_000);
    }
    expect(speakingTurn(state, state.deadline)).toBeNull();
    expect(speakingTurn({ ...state, phase: 'finalize' }, start)).toBeNull();
    expect(
      speakingTurn({ ...state, pauseStart: start + 100 }, start + TURN_MS)
        ?.index,
    ).toBe(0);
  });
  it('keeps coaching disabled without keys and uses authenticated multipart transcription when configured', async () => {
    expect(configuredVoiceCoach({} as Config)).toBeUndefined();
    let calls = 0;
    const coach = configuredVoiceCoach(
      {
        elevenLabsApiKey: 'test-speech-key',
        ai: {
          provider: 'gemini',
          apiKey: 'test-model-key',
          model: 'test-model',
        },
      } as Config,
      async (url, init) => {
        calls++;
        expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
        expect(init?.headers).toEqual({ 'xi-api-key': 'test-speech-key' });
        const form = init?.body as FormData;
        expect(form.get('model_id')).toBe('scribe_v2');
        expect(form.get('file')).toBeInstanceOf(Blob);
        return Response.json({ text: 'Could we agree on a staged delivery?' });
      },
    )!;
    expect(
      await coach.transcribe(Buffer.from('synthetic audio'), 'audio/webm'),
    ).toContain('staged delivery');
    expect(calls).toBe(1);
  });
});
