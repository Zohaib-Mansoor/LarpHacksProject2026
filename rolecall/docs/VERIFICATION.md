# Verification record

November 1, 2026.

## Automated checks

`npm run check`: syntax validation for server, application, and game modules.

`npm test`: 13 passing Node tests, reproduced on Windows (Node 22.19) and inside the Larping CoDev worktree (Node 24.22). The score test checks all 21 legal agreements against a separately enumerated expected-outcome table. Additional tests cover invalid terms, authenticated private views, stale confirmations, edit resets, mutual/revocable goal reveal, no deal, leave/report, role swaps, consent, voice gating, two-player limit, typed attribution, recovery budget, timeout, result expiry, security headers, forbidden static paths, origin rejection, and the full HTTP agreement flow.

The first sandboxed HTTP run could not connect to its localhost test server. The same suite passed outside the sandbox; no test was disabled or changed to bypass that restriction.

## Browser verification

Browser exercise through the in-app browser:

- Real friend room in two separate browser tabs: missing consent refused, invite code accepted, Alex and Morgan received different dossiers, both-ready started the five-minute clock, typed messages appeared under the correct name, a local draft survived the partner sending a message, and the mutually confirmed $5.00M staged deal reached the 40/60 versus 60/60 debrief. Real coaching remained unassessed.
- Sample flow: one signature stayed pending, editing the price cleared it, both accepted the current revision, evidence opened all six ratings, a quote opened its transcript context, goal reveal waited for both simulated permissions, and a mutually accepted rematch gave the player Morgan’s different brief.
- Lobby, room, and debrief measured at 320, 390, 768, and 1280 pixels without document overflow. Mobile proposal measured at 320 pixels, including its own scroll width. The exact-terms summary wrapped to show the complete delivery requirement when the native select was truncated.
- Light and dark screens visually inspected. Saved desktop and phone screenshots show the call dock, proposal sheet, mission arithmetic, and reference source pages. A native dialog supplies Escape dismissal and focus containment. CSS removes nonessential motion under reduced-motion preferences; no runtime reduced-motion emulation was available in this browser API.
- No browser console errors or warnings in the final exercised flow. No real microphone, camera, speech provider, or AI provider was accessed.

Do not interpret these browser and syntax checks as real-audio verification, user preference validation, or a measured frame-rate claim.

## Unverified integrations

- Real media across two devices and relay infrastructure: no TURN credentials provided.
- Transcription, speaker attribution of speech, AI evaluation, provider retention, moderation, public matching, and production hosting: not implemented.
- CoDev hooks: installed/configured; execution requires the user’s `/hooks` trust review.
- Automatic local file sync: blocked by the existing CoDev/GitHub history mismatch; source is written directly to the CoDev worktree.

The Node server is single-process and in-memory. Restarting or running multiple independent replicas cannot preserve or share rooms. Use one instance for the friend-invite prototype. Production deployment needs shared room storage, operational controls, and verified service integrations.
