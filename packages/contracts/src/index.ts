import { Type, type Static } from "@sinclair/typebox";

const uuid = Type.String({ format: "uuid" });
export const RoomParams = Type.Object({ id: uuid }, { additionalProperties: false });
export const JoinRoomBody = Type.Object({
  inviteToken: Type.String({ pattern: "^[A-Za-z0-9_-]{43}$" }),
}, { additionalProperties: false });
export type JoinRoomInput = Static<typeof JoinRoomBody>;

export const RoomView = Type.Object({
  id: uuid,
  status: Type.Union([Type.Literal("waiting"), Type.Literal("active"), Type.Literal("finished")]),
  myRole: Type.Union([Type.Literal("player1"), Type.Literal("player2")]),
  players: Type.Array(Type.Object({
    alias: Type.String(),
    role: Type.Union([Type.Literal("player1"), Type.Literal("player2")]),
  }, { additionalProperties: false }), { maxItems: 2 }),
  expiresAt: Type.String(),
  serverTime: Type.String(),
}, { additionalProperties: false });
export type RoomSnapshot = Static<typeof RoomView>;
export const RoomResponse = Type.Object({ room: RoomView }, { additionalProperties: false });
export const CreatedRoomResponse = Type.Object({ room: RoomView, inviteUrl: Type.String() }, { additionalProperties: false });
export const MeResponse = Type.Object({ userId: uuid, isGuest: Type.Boolean() }, { additionalProperties: false });
