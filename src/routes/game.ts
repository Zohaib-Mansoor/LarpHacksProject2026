// Lane C owns this file: FIFO matchmaking (/api/match, 2.5s polling, age-gate enforced),
// private briefs with server-assigned roles/goals, proposals + same-revision acceptances,
// debrief/results (10-minute window), rematch (same partner, swapped roles) + re-queue.
// Port game rules from playcall/lib (scoring semantics unchanged). Do NOT edit src/app.ts.
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { db as database } from "../db/index.js";
import type { RouteUser } from "./auth.js";

export interface GameRouteOptions {
  db: typeof database;
  origin: string;
  auth: ReturnType<typeof import("better-auth").betterAuth<any>>;
  requireUser: (request: FastifyRequest) => Promise<RouteUser>;
  roomService: ReturnType<typeof import("../room-service.js").roomService>;
}

export const gameRoutes: FastifyPluginAsync<GameRouteOptions> = async (app, opts) => {
  // TODO(Lane C): implement /api/match, briefs, proposals, acceptances, debrief here.
  void app; void opts;
};
