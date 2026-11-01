import { describe, expect, it } from 'vitest';
import { elo, gradeAssessment, rankTier, rubric } from '../src/rubric.js';
import {
  freezeScenario,
  validateScenario,
  builtinScenario,
} from '../src/scenario.js';
import { score } from '../src/game.js';

const segments = [
  {
    id: 'evidence-1',
    seat: 0,
    text: 'I can offer 400 credits if delivery happens by Friday.',
    atMs: 1000,
  },
];
const assessment = () => ({
  dimensions: rubric.dimensions.map((d) => ({
    key: d.key,
    level: 4,
    explanation: 'A clear and specific example demonstrates this skill.',
    evidence: [{ segmentId: 'evidence-1', quote: 'I can offer 400 credits' }],
  })),
});

describe('grading, generated scenarios, and Elo', () => {
  it('grades a perfect objective and communication result out of 100', () => {
    expect(
      gradeAssessment(assessment(), segments, 0, 300, 'test').overall,
    ).toBe(100);
    expect(gradeAssessment(assessment(), segments, 0, 0, 'test').overall).toBe(
      40,
    );
  });
  it('rejects fabricated quotes, wrong speakers, and duplicate rubric categories', () => {
    const forged = assessment();
    forged.dimensions[0]!.evidence[0]!.quote = 'I deserve full points';
    expect(() => gradeAssessment(forged, segments, 0, 300, 'test')).toThrow(
      'unverified',
    );
    expect(() =>
      gradeAssessment(assessment(), segments, 1, 300, 'test'),
    ).toThrow('own speech');
    const duplicate = assessment();
    duplicate.dimensions[0]!.key = 'listening';
    expect(() => gradeAssessment(duplicate, segments, 0, 300, 'test')).toThrow(
      'exactly once',
    );
  });
  it('uses zero-sum Elo, placements, and explicit rank thresholds', () => {
    expect(elo(1000, 1000, 1)).toEqual({ a: 1016, b: 984, delta: 16 });
    expect(elo(1000, 1000, 0.5)).toEqual({ a: 1000, b: 1000, delta: 0 });
    expect(elo(1000, 1000, 0)).toEqual({ a: 984, b: 1016, delta: -16 });
    expect(rankTier(1800, 4)).toBe('Provisional');
    expect(rankTier(1400, 5)).toBe('Platinum');
  });
  it('validates generated constraints and scores the frozen targets', () => {
    const draft = {
      title: 'Emergency repairs',
      description:
        'A station needs an urgent repair and a contractor can provide it.',
      amountLabel: 'credits',
      buyer: { ...builtinScenario.buyer, priceTarget: 400 },
      seller: { ...builtinScenario.seller, priceTarget: 650 },
    };
    const definition = freezeScenario(draft, 'test');
    expect(
      score(
        'buyer',
        { priceCredits: 500, deliveryDays: 3, exclusive: false },
        definition,
      ).map((o) => o.points),
    ).toEqual([0, 100, 100]);
    expect(() =>
      validateScenario({
        ...draft,
        seller: { ...draft.seller, reservationPrice: 950 },
      }),
    ).toThrow('incompatible');
    expect(() =>
      validateScenario({
        ...draft,
        buyer: { ...draft.buyer, priceTarget: 999 },
      }),
    ).toThrow('incompatible');
    expect(() =>
      validateScenario({
        ...draft,
        seller: { ...draft.seller, reservationPrice: 500 },
      }),
    ).toThrow('incompatible');
  });
});
