// Lane B owns this file: signup/login (13+ DOB gate), POST /api/age-gate attestation
// (in-memory per-session store — no teammate schema/migration edits; disclosed in /privacy),
// account, leaderboard. Shapes per design/component-contracts.md "Proposed API additions"
// and design/review-log.md lead decisions. Do NOT edit src/app.ts — your context is injected.
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { db as database } from "../db/index.js";

export interface RouteUser { id: string; isAnonymous?: boolean | null; email?: string | null; name?: string | null; }
export interface AuthRouteOptions {
  db: typeof database;
  origin: string;
  auth: ReturnType<typeof import("better-auth").betterAuth>;
  requireUser: (request: FastifyRequest) => Promise<RouteUser>;
}

export const authRoutes: FastifyPluginAsync<AuthRouteOptions> = async (app, opts) => {
  // TODO(Lane B): implement /api/age-gate, /api/auth/signup, /api/auth/login,
  // /api/auth/logout, /api/session, /api/account, /api/leaderboard here.
  void app; void opts;
};
