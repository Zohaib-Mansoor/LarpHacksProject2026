import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { db, pool } from "../src/db/index.js";
import { rooms, user } from "../src/db/schema.js";
import type { RoomSnapshot } from "../packages/contracts/src/index.js";

const url = new URL(process.env.DATABASE_URL!);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Tests require a local database");
const origin = "http://localhost:3000";
const app = buildApp(db, origin, "test-only-secret-32-characters-long-do-not-deploy");
const users: string[] = [];
const roomIds: string[] = [];
const headers = (cookie: string) => ({ cookie, origin });

afterAll(async () => {
  try {
    await app.close();
    if (roomIds.length) await db.delete(rooms).where(inArray(rooms.id, roomIds));
    if (users.length) await db.delete(user).where(inArray(user.id, users));
  } finally { await pool.end(); }
});

async function guest() {
  const response = await app.inject({ method: "POST", url: "/api/auth/sign-in/anonymous", headers: { origin }, payload: {} });
  expect(response.statusCode, response.body).toBe(200);
  users.push(response.json<{ user: { id: string } }>().user.id);
  const setCookies = response.headers["set-cookie"];
  const cookie = (Array.isArray(setCookies) ? setCookies : [setCookies]).filter((value): value is string => typeof value === "string")
    .map((value) => value.split(";")[0]).join("; ");
  expect(cookie).not.toBe("");
  return cookie;
}

async function create(cookie: string) {
  const response = await app.inject({ method: "POST", url: "/api/rooms", headers: headers(cookie) });
  expect(response.statusCode, response.body).toBe(201);
  const result = response.json<{ room: RoomSnapshot; inviteUrl: string }>();
  roomIds.push(result.room.id);
  return { ...result, token: new URL(result.inviteUrl).searchParams.get("token")! };
}

describe("guest login and two-player lobby against PostgreSQL", () => {
  it("requires login and matching origins; unknown API routes return JSON", async () => {
    expect((await app.inject({ method: "GET", url: "/api/me" })).statusCode).toBe(401);
    const rejected = await app.inject({ method: "POST", url: "/api/rooms", headers: { origin: "https://attacker.invalid" } });
    expect(rejected.statusCode).toBe(403);
    const missing = await app.inject({ method: "GET", url: "/api/missing" });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers["content-type"]).toContain("application/json");
  });

  it("keeps guest sessions, serializes competing joins, and filters player data", async () => {
    const [owner, challenger, third] = await Promise.all([guest(), guest(), guest()]);
    const me = await app.inject({ method: "GET", url: "/api/me", headers: headers(owner) });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ isGuest: true });
    const created = await create(owner);
    expect(created.room.myRole).toBe("player1");
    const joins = await Promise.all([challenger, third].map((cookie) => app.inject({
      method: "POST", url: "/api/rooms/join", headers: headers(cookie), payload: { inviteToken: created.token },
    })));
    expect(joins.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    const winner = joins[0]!.statusCode === 200 ? challenger : third;
    const outsider = winner === challenger ? third : challenger;
    const joined = joins.find((response) => response.statusCode === 200)!.json<{ room: RoomSnapshot }>();
    expect(joined.room.myRole).toBe("player2");
    expect(joined.room.players).toHaveLength(2);
    expect(Object.keys(joined.room.players[0]!).sort()).toEqual(["alias", "role"]);
    expect(JSON.stringify(joined)).not.toMatch(/inviteCodeHash|ownerId|email|userId|objectives/);
    const retry = await app.inject({ method: "POST", url: "/api/rooms/join", headers: headers(winner), payload: { inviteToken: created.token } });
    expect(retry.statusCode).toBe(200);
    expect(retry.json<{ room: RoomSnapshot }>().room.players).toHaveLength(2);
    expect((await app.inject({ method: "GET", url: `/api/rooms/${created.room.id}`, headers: headers(outsider) })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/rooms/${created.room.id}`, headers: headers(owner) })).statusCode).toBe(200);
    const signedOut = await app.inject({ method: "POST", url: "/api/auth/sign-out", headers: headers(owner), payload: {} });
    expect(signedOut.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/me", headers: headers(owner) })).statusCode).toBe(401);
  });

  it("rejects invalid and expired invites", async () => {
    const cookie = await guest();
    const invalid = await app.inject({ method: "POST", url: "/api/rooms/join", headers: headers(cookie), payload: { inviteToken: "invalid" } });
    expect(invalid.statusCode).toBe(400);
    const unknown = await app.inject({ method: "POST", url: "/api/rooms/join", headers: headers(cookie), payload: { inviteToken: "x".repeat(43) } });
    expect(unknown.statusCode).toBe(404);
    const created = await create(cookie);
    await db.update(rooms).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(rooms.id, created.room.id));
    const expired = await app.inject({ method: "POST", url: "/api/rooms/join", headers: headers(cookie), payload: { inviteToken: created.token } });
    expect(expired.statusCode).toBe(410);
  });
});
