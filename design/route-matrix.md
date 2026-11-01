# Route and state matrix

Every route must be verifiable at 320 / 768 / 1440px, in light and dark, keyboard-only, and via direct URL entry. "Overflow" means the long-value set — 32-char display names, full-width captions, $6.00M figures, 6-character room codes, 3-digit scores — never causes horizontal scrolling or clipped actions.

| Route | Task | Required states |
| --- | --- | --- |
| `/` | Understand and start | guest, signed-in, narrow (320), dark, JS-off noscript message, 13+ eligibility notice |
| `/login` | Sign in | empty, pending, invalid credentials, age-gate refused (13+), provider unavailable, server error, success → returnTo |
| `/signup` | Create account | empty, per-field errors, **under-13 refusal (server-confirmed, terminal for that submission)**, consent missing, duplicate email, weak password, invalid birth date, pending, success |
| `/play` | Get matched (strangers) or invite a friend | guest entry (no session: 13+ age acknowledgment → `POST /api/age-gate` → instant play; **no returnTo for guests**; DOB-based 13+ check happens only at full `/signup`), signed-in entry (acknowledgment skipped), match requested → waiting-for-stranger (server FIFO queue; client polls `POST /api/match` every ~2.5s with jitter; **no counts**; 403 not-age-gated → re-show age acknowledgment), matched → room, friend-invite path (create private room / join code validation: bad format / unknown / expired / full; stays ungated per existing semantics), waiting for invited partner, relay-unavailable notice (text-first), direct nav after room finished |
| `/room/:code` | Prepare and call | see room sub-matrix |
| `/results/:code` | Inspect outcome | see results sub-matrix |
| `/leaderboard` | See opt-in mission standings | empty, ranked users, opted-out current user, unavailable, guest view |
| `/account` | Manage account | signed-in, guest redirect, profile update pending/saved/error, ranking opt-in toggle, logout, delete confirmation, delete done |
| `/privacy` | Understand processing | full prose, direct nav, in-page anchors, guest age-gate disclosure (self-attestation, not age verification) |
| `/terms` | Understand rules | full prose, direct nav, 13+ eligibility section |
| `*` | Recover | 404; unknown room code via direct URL |

## `/room/:code` sub-matrix

**Entry:** session required (account or age-gated guest) · invalid code · expired room · room full · not-a-member.
**Brief phase:** server-assigned anonymous alias + brief (identity + exactly 3 goals) · 45s brief countdown · ready toggle (self / partner) · both-ready → call · partner left during brief · leave.
**Call phase (text-first — the conversation feed is the stage surface, never a drawer):** feed live · connecting · partner left mid-round → incomplete + offer of a new match · dossier drawer open/closed · proposal states: none → draft → proposed (rev N) → awaiting partner → accepted-by-me → **term changed (rev N+1, both confirmations cleared)** → both-accepted (confirmed) · 5:00 timeout → auto-finish · disconnect / rejoin · leave (confirm sheet) · report (ends call; honest "no moderation inbox yet" note).
**Voice layer (renders only when a relay is actually configured — otherwise absent entirely):** voice join opt-in · relay-only connected · relay unavailable (honest notice; text continues) · muted/unmuted (self) · partner muted · speaking indicators.
**Keyboard:** skip link → room header → drawer toggles → dock → proposal. Escape closes the topmost drawer/sheet. The timer is not focusable; it announces at 1:00 and 0:10 (`aria-live="polite"`). Proposal steppers use arrow keys.
**Back/forward:** phase transitions replace history, so browser Back during an active call opens the leave-confirmation sheet; after finish, Back lands on `/results/:code`. Direct nav to an invalid/expired code shows the bad-code EmptyState (see open question OQ-2 in the review log).
**Overflow:** at 320px the two identity chips (or voice tiles, relay-configured rooms only) render 2-up compact; long character names truncate with ellipsis plus full name in `title`/aria-label; dock labels collapse to icon + aria-label; captions wrap, never scroll horizontally.

## `/results/:code` sub-matrix

**Outcomes:** confirmed (receipt + goal arithmetic) · no deal (zero mission points, stated plainly) · incomplete (timeout / disconnect / single acceptance — no winner) · expired ephemeral result — **results are readable for 10 minutes after round end**, then the honest unavailable state.
**Coaching:** unavailable (default; one line) vs available (only with attributed transcript evidence; always private).
**Mutual reveal:** own goals always visible; partner goals only in the mutual-reveal state (both players opened results); a pending-partner state otherwise.
**Rematch / next match:** rematch = **same partner, roles swapped, both must request**: none · requested-by-me · mutually requested → new room link · declined/expired. Plus a separate re-queue action ("find a new stranger") returning to `/play`.
**Keyboard:** receipt → scores → coaching → rematch in reading order; no focus traps; rematch is a button, not a link-styled paragraph.
**Back/forward:** direct nav works while the ephemeral result exists; afterwards the expired state. Back to a finished room shows the finished-room state, never a dead call UI.
**Overflow:** score tracks are a fixed 3 cells; goal labels wrap to 2 lines max; the receipt price never drops below 24px.

## Keyboard / history / overflow per route

| Route | Keyboard | Back/forward & direct nav | Overflow at 320 |
| --- | --- | --- | --- |
| `/` | Skip link first; hero art `aria-hidden`; Enter on the single primary starts the guest flow | Free; query params none | Headline wraps via clamp; CTA full-width |
| `/login` | Enter submits; error focus moves to the alert notice; field errors via `aria-describedby` | Preserves `returnTo` | Fields full-width; notice wraps |
| `/signup` | Enter submits; under-13 refusal announces via `role="alert"`; consent checkbox is a labelled 44px target | Success → returnTo or `/play` | 5 fields stack; refusal ≤ 40 words |
| `/play` | Guest age acknowledgment is a labelled checkbox + primary; a 403 from `/api/match` re-opens it with `role="alert"`; match action is the single primary; friend invite is a secondary disclosure; join code auto-formats (uppercase, mono) | Guests land on `/play` directly (no returnTo); Back from waiting-for-stranger cancels the match request honestly (no penalty messaging) | Primary CTA full-width; waiting state ≤ 2 lines; code 24px mono fits |
| `/room/:code` | See room sub-matrix | See room sub-matrix | See room sub-matrix |
| `/results/:code` | See results sub-matrix | See results sub-matrix | See results sub-matrix |
| `/leaderboard` | Table semantics (`<table>` with `<th scope>`); no sort controls in v1 | Free; guest view allowed | Table becomes stacked cards <768 |
| `/account` | Grouped fieldsets; toggles announce; delete is a two-step confirm sheet | Guest → `/login?returnTo=/account` | Groups stack; destructive action at bottom, not adjacent to Save |
| `/privacy`, `/terms` | Anchor links jump with visible focus | Free | Prose ≤ 68ch; no sidebar |
| `*` | One action focused on mount | Free | ≤ 20 words |

Global keyboard contract: 3px focus ring always visible · Escape closes the topmost overlay and restores focus to its trigger · Enter submits forms · arrow keys drive segmented controls and steppers · no hover-only affordances · `aria-live` regions for toasts, timer announcements, and connection changes · all user-entered text is escaped and never trusted as markup.

Existing authored demo remains clearly labelled. Planned routes are not claimed to exist before implementation.
