import { z } from 'zod';

export const RUBRIC_VERSION = 'negotiation-v1';
export const rubric = {
  version: RUBRIC_VERSION,
  objectiveWeight: 60,
  dimensions: [
    {
      key: 'strategy',
      label: 'Negotiation strategy',
      weight: 15,
      description:
        'Explains priorities, makes reasoned offers, and trades concessions deliberately.',
    },
    {
      key: 'listening',
      label: 'Listening and collaboration',
      weight: 10,
      description:
        'Asks useful questions and responds to the other player’s stated concerns.',
    },
    {
      key: 'clarity',
      label: 'Clarity and closing',
      weight: 10,
      description:
        'Uses clear terms, checks understanding, and accurately summarizes the agreement or remaining disagreement.',
    },
    {
      key: 'professionalism',
      label: 'Respect and composure',
      weight: 5,
      description:
        'Negotiates respectfully without personal attacks, coercion, or harassment.',
    },
  ],
  anchors: [
    '0: No demonstrated skill in the available evidence.',
    '1: Limited; mostly unsupported assertions or missed opportunities.',
    '2: Competent; some clear, relevant examples.',
    '3: Strong; consistent and effective examples.',
    '4: Excellent; specific, adaptive, and effective throughout available evidence.',
  ],
  rules: [
    'Objectives are checked by code against the mutually confirmed deal; each objective is worth 100 mission points.',
    'Overall grade = mission points / 300 × 60 + evidence-based communication points out of 40.',
    'No deal yields zero objective points, but can still demonstrate good communication.',
    'Never grade accent, vocal pitch, gender, nationality, speech disability, or verbosity.',
    'Missing/incomplete transcription produces an unavailable communication grade, never an automatic zero.',
    'Competitive Elo uses mission outcomes only; AI communication grades do not change Elo.',
  ],
} as const;

export const Assessment = z
  .object({
    dimensions: z
      .array(
        z
          .object({
            key: z.enum([
              'strategy',
              'listening',
              'clarity',
              'professionalism',
            ]),
            level: z.number().int().min(0).max(4),
            explanation: z.string().min(10).max(800),
            evidence: z
              .array(
                z
                  .object({
                    segmentId: z.string(),
                    quote: z.string().min(3).max(300),
                  })
                  .strict(),
              )
              .min(1)
              .max(3),
          })
          .strict(),
      )
      .length(4),
  })
  .strict();
export type Assessment = z.infer<typeof Assessment>;
export type TranscriptEvidence = {
  id: string;
  seat: number;
  text: string;
  atMs: number;
};
export type Feedback = {
  rubricVersion: string;
  model: string;
  objectivePoints: number;
  communicationPoints: number;
  overall: number;
  assessment: Assessment;
};

export function gradeAssessment(
  raw: unknown,
  segments: TranscriptEvidence[],
  seat: number,
  missionPoints: number,
  model: string,
): Feedback {
  const assessment = Assessment.parse(raw);
  if (new Set(assessment.dimensions.map((d) => d.key)).size !== 4)
    throw new Error('Grade must contain each rubric dimension exactly once.');
  let communicationPoints = 0;
  for (const dimension of assessment.dimensions) {
    let hasOwnEvidence = false;
    for (const evidence of dimension.evidence) {
      const segment = segments.find((s) => s.id === evidence.segmentId);
      if (!segment || !segment.text.includes(evidence.quote))
        throw new Error('AI cited an unverified transcript quote.');
      if (segment.seat === seat) hasOwnEvidence = true;
    }
    if (!hasOwnEvidence)
      throw new Error('Each category must cite the player’s own speech.');
    communicationPoints +=
      (dimension.level / 4) *
      rubric.dimensions.find((d) => d.key === dimension.key)!.weight;
  }
  const objectivePoints = (missionPoints / 300) * 60;
  return {
    rubricVersion: RUBRIC_VERSION,
    model,
    objectivePoints,
    communicationPoints,
    overall: Math.round((objectivePoints + communicationPoints) * 100) / 100,
    assessment,
  };
}

export function elo(a: number, b: number, scoreA: 0 | 0.5 | 1) {
  const expected = 1 / (1 + 10 ** ((b - a) / 400));
  const delta = Math.round(32 * (scoreA - expected));
  return { a: a + delta, b: b - delta, delta };
}

export function rankTier(rating: number, played: number) {
  if (played < 5) return 'Provisional';
  if (rating < 1000) return 'Bronze';
  if (rating < 1200) return 'Silver';
  if (rating < 1400) return 'Gold';
  if (rating < 1600) return 'Platinum';
  if (rating < 1800) return 'Diamond';
  return 'Master';
}
