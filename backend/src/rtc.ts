import { createHmac, randomUUID } from 'node:crypto';
import { and, eq, gt, ne } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db/client.js';
import type { Config } from './config.js';
import { rtcSignals } from './db/schema.js';
import { GameError } from './game.js';
import type { GameStore } from './store.js';

const connectionId = z.string().uuid();
export const Signal = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('offer'),
      connectionId,
      sdp: z.string().min(1).max(12000),
    })
    .strict(),
  z
    .object({
      type: z.literal('answer'),
      connectionId,
      sdp: z.string().min(1).max(12000),
    })
    .strict(),
  z
    .object({
      type: z.literal('ice'),
      connectionId,
      candidate: z
        .object({
          candidate: z.string().max(2000),
          sdpMid: z.string().max(100).nullable().optional(),
          sdpMLineIndex: z.number().int().min(0).max(100).nullable().optional(),
          usernameFragment: z.string().max(256).nullable().optional(),
        })
        .strict(),
    })
    .strict(),
]);

export class RtcService {
  constructor(
    private db: Database,
    private store: GameStore,
    private config: Config,
    private clock: () => number,
  ) {}

  private async active(userId: string, roomId: string, roundId: string) {
    const room = await this.store.read(userId, roomId);
    if (room.round?.id !== roundId || room.round.state !== 'negotiating')
      throw new GameError(
        'NOT_NEGOTIATING',
        'The call belongs to an active negotiation round.',
      );
    return room;
  }

  async configuration(userId: string, roomId: string, roundId: string) {
    const room = await this.active(userId, roomId, roundId);
    const seat = room.members.find((m) => m.isYou)!.seat;
    const rtc = this.config.rtc;
    const iceServers: {
      urls: string | string[];
      username?: string;
      credential?: string;
    }[] = [];
    if (rtc?.stunUrls.length) iceServers.push({ urls: rtc.stunUrls });
    if (rtc?.allowRelay && rtc.turnUrl && rtc.turnSecret) {
      const username = `${Math.floor(this.clock() / 1000) + 600}:${randomUUID()}`;
      iceServers.push({
        urls: rtc.turnUrl,
        username,
        credential: createHmac('sha1', rtc.turnSecret)
          .update(username)
          .digest('base64'),
      });
    }
    return {
      roundId,
      seat,
      initiator: seat === 0,
      directOnly: !rtc?.allowRelay,
      iceServers,
      serverTime: room.serverTime,
      roundEndsAt: room.round!.endsAt,
    };
  }

  async send(userId: string, roomId: string, roundId: string, raw: unknown) {
    const parsed = Signal.safeParse(raw);
    if (!parsed.success)
      throw new GameError(
        'INVALID_SIGNAL',
        'Invalid WebRTC signaling message.',
        400,
      );
    const room = await this.active(userId, roomId, roundId);
    const fromSeat = room.members.find((m) => m.isYou)!.seat;
    if (
      (parsed.data.type === 'offer' && fromSeat !== 0) ||
      (parsed.data.type === 'answer' && fromSeat !== 1)
    )
      throw new GameError(
        'INVALID_SIGNAL',
        'Only seat zero offers and seat one answers.',
        400,
      );
    if (
      parsed.data.type === 'ice' &&
      !this.config.rtc?.allowRelay &&
      / typ relay(?: |$)/.test(parsed.data.candidate.candidate)
    )
      throw new GameError('DIRECT_ONLY', 'Relay candidates are disabled.', 400);
    await this.db.insert(rtcSignals).values({
      roomId,
      roundId,
      fromSeat,
      payload: parsed.data,
      expiresAt: new Date(this.clock() + 30_000),
    });
    return { accepted: true };
  }

  async receive(
    userId: string,
    roomId: string,
    roundId: string,
    after: number,
  ) {
    const room = await this.active(userId, roomId, roundId);
    const seat = room.members.find((m) => m.isYou)!.seat;
    const messages = await this.db
      .select({ id: rtcSignals.id, payload: rtcSignals.payload })
      .from(rtcSignals)
      .where(
        and(
          eq(rtcSignals.roomId, roomId),
          eq(rtcSignals.roundId, roundId),
          ne(rtcSignals.fromSeat, seat),
          gt(rtcSignals.id, after),
          gt(rtcSignals.expiresAt, new Date(this.clock())),
        ),
      )
      .orderBy(rtcSignals.id)
      .limit(100);
    return { messages, cursor: messages.at(-1)?.id ?? after };
  }
}
