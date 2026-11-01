# Local live QA — November 1, 2026

Tested the running PlayCall UI at http://127.0.0.1:4173/ with browser computer use.
Base branch: akshi/larphacks-project-2026, commit de20fe9.

## Scripted-partner pass

A disposable guest joined through the normal authenticated backend endpoints.
Its messages were prefixed **[QA simulated partner]**. No mock frontend responses,
direct DOM state injection, or production test bypass routes were used.

Verified in the visible UI:

- Room membership changed from 1/2 to 2/2 and enabled readiness.
- Both independent readiness acknowledgements started the real 45-second brief.
- Incoming synthetic chat and an outgoing UI message were stored and displayed.
- One confirmation did not finish the round.
- Editing a proposal cleared both confirmations.
- Both confirmations of revision 2 produced a real confirmed deal at 601 credits,
  three-day delivery, non-exclusive.
- Buyer scored 200/300 and seller 100/300, matching the frozen objective rules.
- Results survived both browser reload and API restart.

The scripted guest signed out and exited after completion. Its labelled test
history remains in the local database for review. It is not running in the app.

## Unsimulated pass and Gemini

- An invalid invite produced a real backend validation error in the UI.
- Gemini generated a validated scene through the backend using
  gemini-3.1-flash-lite. A direct generation check took about two seconds.
- Creating a room through the visible frontend displayed a newly generated scene,
  **The Rare Artifact Negotiation**.
- With no scripted partner, the UI showed 1/2 players and disabled readiness,
  chat, and deal creation as expected.
- The UI explicitly offers built-in practice. AI failures return an error and
  never silently substitute sample content.
- Fixed the misleading "Connected to this room" label to "Joined this room";
  membership does not establish live presence.
- Added a visible generation-in-progress state and restored controls on failure.

Gemini grading was separately exercised against a wholly synthetic eight-segment
conversation. It returned 96.25/100; every evidence quote was verified against the
supplied segment. This is a provider-adapter check, not in-app voice validation.
Conversation grading and audio/transcription remain disabled in the integrated
text mode. No human microphone audio was captured or sent.

## Automated checks and secrets

All 35 tests passed, including the two PostgreSQL concurrency tests using separate,
fresh local test databases. TypeScript, lint, formatting, frontend JavaScript syntax,
and production build checks passed. The running app's database health is ready.

GEMINI_API_KEY is stored only in ignored backend/.env. The actual key is absent
from project changes and is not served to the browser. No credentials are included
in this report. Local screenshots and grading evidence are outside Git under
the user's AppData/Local/PlayCallLocal directory.

Changes from this QA session are local and have not been committed or pushed.
