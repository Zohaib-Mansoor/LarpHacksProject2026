import { describe, expect, it } from 'vitest';
import {
  advance,
  apply,
  BRIEF_MS,
  NEGOTIATION_MS,
  join,
  score,
  snapshot,
  type Game,
} from '../src/game.js';

function started() {
  const game: Game = { members: [], rounds: [] };
  for (const user of ['a', 'b']) {
    join(game, user);
    apply(game, user, { type: 'consent', granted: true }, 0, 'unused');
    apply(game, user, { type: 'ready' }, 0, 'round-1');
  }
  return game;
}

describe('authoritative game rules', () => {
  it('requires consent and two independently ready players', () => {
    const game: Game = { members: [], rounds: [] };
    join(game, 'a');
    expect(() => apply(game, 'a', { type: 'ready' }, 0, 'r')).toThrow(
      'Acknowledge',
    );
    expect(started().rounds[0]?.state).toBe('briefing');
    expect(() => join(started(), 'c')).toThrow('two players');
  });

  it('enforces briefing and the exact deadline without a browser timer', () => {
    const game = started();
    const proposal = {
      type: 'propose',
      terms: { priceCredits: 575, deliveryDays: 3, exclusive: false },
      proposalId: 'p',
    } as const;
    expect(() => apply(game, 'a', proposal, BRIEF_MS - 1, 'r')).toThrow(
      'during negotiation',
    );
    apply(game, 'a', proposal, BRIEF_MS, 'r');
    expect(game.rounds[0]?.state).toBe('negotiating');
    expect(() =>
      apply(
        game,
        'b',
        { type: 'accept', proposalId: 'p' },
        BRIEF_MS + NEGOTIATION_MS,
        'r',
      ),
    ).toThrow();
    expect(game.rounds[0]?.outcome).toBe('no_agreement');
    expect(score('buyer', null).every((o) => o.points === 0)).toBe(true);
  });

  it('clears confirmations on revision and rejects acceptance of stale terms', () => {
    const game = started();
    const terms = { priceCredits: 575, deliveryDays: 3, exclusive: false };
    apply(
      game,
      'a',
      { type: 'propose', terms, proposalId: 'p1' },
      BRIEF_MS,
      'r',
    );
    apply(game, 'a', { type: 'accept', proposalId: 'p1' }, BRIEF_MS, 'r');
    apply(
      game,
      'b',
      {
        type: 'propose',
        terms: { ...terms, exclusive: true },
        proposalId: 'p2',
      },
      BRIEF_MS,
      'r',
    );
    expect(game.rounds[0]?.proposal?.acceptedSeats).toEqual([]);
    expect(() =>
      apply(game, 'a', { type: 'accept', proposalId: 'p1' }, BRIEF_MS, 'r'),
    ).toThrow('terms changed');
    apply(game, 'a', { type: 'accept', proposalId: 'p2' }, BRIEF_MS, 'r');
    apply(game, 'a', { type: 'accept', proposalId: 'p2' }, BRIEF_MS, 'r');
    expect(game.rounds[0]?.state).toBe('negotiating');
    apply(game, 'b', { type: 'accept', proposalId: 'p2' }, BRIEF_MS, 'r');
    expect(game.rounds[0]?.outcome).toBe('agreement');
    expect(() =>
      apply(
        game,
        'a',
        { type: 'propose', terms, proposalId: 'p3' },
        BRIEF_MS,
        'r',
      ),
    ).toThrow();
    expect(game.rounds[0]?.deal?.exclusive).toBe(true);
  });

  it('exposes only the requesting player’s brief and no internal identities', () => {
    const game = started();
    const a = snapshot(game, 'a', 'room', 1, 0);
    const b = snapshot(game, 'b', 'room', 1, 0);
    expect(a.round?.yourRole).toBe('buyer');
    expect(b.round?.yourRole).toBe('seller');
    expect(JSON.stringify(a)).not.toContain('Eli Soren');
    expect(JSON.stringify(b)).not.toContain('Mara Voss');
    expect(JSON.stringify(a)).not.toContain('userId');
    expect(() => snapshot(game, 'stranger', 'room', 1, 0)).toThrow();
  });

  it('scores integer boundaries and swaps roles on a mutually ready rematch', () => {
    expect(
      score('buyer', {
        priceCredits: 600,
        deliveryDays: 3,
        exclusive: false,
      }).reduce((n, o) => n + o.points, 0),
    ).toBe(300);
    expect(
      score('seller', {
        priceCredits: 550,
        deliveryDays: 4,
        exclusive: true,
      }).reduce((n, o) => n + o.points, 0),
    ).toBe(300);
    const game = started();
    advance(game, BRIEF_MS + NEGOTIATION_MS);
    apply(game, 'a', { type: 'rematch' }, 400_000, 'r2');
    expect(game.rounds).toHaveLength(1);
    apply(game, 'b', { type: 'rematch' }, 400_000, 'r2');
    expect(game.rounds[1]?.buyerSeat).toBe(1);
  });

  it('ends the round immediately when consent is withdrawn', () => {
    const game = started();
    apply(game, 'a', { type: 'consent', granted: false }, BRIEF_MS, 'r');
    expect(game.rounds[0]?.outcome).toBe('no_agreement');
    expect(game.members[0]?.consentAt).toBeNull();
  });
});
