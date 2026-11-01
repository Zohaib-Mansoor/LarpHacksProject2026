import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { account, session, user, verification } from "./auth-schema.js";

export * from "./auth-schema.js";

export const roomStatus = pgEnum("room_status", ["waiting", "active", "finished"]);
export const memberRole = pgEnum("member_role", ["player1", "player2"]);
export const roundPhase = pgEnum("round_phase", ["negotiating", "voting", "confirmed"]);

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
export type ProposalTerms = { [key: string]: JsonValue };

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  inviteCodeHash: text("invite_code_hash").notNull(),
  ownerId: uuid("owner_id").notNull().references(() => user.id),
  status: roomStatus("status").notNull().default("waiting"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("rooms_invite_code_hash_idx").on(table.inviteCodeHash)]);

export const roomMembers = pgTable("room_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => user.id),
  alias: text("alias").notNull(),
  role: memberRole("role").notNull(),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("room_members_room_role_unique").on(table.roomId, table.role),
  unique("room_members_room_user_unique").on(table.roomId, table.userId),
  index("room_members_user_id_idx").on(table.userId),
]);

export const rounds = pgTable("rounds", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  scenarioKey: text("scenario_key").notNull(),
  phase: roundPhase("phase").notNull().default("negotiating"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("rounds_room_id_unique").on(table.roomId),
  check("rounds_version_positive", sql`${table.version} > 0`),
]);

// Updates are rejected by the immutable_proposals SQL migration.
export const proposals = pgTable("proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  roundId: uuid("round_id").notNull().references(() => rounds.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  terms: jsonb("terms").$type<ProposalTerms>().notNull(),
  createdBy: uuid("created_by").notNull().references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("proposals_round_revision_unique").on(table.roundId, table.revision),
  index("proposals_round_revision_desc_idx").on(table.roundId, table.revision.desc()),
  check("proposals_revision_positive", sql`${table.revision} > 0`),
]);

export const acceptances = pgTable("acceptances", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposalId: uuid("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("acceptances_proposal_user_unique").on(table.proposalId, table.userId),
  index("acceptances_proposal_id_idx").on(table.proposalId),
]);

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;
export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type RoomMember = typeof roomMembers.$inferSelect;
export type NewRoomMember = typeof roomMembers.$inferInsert;
export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
export type Proposal = typeof proposals.$inferSelect;
export type NewProposal = typeof proposals.$inferInsert;
export type Acceptance = typeof acceptances.$inferSelect;
export type NewAcceptance = typeof acceptances.$inferInsert;
