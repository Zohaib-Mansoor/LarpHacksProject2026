# PlayCall

**Two strangers. Two secret identities. Five minutes to make a deal.**

PlayCall is a camera-free roleplay negotiation game. Two people receive different fictional identities and private objectives, discover what matters to each other, and try to agree on a price and delivery package. The debrief shows exactly which goals the signed agreement achieved.

## The round

1. Join a private friend-invite room with a fictional identity and acknowledge processing.
2. Read your private brief for 45 seconds: your employer, background, connections, and three secret objectives.
3. Negotiate for five minutes. Your brief and the shared conversation remain accessible.
4. Both accept the same proposal revision. Changing any term clears both confirmations.
5. Inspect the agreed deal, objective arithmetic, and private coaching when reliable transcript evidence is available.
6. Mutually request a rematch to swap roles.

## One scenario: The Satellite Deal

Alex Vega, an aerospace engineer at Aster Aerospace, wants a strong price and time to finish a satellite prototype. Morgan Reed, a client at Meridian Ventures, needs something to show investors by month six. A demonstration at month six with a full prototype at month eight creates a useful compromise if the players discover the distinction.

Allowed prices are $4.50M through $6.00M in $0.25M increments. The three packages are a full prototype at month six, a full prototype at month eight, or a demonstration at six followed by the full prototype at eight.

## Scoring

Only three deterministic mission goals, worth 20 points each, decide the competitive result. A goal requires a valid agreement confirmed by both players. No deal awards zero mission points; an interrupted round has no winner.

The personal rubric has 100 possible points: mission objectives 60, character consistency 10, use of background 10, and clarity, listening, reasoning/trade-offs, and closing/declining at 5 each. Subjective coaching stays private, requires attributed transcript evidence and an explanation, and never changes the competitive result. Unclear or missing evidence is unassessed. Accents, pitch, and speaking longer earn no points.

For a confirmed $5.00M staged-delivery deal, Alex scores 40/60 and Morgan scores 60/60. Each point follows a predefined rule rather than an AI decision.

## Interface and privacy

Two compact participant panels sit beside the conversation, with a private expandable dossier and shared proposal controls. Blue identifies you; orange identifies the other player. Mobile uses a bottom call dock and proposal sheet. Light and dark appearances are available.

The app uses fictional details and never requests a camera. Voices and voluntarily shared information may still identify people. Real audio must use relay-only routing; microphone capture requires an explicit acknowledgement and browser permission. Call recording, transcription, and provider retention must be disclosed accurately rather than implied by a demo.

## Implemented prototype

The included Node application implements two-person friend-invite text rooms, private assigned briefs, readiness, timed rounds, shared proposals, revision-safe acceptance, deterministic scoring, mutual goal reveal, role-swap rematches, and ephemeral results. It includes relay-only WebRTC code, but real audio needs a configured TURN service and cross-device verification.

The standalone demo uses clearly labelled sample dialogue and sample coaching. There is no transcription or AI coaching provider in live rooms, so real subjective scores remain unassessed. Report ends the call but this prototype has no moderation inbox. Random matching is a later milestone.

See [the full product plan](playcall/docs/PLAYCALL_PLAN.md), [the implementation guide](playcall/README.md), and [the verification record](playcall/docs/VERIFICATION.md).
