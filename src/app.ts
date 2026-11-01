import Fastify from "fastify";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyError, FastifyRequest } from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { db as database } from "./db/index.js";
import * as schema from "./db/schema.js";
import { ApiError, roomService } from "./room-service.js";
import { CreatedRoomResponse, JoinRoomBody, MeResponse, RoomParams, RoomResponse } from "../packages/contracts/src/index.js";

export function buildApp(db: typeof database, origin: string, secret: string) {
  const app = Fastify({ bodyLimit: 16_384 }).withTypeProvider<TypeBoxTypeProvider>();
  const auth = betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema }),
    baseURL: origin, secret, trustedOrigins: [origin],
    advanced: { database: { generateId: "uuid" } },
    plugins: [anonymous({ disableDeleteAnonymousUser: true })],
  });
  const service = roomService(db);
  async function requireUser(request: FastifyRequest) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new ApiError(401, "UNAUTHENTICATED", "Sign in as a guest first.");
    return session.user;
  }
  app.addHook("onRequest", async (request, reply) => {
    if (request.url.startsWith("/api/")) reply.header("cache-control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers.origin !== origin) {
      throw new ApiError(403, "FORBIDDEN", "A matching Origin header is required.");
    }
  });
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const status = error instanceof ApiError ? error.statusCode
      : error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    const code = error instanceof ApiError ? error.code : status === 400 ? "INVALID_REQUEST" : "INTERNAL_ERROR";
    return reply.code(status).send({ error: { code, message: status === 500 ? "Internal server error." : error.message, requestId: request.id } });
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: { code: "NOT_FOUND", message: "Route not found.", requestId: request.id } }));
  app.route({ method: ["GET", "POST"], url: "/api/auth/*", async handler(request, reply) {
    const response = await auth.handler(new Request(new URL(request.url, origin), {
      method: request.method, headers: fromNodeHeaders(request.headers),
      ...(request.body ? { body: JSON.stringify(request.body) } : {}),
    }));
    reply.code(response.status);
    response.headers.forEach((value, key) => { if (key !== "set-cookie") reply.header(key, value); });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) reply.header("set-cookie", cookies);
    return reply.send(await response.text());
  }});
  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    try { await db.execute("select 1"); return { status: "ready" }; }
    catch { return reply.code(503).send({ status: "unavailable" }); }
  });
  app.get("/api/me", { schema: { response: { 200: MeResponse } } }, async (request) => {
    const user = await requireUser(request);
    return { userId: user.id, isGuest: user.isAnonymous === true };
  });
  app.post("/api/rooms", { schema: { response: { 201: CreatedRoomResponse } } }, async (request, reply) => {
    const user = await requireUser(request);
    return reply.code(201).send(await service.create(user.id, origin));
  });
  app.post("/api/rooms/join", { schema: { body: JoinRoomBody, response: { 200: RoomResponse } } }, async (request) => {
    const user = await requireUser(request);
    return service.join(user.id, request.body.inviteToken);
  });
  app.get("/api/rooms/:id", { schema: { params: RoomParams, response: { 200: RoomResponse } } }, async (request) => {
    const user = await requireUser(request);
    return { room: await service.snapshot(request.params.id, user.id) };
  });
  return app;
}
