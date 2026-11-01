# Frontend API contract

Use credentials: 'include' on fetch. Browsers supply the Origin header; command-line
clients must explicitly send a trusted origin. Do not store session tokens in
localStorage. Use the same hostname for the frontend, API and auth URLs.

## Endpoints

| Method | Path                                               | Purpose                                                               |
| ------ | -------------------------------------------------- | --------------------------------------------------------------------- |
| GET    | /health, /ready                                    | Liveness / DB readiness                                               |
| GET    | /api/config                                        | Availability, consent text and version                                |
| GET    | /api/rubric                                        | Versioned grading rubric and anchors                                  |
| POST   | /api/auth/sign-in/anonymous                        | Guest login; body {}                                                  |
| POST   | /api/auth/sign-in/social                           | Better Auth Google flow, when configured                              |
| POST   | /api/auth/sign-out                                 | Logout; body {}                                                       |
| GET    | /api/me                                            | Authentication status                                                 |
| GET    | /api/me/stats                                      | Private Elo, tier, XP, wins/losses/draws                              |
| GET    | /api/leaderboard                                   | Top 100 ranked handles and positions                                  |
| POST   | /api/rooms                                         | Create room; AI situation when configured; returns room + inviteToken |
| POST   | /api/rooms/join                                    | Body { inviteToken }; returns private snapshot                        |
| GET    | /api/rooms/:roomId                                 | Latest private snapshot                                               |
| POST   | /api/rooms/:roomId/scenario                        | Owner generates a new situation before readying; { expectedVersion }  |
| POST   | /api/rooms/:roomId/commands                        | { expectedVersion, command }; returns snapshot                        |
| WS     | /api/rooms/:roomId/events                          | Receive-only versioned room snapshots                                 |
| GET    | /api/rooms/:roomId/rtc/config?roundId=...          | ICE config, seat, initiator, deadline and server time                 |
| POST   | /api/rooms/:roomId/rtc/signals                     | { roundId, signal }; peer-only SDP/ICE mailbox                        |
| GET    | /api/rooms/:roomId/rtc/signals?roundId=...&after=0 | Peer messages + cursor                                                |
| WS     | /api/rooms/:roomId/transcription?roundId=...       | PCM microphone upload; ElevenLabs transcript events                   |
| GET    | /api/rooms/:roomId/rounds/:roundId/transcript      | Committed transcript segments visible to room members                 |
| GET    | /api/rooms/:roomId/rounds/:roundId/debrief         | Your objective/rating result + asynchronous AI feedback               |
| POST   | /api/rooms/:roomId/audio-token                     | Deprecated; returns 410 DIRECT_CALLS_ONLY                             |
| GET    | /api/openapi.json                                  | Request schemas                                                       |

With OPENAI_API_KEY, creating a room waits for validated AI generation. Failure
returns 502 GENERATION_FAILED; it does not silently substitute a fake AI result.
Without that key, a disclosed built-in practice scenario is available. Generating
a fresh situation later requires the owner, current version, and no ready players.

## Commands

| type    | Fields           | Effect                                                                             |
| ------- | ---------------- | ---------------------------------------------------------------------------------- |
| mode    | ranked: boolean  | Owner chooses before the first round or any readiness                              |
| consent | granted: boolean | Acknowledge current audio/transcription/AI policy; withdrawal ends an active round |
| ready   | none             | Ready for first round                                                              |
| propose | terms            | New immutable revision; resets both confirmations                                  |
| accept  | proposalId: UUID | Explicitly confirm exactly this revision                                           |
| rematch | none             | Ready for next round, roles swapped; both players must acknowledge                 |

terms = { priceCredits: integer 1..1000, deliveryDays: integer 1..7, exclusive: boolean }.
A player cannot accept a price beyond their own disclosed hard limit. Proposals may
cross hard limits so the endpoint cannot reveal the opponent's secret threshold.

Every command includes expectedVersion. On STALE_VERSION, refresh and ask the player
to review changes. Never auto-accept different terms. Game time is determined by
persisted server deadlines. Timestamps are Unix milliseconds.

The snapshot has id, version, ranked, serverTime, scenario public metadata, members,
and round. Members expose seat, alias, isYou, ready and consented. A round exposes
yourRole and yourBrief (jobTitle, character, background, hardLimit, objectives);
proposal, state/deadlines, confirmed deal, and your objective results after completion.
It never includes the opponent's private brief or auth identity.

## Direct-call integration

Import the browser-only helper into the frontend; it does not import scenario code:

```ts
import { startNegotiationCall } from './path/to/backend/client/voice';

const call = await startNegotiationCall({
  baseUrl: 'http://localhost:3001',
  roomId: current.id,
  roundId: current.round.id,
  transcribe: true,
  onRemoteStream: (stream) => {
    audioElement.srcObject = stream;
    void audioElement.play();
  },
  onTranscript: (event) => updateTranscriptUI(event),
  onError: (error) => showCallError(error.message),
});
// When leaving, logging out, or observing a completed snapshot:
call.close();
```

Start only after both people have explicitly consented and the round state is
negotiating. Call this from a user gesture. Use HTTPS in production. Browser
autoplay policies may require a separate play button for the remote audio.

The helper creates RTCPeerConnection, sends microphone audio directly to the peer,
passes SDP/ICE through authenticated HTTP mailboxes, captures a separate 16 kHz
mono PCM16 stream with AudioWorklet, and uploads that copy for transcription.
There is no media mixer or LiveKit/SFU call leg. Default direct-only calls can fail
on restrictive NAT/firewall setups. Enabling configured TURN fallback changes the
network path to relay; the helper rejects selected relay candidates in direct-only mode.

Seat 0 creates an offer. Seat 1 answers. Each signal contains a UUID connectionId,
plus either type + sdp, or type: ice + candidate from RTCIceCandidate.toJSON().
Poll after the returned cursor; messages expire after 30 seconds. Recreate a failed
call with a new connectionId rather than replaying old descriptions. Authorization
is checked against the exact active round on every poll and signal.

The helper stops at the server deadline and when the server stops authorizing
signaling. A direct call cannot be forcibly disconnected by the backend if both
clients are modified to ignore termination. Such clients still cannot extend deal
acceptance or scoring deadlines.

## Speech protocol

Connect with the session cookie and trusted Origin. Exactly one live stream per
round/seat is allowed across API instances. Wait for:

```json
{ "type": "transcription.ready", "sampleRate": 16000, "format": "pcm_s16le" }
```

Then send binary signed 16-bit little-endian, mono PCM at 16000 samples/second.
100 ms = 3200 bytes is recommended. Maximum chunk size is 32000 bytes; audio is
rate-limited to real time with a two-second burst. Text uploads are rejected.
The server authenticates to ElevenLabs; API keys are never sent to browsers.

Responses:

- transcription.partial: interim text for the local player's UI; not persisted.
- transcription.committed: segment { id, seat, text, atMs }; persisted provider text.
- transcription.error: provider failure; never pretend missing speech was transcribed.

Only committed transcripts become grading evidence. Speaker seat comes from the
authenticated session, never a client-selected ID. A reconnect gets a new stream
ID; committed segment source IDs are deduplicated. Server arrival offsets are
approximate. Up to five seconds of provider finalization is accepted after a round
ends; AI evaluation begins after an eight-second grace period.

Both players' transcripts are visible to room members, just as both hear the call.
No raw audio is stored. Text is limited to 600 segments and 60000 characters per
round and expires after seven days. ElevenLabs/OpenAI have their own retention policies.

## Debrief and rankings

Poll the round debrief after completion. Objective results and Elo are committed
immediately and exactly once. The ai object has status pending, processing,
completed, or unavailable, a reason, and your feedback only.

Feedback includes rubricVersion, model, objectivePoints /60, communicationPoints /40,
overall /100, category levels 0..4, explanations, and verified quote/segment evidence.
An AI failure never changes the confirmed deal, mission points, or Elo. Missing or
insufficient speech yields unavailable, not a zero grade. In-flight evaluations
recover after a five-minute lease and retry at most three attempts.

Rooms default to practice. To enable ranking before readiness, the owner sends:
{ expectedVersion, command: { type: 'mode', ranked: true } }.
Each player sees ranked in their snapshot before readying.

Elo starts at 1000 and uses K=32. More objective points wins; equal points draws.
Only ranked rounds affect Elo/win records; all objective points add XP. Public
rankings use generated pseudonyms and public profile UUIDs, never auth IDs or emails.

## Common errors

Application errors use { error: { code, message }, requestId }.
Auth routes use Better Auth's own error format.

- 400: INVALID_REQUEST, INVALID_SIGNAL, DIRECT_ONLY, INVALID_TERMS.
- 401: UNAUTHENTICATED.
- 403: INVALID_ORIGIN, OWNER_REQUIRED.
- 404: NOT_FOUND, NOT_A_MEMBER, INVALID_INVITE.
- 409: STALE_VERSION, STALE_PROPOSAL, ROOM_FULL, NOT_NEGOTIATING,
  CONSENT_REQUIRED, HARD_LIMIT, ROUND_ACTIVE, TRANSCRIPTION_CONNECTED.
- 410: ROOM_EXPIRED, DIRECT_CALLS_ONLY.
- 429: RATE_LIMITED, SOCKET_LIMIT.
- 502: GENERATION_FAILED.
- 503: AI_UNAVAILABLE, TRANSCRIPTION_UNAVAILABLE.

Never put a reusable invite token in logged query strings; share it through a
frontend URL fragment and then send it in the join request body.
