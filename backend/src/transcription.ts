import { randomUUID } from 'node:crypto';
import { and, eq, lte, sql } from 'drizzle-orm';
import { WebSocket } from 'ws';
import type { Database } from './db/client.js';
import { rooms, transcriptionLeases, transcriptSegments } from './db/schema.js';
import { CONSENT_VERSION, GameError, memberFor } from './game.js';

export type SpeechEvent =
  | { type: 'ready' }
  | { type: 'partial' | 'committed'; text: string }
  | { type: 'error' };
export interface SpeechStream {
  send(pcm: Buffer): void;
  finish(): void;
  close(): void;
}
export type SpeechProvider = (
  onEvent: (event: SpeechEvent) => void,
) => SpeechStream;

export function elevenLabsProvider(apiKey: string): SpeechProvider {
  return (onEvent) => {
    const upstream = new WebSocket(
      'wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_16000&commit_strategy=vad&include_timestamps=false',
      {
        headers: { 'xi-api-key': apiKey },
        maxPayload: 64_000,
        handshakeTimeout: 10_000,
      },
    );
    upstream.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString()) as {
          message_type?: string;
          text?: string;
        };
        if (data.message_type === 'session_started') onEvent({ type: 'ready' });
        else if (
          data.message_type === 'partial_transcript' ||
          data.message_type === 'committed_transcript'
        ) {
          if (typeof data.text !== 'string' || data.text.length > 4000) {
            onEvent({ type: 'error' });
            return;
          }
          if (data.text.trim())
            onEvent({
              type:
                data.message_type === 'partial_transcript'
                  ? 'partial'
                  : 'committed',
              text: data.text,
            });
        } else if (
          data.message_type?.includes('error') ||
          ['rate_limited', 'quota_exceeded', 'auth_error'].includes(
            data.message_type ?? '',
          )
        )
          onEvent({ type: 'error' });
      } catch {
        onEvent({ type: 'error' });
      }
    });
    upstream.on('error', () => onEvent({ type: 'error' }));
    upstream.on('close', () => onEvent({ type: 'error' }));
    return {
      send(pcm) {
        if (
          upstream.readyState !== WebSocket.OPEN ||
          upstream.bufferedAmount > 128_000
        )
          throw new Error('Speech provider is unavailable or too slow.');
        upstream.send(
          JSON.stringify({
            message_type: 'input_audio_chunk',
            audio_base_64: pcm.toString('base64'),
            sample_rate: 16000,
          }),
        );
      },
      finish() {
        if (upstream.readyState === WebSocket.OPEN)
          upstream.send(
            JSON.stringify({
              message_type: 'input_audio_chunk',
              audio_base_64: '',
              sample_rate: 16000,
              commit: true,
            }),
          );
      },
      close() {
        upstream.terminate();
      },
    };
  };
}

export class TranscriptStore {
  constructor(
    private db: Database,
    private clock: () => number,
  ) {}

  async claim(roundId: string, seat: number) {
    const streamId = randomUUID();
    const result = await this.db
      .insert(transcriptionLeases)
      .values({
        roundId,
        seat,
        streamId,
        expiresAt: new Date(this.clock() + 15_000),
      })
      .onConflictDoUpdate({
        target: [transcriptionLeases.roundId, transcriptionLeases.seat],
        set: { streamId, expiresAt: new Date(this.clock() + 15_000) },
        setWhere: lte(transcriptionLeases.expiresAt, new Date(this.clock())),
      })
      .returning();
    if (!result.length)
      throw new GameError(
        'TRANSCRIPTION_CONNECTED',
        'This player already has a transcription stream.',
      );
    return streamId;
  }

  async renew(roundId: string, seat: number, streamId: string) {
    const result = await this.db
      .update(transcriptionLeases)
      .set({ expiresAt: new Date(this.clock() + 15_000) })
      .where(
        and(
          eq(transcriptionLeases.roundId, roundId),
          eq(transcriptionLeases.seat, seat),
          eq(transcriptionLeases.streamId, streamId),
        ),
      )
      .returning();
    return result.length > 0;
  }

  async release(roundId: string, seat: number, streamId: string) {
    await this.db
      .delete(transcriptionLeases)
      .where(
        and(
          eq(transcriptionLeases.roundId, roundId),
          eq(transcriptionLeases.seat, seat),
          eq(transcriptionLeases.streamId, streamId),
        ),
      );
  }

  async append(
    userId: string,
    roomId: string,
    roundId: string,
    sourceId: string,
    text: string,
  ) {
    if (!text.trim() || text.length > 4000)
      throw new GameError(
        'INVALID_TRANSCRIPT',
        'Invalid transcript segment.',
        400,
      );
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(rooms)
        .where(eq(rooms.id, roomId))
        .for('update');
      if (!row) throw new GameError('NOT_FOUND', 'Room not found.', 404);
      const member = memberFor(row.game, userId);
      const round = row.game.rounds.find((r) => r.id === roundId);
      const now = this.clock();
      if (
        !round ||
        now < round.briefEndsAt ||
        (round.state === 'completed' && now > round.endedAt! + 5_000) ||
        now > round.endsAt + 5_000 ||
        row.game.members.some(
          (m) => m.consentAt === null || m.consentVersion !== CONSENT_VERSION,
        )
      )
        throw new GameError(
          'TRANSCRIPTION_CLOSED',
          'This round no longer accepts speech.',
        );
      const [usage] = await tx
        .select({
          count: sql<number>`count(*)::int`,
          characters: sql<number>`coalesce(sum(length(${transcriptSegments.text})), 0)::int`,
        })
        .from(transcriptSegments)
        .where(eq(transcriptSegments.roundId, roundId));
      if (
        (usage?.count ?? 0) >= 600 ||
        (usage?.characters ?? 0) + text.length > 60_000
      )
        throw new GameError('TRANSCRIPT_LIMIT', 'Round transcript is full.');
      const [segment] = await tx
        .insert(transcriptSegments)
        .values({
          id: randomUUID(),
          roomId,
          roundId,
          seat: member.seat,
          sourceId,
          text,
          atMs: Math.min(
            Math.max(0, now - round.briefEndsAt),
            round.endsAt - round.briefEndsAt,
          ),
          expiresAt: new Date(now + 7 * 24 * 60 * 60_000),
        })
        .onConflictDoNothing()
        .returning({
          id: transcriptSegments.id,
          seat: transcriptSegments.seat,
          text: transcriptSegments.text,
          atMs: transcriptSegments.atMs,
        });
      return segment ?? null;
    });
  }
}
