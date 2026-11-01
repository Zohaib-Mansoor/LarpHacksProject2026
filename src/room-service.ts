import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { db as database } from "./db/index.js";
import { roomMembers, rooms } from "./db/schema.js";
import type { RoomSnapshot } from "../packages/contracts/src/index.js";

export class ApiError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
}
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export function roomService(db: typeof database) {
  async function snapshot(roomId: string, userId: string): Promise<RoomSnapshot> {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
    const members = await db.select().from(roomMembers).where(eq(roomMembers.roomId, roomId)).orderBy(roomMembers.role);
    const me = members.find((member) => member.userId === userId);
    // Do not reveal the existence of rooms to non-members.
    if (!room || !me) throw new ApiError(404, "NOT_FOUND", "Room not found.");
    if (room.expiresAt <= new Date()) throw new ApiError(410, "INVITE_EXPIRED", "Room has expired.");
    // Explicit per-recipient projection: no owner IDs, auth records, or invite hashes.
    return {
      id: room.id, status: room.status, myRole: me.role,
      players: members.map(({ alias, role }) => ({ alias, role })),
      expiresAt: room.expiresAt.toISOString(), serverTime: new Date().toISOString(),
    };
  }
  return {
    snapshot,
    async create(userId: string, origin: string) {
      const token = randomBytes(32).toString("base64url");
      const roomId = await db.transaction(async (tx) => {
        const [room] = await tx.insert(rooms).values({
          ownerId: userId, inviteCodeHash: hash(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        }).returning();
        if (!room) throw new Error("Room insert returned no row");
        await tx.insert(roomMembers).values({ roomId: room.id, userId, alias: "Amber Fox", role: "player1" });
        return room.id;
      });
      return { room: await snapshot(roomId, userId), inviteUrl: `${origin}/join?token=${token}` };
    },
    async join(userId: string, token: string) {
      const roomId = await db.transaction(async (tx) => {
        // All joins for a room serialize here. Seat uniqueness is also enforced by PostgreSQL.
        const [room] = await tx.select().from(rooms).where(eq(rooms.inviteCodeHash, hash(token))).for("update");
        if (!room) throw new ApiError(404, "NOT_FOUND", "Invite not found.");
        if (room.expiresAt <= new Date()) throw new ApiError(410, "INVITE_EXPIRED", "Invite has expired.");
        const members = await tx.select().from(roomMembers).where(eq(roomMembers.roomId, room.id));
        if (members.some((member) => member.userId === userId)) return room.id;
        if (members.length >= 2) throw new ApiError(409, "ROOM_FULL", "Both seats are taken.");
        if (room.status !== "waiting") throw new ApiError(409, "INVALID_PHASE", "Room is no longer accepting players.");
        await tx.insert(roomMembers).values({ roomId: room.id, userId, alias: "Indigo Owl", role: "player2" });
        return room.id;
      });
      return { room: await snapshot(roomId, userId) };
    },
  };
}
