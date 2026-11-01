import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  bigserial,
  primaryKey,
  uniqueIndex,
  boolean,
} from 'drizzle-orm/pg-core';
import type { Game } from '../game.js';
import type { Feedback } from '../rubric.js';
import { user } from './auth-schema.js';

export * from './auth-schema.js';

// React voice-room compatibility: gameplay is durable; media is never stored here.
export const voiceRooms = pgTable(
  'voice_rooms',
  {
    code: text('code').primaryKey(),
    playerOneId: text('player_one_id')
      .notNull()
      .references(() => user.id),
    playerTwoId: text('player_two_id').references(() => user.id),
    state: jsonb('state').notNull(),
    sparring: boolean('sparring').notNull().default(false),
    queued: boolean('queued').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('voice_rooms_queue_idx').on(t.queued, t.createdAt),
    check(
      'voice_rooms_distinct_users',
      sql`${t.playerTwoId} is null or ${t.playerOneId} <> ${t.playerTwoId}`,
    ),
  ],
);

export const voiceResults = pgTable(
  'voice_results',
  {
    code: text('code')
      .notNull()
      .references(() => voiceRooms.code),
    round: integer('round').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    points: integer('points').notNull(),
    confirmed: boolean('confirmed').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    callsign: text('callsign'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.code, t.round, t.userId] }),
    index('voice_results_user_idx').on(t.userId),
  ],
);

export const userSettings = pgTable(
  'user_settings',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull().default('Negotiator'),
    theme: text('theme')
      .$type<'system' | 'light' | 'dark'>()
      .notNull()
      .default('system'),
    captions: boolean('captions').notNull().default(true),
    reducedMotion: boolean('reduced_motion').notNull().default(false),
    leaderboardOptIn: boolean('leaderboard_opt_in').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'user_settings_theme',
      sql`${t.theme} in ('system', 'light', 'dark')`,
    ),
  ],
);

export const rooms = pgTable(
  'game_rooms',
  {
    id: uuid('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id),
    inviteHash: text('invite_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    wakeAt: timestamp('wake_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    game: jsonb('game').$type<Game>().notNull(),
  },
  (t) => [
    index('game_rooms_owner_idx').on(t.ownerId),
    index('game_rooms_wake_idx').on(t.wakeAt),
    index('game_rooms_expiry_idx').on(t.expiresAt),
    check('game_rooms_positive_version', sql`${t.version} > 0`),
    check(
      'game_rooms_capacity',
      sql`jsonb_array_length(${t.game}->'members') between 1 and 2`,
    ),
  ],
);

export const roomMessages = pgTable(
  'room_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    roundId: uuid('round_id').notNull(),
    seat: integer('seat').notNull(),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('room_messages_room_idx').on(t.roomId, t.id),
    check('room_messages_seat', sql`${t.seat} in (0, 1)`),
    check('room_messages_length', sql`length(${t.text}) between 1 and 1000`),
  ],
);

export const mediaCleanupJobs = pgTable(
  'media_cleanup_jobs',
  {
    roundId: uuid('round_id').primaryKey(),
    roomName: text('room_name').notNull(),
    // Repeat deletion until every issued 60-second token has expired, including self-hosted LiveKit.
    closeUntil: timestamp('close_until', { withTimezone: true }).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('media_cleanup_due_idx').on(t.nextAttemptAt)],
);

export const playerStats = pgTable(
  'player_stats',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id),
    publicId: uuid('public_id').notNull().unique(),
    handle: text('handle').notNull(),
    rating: integer('rating').notNull().default(1000),
    rankedPlayed: integer('ranked_played').notNull().default(0),
    totalRounds: integer('total_rounds').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    xp: integer('xp').notNull().default(0),
  },
  (t) => [index('player_stats_rating_idx').on(t.rating)],
);

export type SettledPlayer = {
  seat: number;
  points: number;
  before: number;
  after: number;
};
export const roundResults = pgTable('round_results', {
  roundId: uuid('round_id').primaryKey(),
  roomId: uuid('room_id')
    .notNull()
    .references(() => rooms.id),
  ranked: integer('ranked').notNull(),
  players: jsonb('players').$type<SettledPlayer[]>().notNull(),
  settledAt: timestamp('settled_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const transcriptSegments = pgTable(
  'transcript_segments',
  {
    id: uuid('id').primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    roundId: uuid('round_id').notNull(),
    seat: integer('seat').notNull(),
    sourceId: text('source_id').notNull(),
    text: text('text').notNull(),
    atMs: integer('at_ms').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('transcript_source_idx').on(t.roundId, t.seat, t.sourceId),
    index('transcript_round_idx').on(t.roundId, t.atMs),
    index('transcript_expiry_idx').on(t.expiresAt),
    check('transcript_seat', sql`${t.seat} in (0, 1)`),
  ],
);

export const evaluations = pgTable('round_evaluations', {
  roundId: uuid('round_id').primaryKey(),
  roomId: uuid('room_id')
    .notNull()
    .references(() => rooms.id),
  status: text('status')
    .notNull()
    .$type<'pending' | 'processing' | 'completed' | 'unavailable'>(),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
  feedback: jsonb('feedback').$type<{ seat: number; feedback: Feedback }[]>(),
  reason: text('reason'),
  expiresAt: timestamp('expires_at', { withTimezone: true })
    .notNull()
    .default(sql`now() + interval '7 days'`),
});

export const transcriptionLeases = pgTable(
  'transcription_leases',
  {
    roundId: uuid('round_id').notNull(),
    seat: integer('seat').notNull(),
    streamId: uuid('stream_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.roundId, t.seat] })],
);

export const rtcSignals = pgTable(
  'rtc_signals',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    roundId: uuid('round_id').notNull(),
    fromSeat: integer('from_seat').notNull(),
    payload: jsonb('payload')
      .$type<{
        type: 'offer' | 'answer' | 'ice';
        connectionId: string;
        sdp?: string;
        candidate?: unknown;
      }>()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('rtc_round_idx').on(t.roundId, t.id),
    index('rtc_expiry_idx').on(t.expiresAt),
  ],
);
