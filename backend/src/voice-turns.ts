export const TURN_MS = 45_000;
export const WARNING_MS = 10_000;
export const TURN_COUNT = 6;
export const TALK_MS = TURN_MS * TURN_COUNT;
export type VoiceRole = 'alex' | 'morgan';
export type SpeakingTurn = {
  index: number;
  total: number;
  speaker: VoiceRole;
  startsAt: number;
  endsAt: number;
  warningMs: number;
};
export function speakingTurn(
  state: { phase: string; deadline: number | null; pauseStart?: number | null },
  now: number,
): SpeakingTurn | null {
  if (state.phase !== 'talk' || !state.deadline) return null;
  const startsAt = state.deadline - TALK_MS;
  const effectiveNow = state.pauseStart ?? now;
  const index = Math.floor(Math.max(0, effectiveNow - startsAt) / TURN_MS);
  if (index >= TURN_COUNT) return null;
  return {
    index,
    total: TURN_COUNT,
    speaker: index % 2 === 0 ? 'alex' : 'morgan',
    startsAt: startsAt + index * TURN_MS,
    endsAt: startsAt + (index + 1) * TURN_MS,
    warningMs: WARNING_MS,
  };
}
