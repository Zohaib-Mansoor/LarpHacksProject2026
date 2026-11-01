# Review log

Cycle 1: user reports excessive text and asks for Wise/Google Meet-inspired composition plus account and ranking routes. Critical acceptance: concise entry, quiet call stage, private progressive disclosure, working server boundaries, and completed GitHub delivery. Pre-code critique and implementation lanes are queued with bounded ownership.

## Cycle 1 — art direction (web-art-director)

**Steering absorbed mid-cycle (from lead):** PlayCall reframed as "Omegle for negotiation" — anonymous strangers, auto-assigned aliases, instant match, absolutely no video, text-first captions/chat, voice UI only when a relay is configured (it is not — never faked), strangers-by-default with friend invites secondary, landing energy "talk to a stranger, close a deal, five minutes, no video, 13+". All four design files were written against this framing.

**Decisions:**
- **Visual concept:** "The Quiet Channel" — a dedicated channel opened for one classified five-minute negotiation; everything is signal (identity, time, deal) or silence (paper). Five frozen signatures: (1) two-channel color logic (blue self / orange partner / neutral ink for shared objects, no third accent); (2) one clock — CountdownRing is the only time authority; (3) dossier texture for private information (classification eyebrows, hairlines, mono figures); (4) the signed deal as an inverted "receipt" panel — the one dark surface in light mode, one light surface in dark mode — reused verbatim on /results; (5) a text-first quiet stage: anonymous identity chips, connection word, conversation feed; Meet-calibrated dock placement. Generic "modern and clean" explicitly rejected.
- **Tokens frozen** in creative-brief.md: full light+dark color sets (including `--self-action` split from `--self` so dark mode keeps accessible buttons), type scale 11→display clamp, 4/8/16/24/48 spacing, radius 8/12/16/20/999, two shadows only (raise/float), motion 0/120/160/230ms with reduced-motion contract, z-layers 0/10/20/30/40/50, breakpoints 320/<768/768–1439/≥1440, 44px targets.
- **Information budgets** set per route (hard word/element ceilings, one job per screen); global rules: one primary per screen, private briefs never on the stage, toasts ≤ 8 words, no two overlays, both players' private info never on one screen.
- **Component tree** defined in component-contracts.md for web/src (page components per route + primitives + call-surface + result components), each with props, token rules, responsive behavior, and the route-matrix states it must render. "Proposed API additions" preserved verbatim; added an art-direction note requesting a matchmaking endpoint and an honest `voice.relayConfigured` capability flag.
- **Route matrix extended:** /signup under-13 refusal made an explicit server-confirmed terminal state; /results sub-matrix covers all outcomes (confirmed, no deal, incomplete, expired, coaching available/unavailable, mutual reveal, rematch + new-stranger); /room split into brief/call phases with a relay-gated voice layer; per-route keyboard/back-forward/overflow table added; 404 and bad-code states added.
- **Honesty rules kept:** no fake online counts, no fake voice UI, no invented coaching; voice surfaces gate on a server-reported relay flag.

**Open questions for the lead:**
- OQ-1: Dark palette values are art-direction proposals; they need verification against real renders (visual-evidence pass) before treating the freeze as locked.
- OQ-2: Room history semantics — I chose phase transitions via history.replaceState (Back during an active call opens the leave-confirmation sheet; Back after finish lands on /results). Confirm or override (sub-routes vs single route).
- OQ-3: Results ephemerality window and rematch/new-match link shapes — server lane to define.
- OQ-4: Does instant match require a full account (current API additions say authenticated session) or will the server lane add a lightweight server-side 13+ guest gate for the Omegle energy? Affects LandingPage CTA and PlayPage copy.
- OQ-5: Match queue mechanics — polling vs push for waiting-for-stranger and cancel states; must stay honest (no counts, no fake "searching" animation beyond a static state).
- OQ-6: Leaderboard opt-in surface — I placed it in /account only (no post-round nudge) to protect the results information budget. Confirm.
- OQ-7: Theme persistence — localStorage key + system default; confirm no cross-device sync is wanted.
- OQ-8: Under-13 refusal retry policy — I designed it as terminal for the submission with one back action; can the form allow honest correction of a mistyped birth date, or does the server lane want lockout semantics?
- OQ-9: 320px identity chips 2-up needs screenshot evidence in visual-evidence.md once web/ exists.

**Scope note:** wrote only inside design\ (creative-brief.md, route-matrix.md, component-contracts.md, review-log.md). No application code written; web/ does not yet exist on this branch.

## Cycle 1 — lead approval and open-question decisions

APPROVED: "The Quiet Channel" concept + frozen tokens + component tree are the design system of record for the React build. Omegle framing locked: anonymous strangers, no video, text-first, 13+.

- OQ-1 dark palette, OQ-9 320px identity chips: deferred to visual review — screenshot evidence required once web/ exists.
- OQ-2 confirmed: replaceState for phase transitions within /room/:code.
- OQ-3: results readable for 10 minutes after round end (prototype semantics). Rematch = same partner, roles swapped, both must request; separate "find a new stranger" action re-queues.
- OQ-4: guests play instantly — POST /api/auth/sign-in/anonymous must require { ageConfirmed: true } (server-enforced attestation; /privacy discloses it is an attestation, not age verification). Full signup keeps the DOB-based 13+ check. Landing CTA "Start negotiating" → /play → (no session: age acknowledgment + guest session) → match.
- OQ-5: matchmaking = server-side FIFO queue; client polls POST /api/match every ~2.5s with jitter; waiting UI shows NO counts ("waiting for a stranger…" only).
- OQ-6 confirmed: leaderboard opt-in only in /account; no post-round nudge.
- OQ-7 confirmed: theme = localStorage + prefers-color-scheme default.
- OQ-8: under-13 on submit = terminal refusal screen; user may go back and correct the DOB before resubmitting; DOB is never retained.
- Lane C scope additions confirmed: matchmaking endpoint + honest voice.relayConfigured flag.

### OQ-4 refinement (lead)
Enforcement point moved: POST /api/auth/sign-in/anonymous stays EXACTLY as the teammate built it (their tests call it bare and must keep passing). Instead Lane B adds POST /api/age-gate { ageConfirmed: true } which marks the current session age-gated (idempotent, server-side). Lane C's POST /api/match REQUIRES an age-gated session and returns 403 otherwise. Friend-invite rooms (existing create/join) stay ungated. /privacy must state the guest gate is a self-attestation, not age verification.
