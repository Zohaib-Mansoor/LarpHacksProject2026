import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const brief = z
  .object({
    jobTitle: z.string().min(3).max(80),
    character: z.string().min(3).max(100),
    background: z.string().min(20).max(1200),
    priceTarget: z.number().int().min(1).max(1000),
    reservationPrice: z.number().int().min(1).max(1000),
    deliveryTarget: z.number().int().min(1).max(7),
    wantsExclusive: z.boolean(),
  })
  .strict();

export const ScenarioDraft = z
  .object({
    title: z.string().min(5).max(120),
    description: z.string().min(20).max(1000),
    amountLabel: z.string().min(2).max(60),
    buyer: brief,
    seller: brief,
  })
  .strict();
export type ScenarioDraft = z.infer<typeof ScenarioDraft>;
export type ScenarioDefinition = ScenarioDraft & {
  key: string;
  source: 'builtin' | 'ai';
  model: string | null;
};

export function validateScenario(input: unknown): ScenarioDraft {
  const result = ScenarioDraft.parse(input);
  if (
    result.seller.reservationPrice > result.buyer.reservationPrice ||
    result.buyer.priceTarget > result.buyer.reservationPrice ||
    result.seller.priceTarget < result.seller.reservationPrice ||
    result.buyer.priceTarget < result.seller.reservationPrice ||
    result.seller.priceTarget > result.buyer.reservationPrice
  )
    throw new Error('Scenario has incompatible price constraints.');
  if (result.buyer.priceTarget >= result.seller.priceTarget)
    throw new Error('Price objectives must create a negotiation gap.');
  return result;
}

export function freezeScenario(
  input: unknown,
  model: string,
): ScenarioDefinition {
  return {
    ...validateScenario(input),
    key: `generated-${randomUUID()}`,
    source: 'ai',
    model,
  };
}

export const builtinScenario: ScenarioDefinition = {
  key: 'last-shipment-v1',
  source: 'builtin',
  model: null,
  title: 'The Last Shipment',
  description:
    'A frontier station has one shipment left. Negotiate its price, delivery, and exclusivity.',
  amountLabel: 'credits',
  buyer: {
    jobTitle: 'Station quartermaster',
    character: 'Mara Voss, station quartermaster',
    background:
      'Your station needs supplies before the next transport departs. Your budget is tight, and you want to keep other trading partners.',
    priceTarget: 600,
    reservationPrice: 900,
    deliveryTarget: 3,
    wantsExclusive: false,
  },
  seller: {
    jobTitle: 'Independent trader',
    character: 'Eli Soren, independent trader',
    background:
      'This is your final shipment. You need cash to repair your ship, a relaxed delivery schedule, and a lasting relationship with the station.',
    priceTarget: 550,
    reservationPrice: 300,
    deliveryTarget: 4,
    wantsExclusive: true,
  },
};

export function privateBrief(
  definition: ScenarioDefinition,
  role: 'buyer' | 'seller',
) {
  const own = definition[role];
  return {
    jobTitle: own.jobTitle,
    character: own.character,
    background: own.background,
    hardLimit:
      role === 'buyer'
        ? `Never pay more than ${own.reservationPrice} ${definition.amountLabel}.`
        : `Never accept less than ${own.reservationPrice} ${definition.amountLabel}.`,
    objectives: [
      role === 'buyer'
        ? `Pay ${own.priceTarget} ${definition.amountLabel} or less.`
        : `Receive at least ${own.priceTarget} ${definition.amountLabel}.`,
      role === 'buyer'
        ? `Receive delivery within ${own.deliveryTarget} days.`
        : `Allow at least ${own.deliveryTarget} days for delivery.`,
      own.wantsExclusive
        ? 'Secure an exclusive agreement.'
        : 'Keep the agreement non-exclusive.',
    ],
  };
}
