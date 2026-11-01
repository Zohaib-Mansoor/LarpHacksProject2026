# Component contracts and ownership

- Root orchestrator: Git/CoDev integration, reference captures, shared design approval, live-room integration, review evidence and final publishing.
- Frontend React lane: `web/` (Vite + React + TypeScript). Owns `web/src` presentation, navigation, forms, and the component tree below. Coordinate with the server lane through the API contract below; do not edit scoring rules. The old `playcall/public` prototype stays as a labelled, read-only reference — do not port its markup wholesale; port its calibrated patterns.
- Server/account lane: `playcall/server.mjs` (or successor), account/auth module, matchmaking, and account tests. Preserve existing room APIs and privacy. Do not edit teammate database schema/migrations. Reuse Better Auth where feasible; clearly disclose a development-only fallback if used.
- Legal/settings content is delivered as compact frontend routes with truthful server behavior, not a consent modal full of prose.

## Rules that apply to every component

- Tokens only: components consume the semantic custom properties frozen in `design/creative-brief.md` (exposed by `web/src/styles/tokens.css`). No hex literals, px font sizes outside the type scale, or ad-hoc z-index values inside components.
- Channel color comes only from a `role: "self" | "partner"` prop — never from a color prop.
- All interactive targets ≥ 44×44px; focus ring `3px solid var(--focus)` always visible; keyboard parity is mandatory (see route matrix).
- All user-entered and peer-provided text is escaped and rendered as text, never as markup.
- Voice: no component may render voice controls or voice tiles unless the server reports a configured relay. Text-first always.
- Exactly one `variant="primary"` Button per screen; overlays respect the z-layers (dock 10 · drawer 20 · sheet 30 · toast 40); one drawer-or-sheet open at a time.
- Reduced motion: every animated component degrades to an instant, non-translating state; `prefers-reduced-motion` handled globally in `tokens.css`.
- Responsive contract for every component: must pass 320, 768, and 1440px (compact <768 single-column; mid 768–1439; wide ≥1440, shell max 1360).

## React component tree (web/src)

```
AppRoot
├─ ThemeProvider · SessionProvider · ToastProvider
├─ AppShell (SkipLink, TopBar, Outlet)
│  ├─ LandingPage            /            → MatchCTA, HowItWorksLine, DemoTag
│  ├─ LoginPage              /login
│  ├─ SignupPage             /signup
│  ├─ PlayPage               /play        → AgeGateSheet (guests), MatchPanel, InvitePanel(folded), WaitingPanel
│  ├─ RoomPage               /room/:code  (renders RoomHeader; TopBar hidden)
│  │  ├─ BriefPhase          → DossierPanel, ReadinessList, RoomCodeField (invite rooms)
│  │  └─ CallPhase           → Stage(IdentityChip×2 | VoiceTile×2, CountdownRing,
│  │                           ConnectionBadge, CaptionFeed), Dock,
│  │                           DossierDrawer→DossierPanel, ProposalSheet,
│  │                           LeaveSheet, ReportSheet
│  ├─ ResultsPage            /results/:code → DealReceipt, GoalList, ScoreTrack,
│  │                                        CoachingCard, RematchPanel
│  ├─ LeaderboardPage        /leaderboard  → LeaderboardTable, OptInNotice
│  ├─ AccountPage            /account      → ProfileGroup, PrivacyGroup, DangerGroup
│  ├─ LegalPage              /privacy /terms → LegalDocument
│  └─ NotFoundPage           *
└─ ToastLayer
```

## Primitives

### Button
Purpose: the only trigger chrome; variants encode the one-primary rule.
```ts
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "soft" | "quiet" | "danger" | "outline-danger"; // default "secondary"
  size?: "sm" | "md" | "lg";        // min-height 44 / 46 / 50
  loading?: boolean;                // inline spinner, stable width, aria-busy
  pressed?: boolean;                // aria-pressed, for dock/drawer toggles
  icon?: React.ReactNode;           // 20px stroke icon, left slot
  full?: boolean;                   // block width — default true <768 in forms
}
```
Tokens: primary `--self-action`/`--on-primary`, hover `--self-action-deep`; soft `--self-soft`+`--self-deep`; danger `--danger`/`--danger-soft`; radius 8; 160ms color/bg transition; no shadows.
Responsive: label 14px ≥768, 13px <768; `full` below 768 in forms.
States: every pending/submit state in the matrix; dock toggles via `pressed`; under-13 refusal "back" action.

### TextField
Purpose: single-line input with label, error, hint. Never floating labels.
```ts
interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;      // renders inline, linked via aria-describedby; field tinted --danger-soft
  hint?: string;
  mono?: boolean;      // room codes: mono stack, 24px, 0.12em tracking, uppercase transform
}
```
Tokens: 16px text at all widths (iOS zoom), min-height 48, border 1px `--line-strong`, radius 8, focus ring; label 600 weight.
Responsive: full width; forms max 420.
States: empty, per-field signup errors, join-code validation, login invalid credentials.

### CheckboxField
Purpose: consent and opt-in toggles (terms, age declaration, leaderboard opt-in).
```ts
interface CheckboxFieldProps { label: React.ReactNode; checked: boolean; onChange(v: boolean): void; error?: string; }
```
Tokens: 18px box, accent `--self`, 44px touch target via padding, small label text.
States: signup consent missing; account opt-in toggle.

### SegmentedControl
Purpose: two-mode choice rendered as a radiogroup (match vs invite; proposal package pick).
```ts
interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string; description?: string }[];
  value: T; onChange(v: T): void; ariaLabel: string;
}
```
Tokens: selected = `--self` border + `--self-soft` bg + 1px ring; unselected `--line`/`--surface`; 44px min.
Responsive: options stack <768 (and at 320 for three-option proposal picks).
States: /play mode choice; proposal package selection (3 options).

### Sheet
Purpose: the single overlay primitive for modal tasks — center dialog ≥768, bottom sheet <768. ProposalSheet and ModalConfirm compose it.
```ts
interface SheetProps { open: boolean; onClose(): void; title: string; children: React.ReactNode; footer?: React.ReactNode; initialFocus?: "first" | "confirm"; }
```
Tokens: `--surface`, radius 20 (top corners <768) / 16 (centered), `--shadow-float`, z 30, max-width 520, max-height 85dvh with internal scroll.
Behavior: focus trap, Escape closes, focus returns to trigger; aria-modal.
States: proposal, leave/report confirms, delete-account, all route "pending decision" modals.

### Drawer
Purpose: slide-over panel for long-form disclosure on the call surface (dossier).
```ts
interface DrawerProps { open: boolean; onClose(): void; side: "left" | "right"; title: string; children: React.ReactNode; }
```
Tokens: `--surface`, radius 16, `--shadow-float`, z 20; 400px wide ≥768; full-height overlay <768.
Behavior: same focus contract as Sheet; only one drawer at a time.
States: dossier drawer open/closed (call phase).

### ModalConfirm
Purpose: destructive/irreversible confirmations, composed from Sheet.
```ts
interface ModalConfirmProps { open: boolean; title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm(): void; onCancel(): void; }
```
Budget: ≤ 30 words body. States: leave call, report, logout, delete account, abandon match request.

### AgeGateSheet
Purpose: the guest 13+ attestation — the only step between a stranger and the match queue. Enforcement lives server-side (POST /api/age-gate marks the session age-gated, idempotent; POST /api/match requires it and returns 403 otherwise). Never shown to signed-in or already age-gated sessions.
```ts
interface AgeGateSheetProps { open: boolean; onConfirm(): void; }  // POST /api/age-gate { ageConfirmed: true }
```
Tokens: composed on Sheet; one CheckboxField ("I'm 13 or older"), one line linking /terms and /privacy; body ≤ 30 words; /privacy states this is a self-attestation, not age verification.
Responsive: standard Sheet behavior (bottom <768, centered ≥768).
States: guest first entry on /play; 403 from /api/match re-opens it with role="alert".

### Notice
Purpose: inline status/error banners. Kinds: `info | self | partner | confirm | danger` mapping to soft tokens.
```ts
interface NoticeProps { kind: "info" | "self" | "partner" | "confirm" | "danger"; children: React.ReactNode; role?: "alert" | "status"; }
```
Budget: ≤ 2 lines. States: age-gate refusal (role="alert"), relay-unavailable, server errors, connection changes.

### EmptyState
Purpose: honest absence — never a fake filler.
```ts
interface EmptyStateProps { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode; }
```
Budget: ≤ 25 words + 1 action. States: leaderboard empty, bad/expired room code, expired results, coaching unavailable, waiting-for-stranger (with cancel action).

### Toast · ToastProvider
```ts
function useToast(): { push(text: string, kind?: "info" | "error"): void; }
```
Budget: ≤ 8 words, 4s auto-dismiss, z 40, `aria-live="polite"`. No toast stacks.

### Tag
Purpose: pill chips — role tags, DEMO, TEXT PRACTICE, REVISION N.
```ts
interface TagProps { tone?: "neutral" | "self" | "partner" | "confirm" | "danger"; children: React.ReactNode; }
```
Tokens: pill 999, micro 11px, soft backgrounds.

### AvatarMark
Purpose: geometric person mark for a player identity — never photos, never initials of real names.
```ts
interface AvatarMarkProps { role: "self" | "partner"; size?: "sm" | "md" | "lg"; muted?: boolean; }
```
Tokens: channel colors via role (self `--self` on `--self-soft`; partner `--partner` on `--partner-soft`).

### IdentityChip
Purpose: compact on-stage identity — auto-assigned alias + character name + channel edge. The default stage identity for text-first rooms.
```ts
interface IdentityChipProps { alias: string; characterName: string; role: "self" | "partner"; you?: boolean; }
```
Tokens: 3px channel top-edge, `--surface`, names truncate with ellipsis + full value in `title`/aria-label.
Responsive: 2-up row at 320; larger pair ≥768.

### RoomCodeField
Purpose: display + copy a room code/invite URL (invite rooms only).
```ts
interface RoomCodeFieldProps { code: string; inviteUrl?: string; onCopy?(): void; }
```
Tokens: mono 24px, 0.12em tracking, dashed `--line-strong` border box.
States: /play private-room waiting; brief phase invite rooms.

### ConnectionBadge
Purpose: one honest connection word + dot.
```ts
interface ConnectionBadgeProps { state: "connecting" | "text" | "relay" | "unavailable" | "partner-left"; }
```
Tokens: confirm/info/danger tones; no spinner animation under reduced motion.
States: whole call-phase connection set in the route matrix.

## Call-surface components

### Stage
Purpose: the quiet two-person surface — text-first. Composes identity row, clock, connection word, conversation feed, and (relay rooms only) voice tiles.
```ts
interface StageProps { children: React.ReactNode; phase: "brief" | "call"; }
```
Tokens: `--page` background (quiet); children on `--surface`.
Responsive: <768 identity chips 2-up compact, feed fills remaining height (100dvh minus header/dock); ≥768 chips enlarge left/right of a centered feed; ≥1440 feed max 720 centered.
States: brief/call phases; text-only default; relay-configured variant adds VoiceTiles.

### VoiceTile
Purpose: a participant's voice presence — **renders only when the server reports a configured relay; never fake**.
```ts
interface VoiceTileProps { alias: string; role: "self" | "partner"; muted: boolean; speaking?: boolean; level?: number; }
```
Tokens: 3px channel top border; AvatarMark; muted icon `--muted`; speaking = soft channel ring pulse (static indicator + text under reduced motion).
States: relay connected, self/partner muted, speaking indicators, relay-unavailable (tile degrades to IdentityChip).

### CountdownRing
Purpose: the one clock.
```ts
interface CountdownRingProps { remainingSec: number; totalSec: number; urgentAtSec?: number; label: string; }
```
Tokens: track `--line`, progress `--self`, tabular 28px; at urgency numerals turn `--partner`; ring pulse suppressed under reduced motion.
Behavior: not focusable; `aria-live="polite"` announcements at 1:00 and 0:10.
States: 45s brief countdown; 5:00 call; final-minute urgency; zero.

### Dock
Purpose: compact control bar where thumbs expect it — fixed bottom <768, inline under the stage ≥768.
```ts
interface DockProps { controls: React.ReactNode; }  // composed of Buttons with pressed/icon
```
Standard dock ≤ 5 buttons: dossier toggle · proposal toggle · report (inside leave sheet) · leave · voice join (**only when a relay is configured**).
Tokens: `--surface`, top hairline `--line`, mobile `--shadow-float`, safe-area-inset padding, z 10, 44px targets, icon + micro labels (icon + aria-label at 320).
States: each toggle's open/closed pressed state; leave confirm handoff.

### CaptionFeed
Purpose: the conversation surface — live captions and/or chat between the two strangers; system lines for proposal events.
```ts
interface CaptionFeedProps {
  messages: { id: string; from: "self" | "partner" | "system"; text: string; at: string }[];
  compose?: { onSend(text: string): void; placeholder: string };  // text rooms
}
```
Tokens: sender label in channel color (color + name, never color alone); system lines `--muted`; measure ≤ 68ch; feed background `--surface`.
Behavior: auto-scroll unless the user scrolled up; new-message affordance; `aria-live="polite"` for the latest message.
Responsive: fills stage at <768; compose bar is a 44px input + send above the dock.
States: text-only default; relay rooms (captions if a transcription provider exists — otherwise absent, never faked); proposal revision system lines.

### ProposalSheet
Purpose: draft, revise, and accept the shared deal; the revision-safe acceptance contract.
```ts
interface ProposalSheetProps {
  proposal: { revision: number; priceMillions: number; packageId: "proto6" | "proto8" | "demo6proto8";
              selfAccepted: boolean; partnerAccepted: boolean } | null;
  canEdit: boolean;
  onEditPrice(price: number): void;      // $4.50–6.00 in $0.25 steps (SegmentedControl/stepper)
  onEditPackage(pkg: string): void;
  onAccept(): void;
}
```
Tokens: composed on Sheet; exact terms in words + tabular figures; REVISION N tag; two confirmation chips (SELF `--self` / PARTNER `--partner`); explicit standing line: "Editing any term publishes a new revision and clears both acceptances."
States: none → draft → proposed → awaiting partner → accepted-by-me → changed revision (both cleared) → both accepted; read-only on results.

### DossierPanel
Purpose: the private brief card — server-assigned identity, background, exactly 3 goals.
```ts
interface DossierPanelProps {
  brief: { characterName: string; employer: string; background: { label: string; text: string }[];
           goals: { text: string; points: number }[] };   // goals.length === 3
  dense?: boolean;   // drawer variant
}
```
Tokens: dossier texture — classification eyebrow (PRIVATE BRIEF — NAME, 12px mono/uppercase), hairline `--line` rules, `--surface`, radius 16; goal numbers mono.
Budget: ≤ 140 words. States: brief phase (inline), call phase (in Drawer).

### ReadinessList
Purpose: both-ready checklist + the single Ready action.
```ts
interface ReadinessListProps { selfReady: boolean; partnerReady: boolean; onReady(): void; }
```
States: brief phase readiness, partner-left-during-brief.

## Result components

### DealReceipt
Purpose: the signed deal as the recognizable dark receipt (inverted in dark mode).
```ts
interface DealReceiptProps { deal: { priceMillions: number; packageLabel: string; revision: number; confirmedAt: string }; }
```
Tokens: light mode `--ink` bg + `--receipt-text`; dark mode `#f6f7fa` bg + `#15233b`; eyebrow "SIGNED AGREEMENT — REVISION N"; price mono 32 (≥24 at 320).
States: confirmed outcome; reused verbatim from the call's both-accepted state.

### GoalList · GoalRow · ScoreTrack
```ts
interface GoalRowProps { goal: { label: string; achieved: boolean; points: number; rule: string }; role: "self" | "partner"; }
interface ScoreTrackProps { score: number; max: 60; role: "self" | "partner"; }  // fixed 3 cells
```
Tokens: channel-colored score numerals (35px tabular); achieved cell filled channel color; arithmetic line 12px `--muted`.
States: confirmed arithmetic; no-deal (all empty, zero stated plainly); incomplete.

### CoachingCard
Purpose: private, evidence-attributed coaching — or one honest unavailability line.
```ts
interface CoachingCardProps { coaching: { items: { quote: string; explanation: string }[] } | "unavailable"; }
```
States: unavailable (EmptyState ≤ 25 words); available (each item shows quoted transcript evidence + explanation).

### RematchPanel
Purpose: rematch (role swap) and next-stranger actions.
```ts
interface RematchPanelProps { state: "none" | "requested" | "mutual" | "declined" | "expired"; onRematch(): void; onNextStranger(): void; }
```
States: the full rematch/next-match set in the results sub-matrix.

## Page components (route → states → composition)

| Page | Route | Must render (from route-matrix) | Composition |
| --- | --- | --- | --- |
| LandingPage | `/` | guest, signed-in, 320, dark, noscript, 13+ notice | TopBar hero: headline + 1 sentence + primary (Start negotiating → /play) + demo tag |
| LoginPage | `/login` | empty, pending, invalid credentials, age-gate refused, provider unavailable, server error, returnTo | TextField ×2, Button primary, Notice |
| SignupPage | `/signup` | per-field errors, under-13 refusal, consent missing, duplicate email, weak password, invalid birth date, success | TextField ×4, CheckboxField, Notice(role=alert) |
| PlayPage | `/play` | guest entry (age acknowledgment → instant play, no returnTo), signed-in entry, 403 not-age-gated, match requested, waiting-for-stranger (FIFO, ~2.5s polling with jitter, no counts), matched, invite create/join + code validation (ungated), waiting-for-invited, relay notice | AgeGateSheet (guests only), MatchPanel (primary), InvitePanel (folded secondary), WaitingPanel (EmptyState + cancel; polls POST /api/match every ~2.5s with jitter) |
| RoomPage | `/room/:code` | full room sub-matrix (entry errors, brief, text-first call, relay layer, proposal revisions, timeout, leave/report) | RoomHeader, DossierPanel, ReadinessList, Stage, CaptionFeed, Dock, Drawer, ProposalSheet, ModalConfirm |
| ResultsPage | `/results/:code` | confirmed, no deal, incomplete, expired, coaching available/unavailable, mutual reveal, rematch/next-stranger | DealReceipt, GoalList, ScoreTrack, CoachingCard, RematchPanel |
| LeaderboardPage | `/leaderboard` | empty, ranked, opted-out user, unavailable, guest | LeaderboardTable, OptInNotice, EmptyState |
| AccountPage | `/account` | signed-in, guest redirect, profile update, opt-in toggle, logout, delete confirm/done | Grouped fieldsets, CheckboxField, ModalConfirm |
| LegalPage | `/privacy` `/terms` | full prose, anchors, direct nav | LegalDocument (≤ 68ch prose) |
| NotFoundPage | `*` | 404, bad room code | EmptyState |

## Proposed API additions
GET /api/session -> {user:null|{id,displayName,email,leaderboardOptIn},...}
POST /api/auth/signup -> {email,password,displayName,birthDate,acceptTerms}; enforce 13+ on server, do not retain DOB.
POST /api/auth/login -> {email,password,ageConfirmed:true}; secure HttpOnly session cookie.
POST /api/auth/logout; PATCH /api/account; DELETE /api/account.
GET /api/leaderboard -> {entries:[{displayName,missionPoints,rounds,wins}],userRank:null|number} from confirmed real rounds only; opt-in.
Room creation/join requires authenticated eligible session; include user ownership in the server-side room player, never in peer-visible private data. Keep tokens out of invitation URLs.

Agents must agree actual response shapes in messages before integration. All user text is escaped. Unsupported providers return an explicit state. Tests cover meaningful server-side security/age/access behavior rather than CSS details.

Art-direction note for the server lane (cycle 1, updated per lead decisions): matchmaking is `POST /api/match` on a server-side FIFO queue — the client polls every ~2.5s with jitter, and it must require an age-gated session (403 otherwise). `POST /api/age-gate { ageConfirmed: true }` marks the session age-gated (idempotent) and is the enforcement point — the teammate's `POST /api/auth/sign-in/anonymous` stays exactly as built, and friend-invite create/join stays ungated. Results remain readable for 10 minutes after round end; rematch = same partner, roles swapped, both must request, with a separate re-queue action. An honest `voice: {relayConfigured: boolean}` capability flag in the session/room payload lets the UI gate every voice surface. Room payloads must expose only the viewer's own brief and the partner's alias/character — never the partner's goals or account identity. /privacy must state the guest gate is a self-attestation, not age verification.
