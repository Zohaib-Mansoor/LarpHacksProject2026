# RoleCall

Two people. Two secret identities. Five minutes to make a deal.

This revision turns the original design preview into a responsive application with a server-authoritative two-person negotiation loop. Blue identifies you; orange identifies your partner. There are no camera tiles, photos, public coaching scores, or invented online counts.

## Run

Requires Node.js 22.19+ or Node.js 24. No dependencies to install.

```sh
cd rolecall
npm start
```

Open http://127.0.0.1:4173. Create a text-practice room and share the invite with a second browser session. Room codes work only against the same server. For different devices, run behind HTTPS with `HOST=0.0.0.0`; invite links must use the externally reachable hostname. `npm run dev` restarts the server on edits, which clears rooms.

```sh
npm run check
npm test
npm run demo:pack
```

The last command creates `artifacts/rolecall-demo.html`, a standalone demo suitable for a CoDev Page. It has sample dialogue, two explicitly simulated confirmations, all 21 deal combinations, evidence-backed sample coaching, mutual goal-reveal controls, and a role swap. It never requests a microphone. It is separate from the live room server.

## What works

- Fictional identities and exactly two participants per friend-invite room.
- 45-second briefing with a single 30-second extension. Both players must be ready.
- Live shared text practice, labelled as typed text. Five-minute negotiation and 45-second confirmation window.
- Authenticated per-player views that return only that participant’s private brief. Peer credentials and private coaching never appear in the view.
- Shared offer revisions, exact integer prices, confirmation by both players, stale revision rejection, and confirmation reset after every edit.
- Deterministic mission arithmetic, no-deal outcome, incomplete-round handling, and 10-minute result expiry.
- Mutual goal reveal, revocable reveal permission, mutual rematch with roles swapped, and local result download.
- Relay-only WebRTC signaling and microphone lifecycle code. The voice UI is disabled without the relay configuration below.
- No browser persistence of transcripts, analytics, external fonts, or recording. The room token is held in sessionStorage for the current browser tab; it never enters invite URLs.

## Voice configuration and remaining service work

Copy `.env.example` to `.env` and supply a real TURN URL, username, credential, operator name, and the operator’s actual retention policy. All five are required before voice rooms unlock. Use short-lived credentials and HTTPS. `RTCPeerConnection` enforces `iceTransportPolicy: 'relay'`; only relay candidates are signalled. `getUserMedia` requests `audio` with `video: false` after the user acknowledges processing and presses Enable microphone.

Real audio across devices has **not** been verified: no TURN service was supplied. There is **no speech transcription, automatic captioning, AI coaching provider, moderation inbox, public matching, or durable storage**. These are explicit unavailable states in the product. Report immediately ends the round but submits no evidence. This is a prototype for friend-invite testing, not a production stranger-call service.

All six subjective criteria in real rooms are unassessed. Missing feedback never blocks the mission result and is not normalized to 100. The authored demo’s six coaching ratings each carry attributed sample speech, timestamps, reasons, and a next-round action. Coaching does not change when users experiment with demo deal terms. On the demo’s Morgan rematch, coaching is unassessed rather than reusing Alex’s private feedback.

The demo fixture is public authored example content loaded only after opening the demo. Production briefs live in `lib/scenario.mjs`; `/lib/` is not served. The original scenario is intentionally the same as the public product plan; do not treat a published fixed scenario as resistant to players researching its objectives.

## CoDev

Target workspace: [Larping](https://www.trycodev.com/gen2/f8dc6024-0e2a-4d85-b783-c97a96716823), repository `Zohaib-Mansoor/LarpHacksProject2026`.

[Open the saved interactive demo](https://www.trycodev.com/gen2/f8dc6024-0e2a-4d85-b783-c97a96716823/pages/af381b2b-acf8-485c-8127-7a32d8bf89d2). It is available to Larping workspace members; the browser must be signed in to CoDev. The room server has also been started in the CoDev worktree on port 3000 and its configuration endpoint responded successfully.

The full application is placed under `rolecall/` in supert33’s own CoDev worktree. It does not alter other members’ worktrees. CoDev live main combines work automatically. Nothing has been marked ready or shipped.

The requested setup was run with `codev setup --agents codex --mirror on --no-browser`. Codex’s CoDev plugin, session context, coordination hooks, and chat mirror are configured. **Open `/hooks` in Codex and review and trust CoDev’s hooks.** Codex does not run untrusted hooks, and changed hooks require another review. This trust step must be completed by the user.

`codev clone` succeeded locally, but the CLI reports that the workspace repository lacks GitHub’s history, so automatic laptop-to-workspace sync cannot link. The app was therefore copied directly to the member’s CoDev worktree using revision-checked file writes. The local source is a reviewable copy; it is not an automatic sync. Continue editing in CoDev, or have the workspace owner reconcile repository history before using `codev link`. Do not overwrite the team’s Git history to force the link.

## Design and verification

The Apple-inspired pass adds grouped selectors, a mobile call dock, a bottom proposal sheet with readable exact terms, and light/dark appearance. The appearance preference is stored locally; transcripts are not. Public reference screenshots were captured and assembled into a sheet; see the [reference ledger](docs/REFERENCES.md).

See [design notes](docs/DESIGN.md), [verification record](docs/VERIFICATION.md), and the [original product and scoring plan](docs/ROLECALL_PLAN.md).

Technical references: [WebRTC relay policy](https://w3c.github.io/webrtc-pc/), [microphone access and secure contexts](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [Node HTTP server](https://nodejs.org/api/http.html).
