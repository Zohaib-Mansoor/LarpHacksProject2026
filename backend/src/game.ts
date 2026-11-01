// Pure domain rules. Never import this module into the browser: it contains both briefs.
import {
  builtinScenario,
  privateBrief,
  type ScenarioDefinition,
} from './scenario.js';
export const BRIEF_MS = 45_000;
export const NEGOTIATION_MS = 300_000;
export const CONSENT_VERSION = 'audio-transcription-ai-v2';
export type Role = 'buyer' | 'seller';
export type Terms = {
  priceCredits: number;
  deliveryDays: number;
  exclusive: boolean;
};
export type Member = {
  userId: string;
  alias: string;
  seat: number;
  consentAt: number | null;
  consentVersion: string | null;
  ready: boolean;
};
export type ObjectiveResult = {
  key: string;
  description: string;
  achieved: boolean;
  points: number;
};
export type Proposal = {
  id: string;
  revision: number;
  authorSeat: number;
  terms: Terms;
  acceptedSeats: number[];
};
export type Round = {
  id: string;
  scenarioVersion: string;
  scenario?: ScenarioDefinition;
  buyerSeat: number;
  state: 'briefing' | 'negotiating' | 'completed';
  briefEndsAt: number;
  endsAt: number;
  endedAt: number | null;
  outcome: 'agreement' | 'no_agreement' | null;
  proposal: Proposal | null;
  deal: Terms | null;
};
export type Game = {
  members: Member[];
  rounds: Round[];
  scenario?: ScenarioDefinition;
  ranked?: boolean;
};
export type Command =
  | { type: 'mode'; ranked: boolean }
  | { type: 'consent'; granted: boolean }
  | { type: 'ready' }
  | { type: 'propose'; terms: Terms; proposalId: string }
  | { type: 'accept'; proposalId: string }
  | { type: 'rematch' };

export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}

export const scenario = builtinScenario;

export function memberFor(game: Game, userId: string): Member {
  const member = game.members.find((m) => m.userId === userId);
  if (!member) throw new GameError('NOT_A_MEMBER', 'Room not found.', 404);
  return member;
}

export function score(
  role: Role,
  deal: Terms | null,
  definition: ScenarioDefinition = builtinScenario,
): ObjectiveResult[] {
  const targets = definition[role];
  const achieved =
    role === 'buyer'
      ? [
          !!deal && deal.priceCredits <= targets.priceTarget,
          !!deal && deal.deliveryDays <= targets.deliveryTarget,
          !!deal && deal.exclusive === targets.wantsExclusive,
        ]
      : [
          !!deal && deal.priceCredits >= targets.priceTarget,
          !!deal && deal.deliveryDays >= targets.deliveryTarget,
          !!deal && deal.exclusive === targets.wantsExclusive,
        ];
  return privateBrief(definition, role).objectives.map((description, i) => ({
    key: `${role}-${i + 1}`,
    description,
    achieved: achieved[i]!,
    points: achieved[i] ? 100 : 0,
  }));
}

export function advance(game: Game, now: number): boolean {
  const round = game.rounds.at(-1);
  if (!round || round.state === 'completed') return false;
  if (now >= round.endsAt) {
    round.state = 'completed';
    round.endedAt = round.endsAt;
    round.outcome = 'no_agreement';
    round.deal = null;
    return true;
  }
  if (now >= round.briefEndsAt && round.state === 'briefing') {
    round.state = 'negotiating';
    return true;
  }
  return false;
}

export function join(game: Game, userId: string): void {
  if (game.members.some((m) => m.userId === userId)) return;
  if (game.members.length >= 2)
    throw new GameError('ROOM_FULL', 'This room already has two players.');
  const seat = game.members.length;
  game.members.push({
    userId,
    seat,
    alias: seat === 0 ? 'Player One' : 'Player Two',
    consentAt: null,
    consentVersion: null,
    ready: false,
  });
}

export function apply(
  game: Game,
  userId: string,
  command: Command,
  now: number,
  newId: string,
): void {
  const member = memberFor(game, userId);
  advance(game, now);
  const round = game.rounds.at(-1);

  if (command.type === 'mode') {
    if (game.rounds.length || game.members.some((m) => m.ready))
      throw new GameError(
        'ROUND_ACTIVE',
        'Choose the mode before either player readies.',
      );
    game.ranked = command.ranked;
    return;
  }

  if (command.type === 'consent') {
    if (round && round.state !== 'completed') {
      if (command.granted)
        throw new GameError(
          'ROUND_ACTIVE',
          'Consent is already acknowledged for this round.',
        );
      round.state = 'completed';
      round.endedAt = now;
      round.outcome = 'no_agreement';
      round.deal = null;
    }
    member.consentAt = command.granted ? now : null;
    member.consentVersion = command.granted ? CONSENT_VERSION : null;
    member.ready = false;
    return;
  }

  if (command.type === 'rematch') {
    if (!round || round.state !== 'completed')
      throw new GameError('NOT_FINISHED', 'Complete the current round first.');
    // Each player readies independently; the second acknowledgement starts the next round.
  } else if (command.type === 'ready' && round) {
    throw new GameError('USE_REMATCH', 'Use rematch after the first round.');
  }

  if (command.type === 'ready' || command.type === 'rematch') {
    if (member.consentAt === null || member.consentVersion !== CONSENT_VERSION)
      throw new GameError(
        'CONSENT_REQUIRED',
        'Acknowledge audio processing before playing.',
      );
    if (game.rounds.length >= 20)
      throw new GameError('ROOM_LIMIT', 'Create a new room after 20 rounds.');
    member.ready = true;
    if (
      game.members.length === 2 &&
      game.members.every(
        (m) =>
          m.ready &&
          m.consentAt !== null &&
          m.consentVersion === CONSENT_VERSION,
      )
    ) {
      game.rounds.push({
        id: newId,
        scenarioVersion: (game.scenario ?? builtinScenario).key,
        scenario: structuredClone(game.scenario ?? builtinScenario),
        buyerSeat: game.rounds.length % 2,
        state: 'briefing',
        briefEndsAt: now + BRIEF_MS,
        endsAt: now + BRIEF_MS + NEGOTIATION_MS,
        endedAt: null,
        outcome: null,
        proposal: null,
        deal: null,
      });
      for (const m of game.members) m.ready = false;
    }
    return;
  }

  if (!round || round.state !== 'negotiating')
    throw new GameError(
      'NOT_NEGOTIATING',
      'Deals can only change during negotiation.',
    );
  if (command.type === 'propose') {
    const { priceCredits, deliveryDays, exclusive } = command.terms;
    if (
      !Number.isInteger(priceCredits) ||
      priceCredits < 1 ||
      priceCredits > 1000 ||
      !Number.isInteger(deliveryDays) ||
      deliveryDays < 1 ||
      deliveryDays > 7 ||
      typeof exclusive !== 'boolean'
    ) {
      throw new GameError(
        'INVALID_TERMS',
        'Price must be 1–1000 credits and delivery 1–7 whole days.',
        400,
      );
    }
    round.proposal = {
      id: command.proposalId,
      revision: (round.proposal?.revision ?? 0) + 1,
      authorSeat: member.seat,
      terms: { ...command.terms },
      acceptedSeats: [],
    };
    return;
  }

  if (!round.proposal || round.proposal.id !== command.proposalId)
    throw new GameError(
      'STALE_PROPOSAL',
      'The terms changed. Review the current proposal.',
    );
  const definition = round.scenario ?? builtinScenario;
  const role = round.buyerSeat === member.seat ? 'buyer' : 'seller';
  const price = round.proposal.terms.priceCredits;
  if (
    (role === 'buyer' && price > definition.buyer.reservationPrice) ||
    (role === 'seller' && price < definition.seller.reservationPrice)
  )
    throw new GameError(
      'HARD_LIMIT',
      'This price violates your private hard limit.',
    );
  if (!round.proposal.acceptedSeats.includes(member.seat))
    round.proposal.acceptedSeats.push(member.seat);
  if (round.proposal.acceptedSeats.length === 2) {
    round.deal = { ...round.proposal.terms };
    round.state = 'completed';
    round.endedAt = now;
    round.outcome = 'agreement';
  }
}

// Explicit allowlist: internal identities, opposing briefs, and invite hashes never leave the API.
export function snapshot(
  game: Game,
  userId: string,
  roomId: string,
  version: number,
  now: number,
) {
  const self = memberFor(game, userId);
  const round = game.rounds.at(-1);
  const role: Role = round?.buyerSeat === self.seat ? 'buyer' : 'seller';
  const definition = round?.scenario ?? game.scenario ?? builtinScenario;
  const results =
    round?.state === 'completed' ? score(role, round.deal, definition) : null;
  const opponentResults =
    round?.state === 'completed'
      ? score(role === 'buyer' ? 'seller' : 'buyer', round.deal, definition)
      : null;
  return {
    id: roomId,
    version,
    ranked: !!game.ranked,
    serverTime: now,
    scenario: {
      key: definition.key,
      title: definition.title,
      description: definition.description,
      amountLabel: definition.amountLabel,
      source: definition.source,
    },
    members: game.members.map((m) => ({
      seat: m.seat,
      alias: m.alias,
      isYou: m.seat === self.seat,
      ready: m.ready,
      consented: m.consentAt !== null,
    })),
    round: round
      ? {
          id: round.id,
          number: game.rounds.length,
          state: round.state,
          briefEndsAt: round.briefEndsAt,
          endsAt: round.endsAt,
          endedAt: round.endedAt,
          outcome: round.outcome,
          yourRole: role,
          yourBrief: privateBrief(definition, role),
          proposal: round.proposal,
          deal: round.deal,
          results: results
            ? {
                objectives: results,
                total: results.reduce((s, r) => s + r.points, 0),
                opponentTotal: opponentResults!.reduce(
                  (s, r) => s + r.points,
                  0,
                ),
              }
            : null,
        }
      : null,
  };
}

export type RoomSnapshot = ReturnType<typeof snapshot>;
