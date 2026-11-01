# PlayCall product pass

Latest user direction: substantially less text, a Wise-inspired landing page, a Google Meet-inspired calling experience, server-assigned roles and negotiation goals, a leaderboard, account page, login restricted to ages 13+, privacy policy and terms. The front end is being rebuilt as a React app (Vite + React + TypeScript) in `web/` on branch `codev/supert33/react`; this brief governs that rebuild. The old `playcall/public` prototype stays as a labelled reference, not the target. Cycle-1 steering from the lead: PlayCall is **Omegle for negotiation** — two anonymous strangers, server-assigned aliases, instant match, absolutely no video. Text-first captions/chat is the conversation surface; voice UI renders only when a relay is actually configured (it is not today — never fake voice UI). Strangers-by-default matching; friend invites stay secondary. Landing energy: talk to a stranger, close a deal, five minutes, no video, 13+.

## Primary job
Get matched with an anonymous stranger, understand a private role and goal, negotiate by text for five minutes, and inspect a mutually confirmed result. Supporting information is disclosed when requested.

## Direction — "The Quiet Channel"

PlayCall looks like a dedicated channel opened for one classified five-minute negotiation. Everything on screen is either **signal** (identity, time, the deal) or **silence** (calm paper). It is a negotiation console, not a marketing site with a chat box attached — and a generic "modern and clean" is explicitly rejected as the concept.

Five signatures make a PlayCall screen recognizable as PlayCall:

1. **Two-channel color logic.** Blue is your channel; warm orange is the partner's channel; anything shared (the proposal, the timer shell, the receipt) is neutral ink on paper. Any screen showing both parties reads as a two-party tension. No third accent color ever competes.
2. **One clock.** The `CountdownRing` is the only time authority: a thin ring, tabular numerals, warming to partner-orange in the final minute. Nothing else blinks, spins, or counts.
3. **Dossier texture.** Private information renders as a dossier — a surface card with a classification eyebrow ("PRIVATE BRIEF — ALEX VEGA"), hairline rules, and mono-spaced figures. Dossiers are disclosed on demand and never stacked onto the stage.
4. **The receipt.** The moment both players accept the same proposal revision, the deal condenses into a dark "signed receipt" panel — the single dark surface in a light app, and the single light surface in a dark app. The same receipt reappears verbatim on `/results`. It is the product's payoff and its most recognizable artifact.
5. **A stage that stays quiet — text-first.** The stage carries only the two anonymous identities (server-assigned aliases with geometric marks — never profiles, photos, or account names), one connection word, the clock, and the conversation feed itself. Text is the default channel; voice controls and tiles render only when a relay is actually configured, never simulated. A compact bottom dock holds controls where thumbs expect them. Everything long-form lives behind drawers.

Reference calibration (principles only — never layouts, copy, or assets): **Wise** — one short confident proposition, generous type, calm minimal composition, ONE primary CTA. **Google Meet** — quiet top bar, large two-person stage geometry, compact bottom dock, controls only where hands expect them (applied to the text stage today; genuine voice only if a relay ever exists). **Apple HIG** — grouped controls, mobile sheets, readable system typography, 44px targets. Mobbin is unavailable (paid) and no Mobbin pattern is claimed.

## Non-negotiables
- Minimal information density: one job per screen; hard budgets in "Information budget per screen" below.
- No cameras, no video of any kind, no fake online counts (never a "strangers online" number), no fake voice UI, no fake scores, no invented live coaching.
- Strangers-by-default matching with server-assigned anonymous aliases; friend invites are a secondary path. Room identity is alias-only — account display names never appear to strangers.
- Voice controls and tiles render only when a voice relay is actually configured; text-first negotiation always works without them.
- Three private mission goals stay server-assigned; only mission points determine standings.
- A collapsible dossier and optional captions/chat keep the stage quiet.
- Both confirmations refer to the same offer revision; edits invalidate acceptance.
- Login and account creation enforce a server-side age gate. A self-declaration is not identity/age verification.
- Public leaderboard participation is opt-in and excludes personal/coaching/transcript data.
- Actual voice requires a configured relay; disclose unavailable infrastructure honestly.
- Preserve teammates' database files and npm commands when integrating main.
- Minimum supported viewport 320px; light + dark appearances; reduced motion supported everywhere.

## Tokens (frozen — cycle 1)

Semantic token names are the contract; raw values appear only in this section. `web/src/styles/tokens.css` defines them as CSS custom properties — light values on `:root`, dark values under `[data-theme="dark"]` (with `prefers-color-scheme` as system default). No component hard-codes a hex.

### Color — light (default)
| Token | Value | Role |
| --- | --- | --- |
| `--page` | `#f6f7fa` | app background |
| `--surface` | `#ffffff` | cards, tiles, sheets, drawers |
| `--ink` | `#15233b` | primary text; receipt panel background |
| `--muted` | `#5c667a` | secondary text |
| `--line` | `#dce1eb` | hairline borders |
| `--line-strong` | `#aeb8ca` | input borders |
| `--self` | `#2456db` | your channel: accents, your markers, links |
| `--self-deep` | `#1e45b0` | your-channel hover/pressed |
| `--self-soft` | `#edf2ff` | your-channel tint, selected states |
| `--self-action` | `#2456db` | primary button background (both appearances use accessible pair below) |
| `--self-action-deep` | `#1e45b0` | primary button hover/pressed |
| `--on-primary` | `#ffffff` | text/graphics on `--self-action` |
| `--partner` | `#aa481c` | partner channel: their markers, urgency numerals |
| `--partner-bright` | `#dc7a43` | partner hairlines and thin markers |
| `--partner-soft` | `#fff0e7` | partner tint |
| `--confirm` | `#236444` | confirmed/ready semantics |
| `--confirm-soft` | `#eaf6ee` | confirmed tint |
| `--danger` | `#b22f3e` | destructive/refusal |
| `--danger-soft` | `#fff1f2` | destructive tint |
| `--focus` | = `--self` | focus ring |
| `--receipt-text` | `#d1daeb` (eyebrow `#c4d3f0`) | text on the ink receipt |

### Color — dark
| Token | Value |
| --- | --- |
| `--page` | `#0d1526` |
| `--surface` | `#17223c` |
| `--ink` | `#e9eef8` |
| `--muted` | `#9aa7bf` |
| `--line` | `#2c3b5a` |
| `--line-strong` | `#4a5d80` |
| `--self` | `#7aa2ff` |
| `--self-deep` | `#9db9ff` |
| `--self-soft` | `#1c2a4a` |
| `--self-action` | `#3b66e0` |
| `--self-action-deep` | `#5a83ea` |
| `--on-primary` | `#ffffff` |
| `--partner` | `#e08a5c` |
| `--partner-bright` | `#eab08c` |
| `--partner-soft` | `#33241a` |
| `--confirm` | `#5cb98c` |
| `--confirm-soft` | `#143024` |
| `--danger` | `#e77a88` |
| `--danger-soft` | `#381d23` |
| `--receipt-text` | ink-mode inversion, see below |

Dark-mode rules: `color-scheme: light dark`. The receipt inverts — in light mode it is `--ink` background with `--receipt-text`; in dark mode it renders on `#f6f7fa` with `#15233b` text (the one light surface). Contrast floors: 4.5:1 for body text, 3:1 for large type and UI edges; channel colors are used for text only at the accessible values above.

### Type
- Family: `system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` — no third-party font requests. Mono (codes, classification eyebrows, tabular labels): `ui-monospace, "Cascadia Mono", "SF Mono", Consolas, monospace`.
- Scale (px / rem @16): micro **11** / 0.6875 (tags) · caption **12** / 0.75 (eyebrows: uppercase, +0.12em tracking, 700) · small **13** / 0.8125 (secondary text, compact chrome) · control **14** / 0.875 (buttons, field labels ≥768) · body **16** / 1 (field input text stays 16px at every width to prevent iOS zoom) · lead **17** / 1.0625 · h3 **19** / 1.1875 · h2 **24** / 1.5 · h1 **32** / 2 · display `clamp(40px, 6vw, 64px)` — landing only.
- Numerals: `font-variant-numeric: tabular-nums` for all time, money, score, and revision figures. Deal price 32 · timer 28 · room code 24 mono with 0.12em tracking.
- Line heights: 1.55 body, 1.12 headings, 1.7 lead. Prose measure ≤ 68ch. Weights 400 / 600 / 700 only.

### Spacing
Base unit 4. Scale: **4** (hairline gaps) · **8** · **16** · **24** · **48** (section rhythm). Page gutters: 16 at 320px, 28 at 768px, 40 at 1440px. Content max-widths: forms 420 · results/legal 720–960 · app shell 1360.

### Radius
control/input **8** · tile/card **12** · panel/drawer **16** · sheet **20** (top corners on mobile bottom sheets) · pill **999** (tags, chips).

### Shadows
Static structure is border-driven — cards carry no shadow. `--shadow-raise: 0 1px 2px rgba(21,35,59,.06)` (hover lift only). `--shadow-float: 0 8px 24px rgba(21,35,59,.14)` (dark: `rgba(0,0,0,.5)`) reserved for floating layers: mobile dock, drawer, sheet, toast. Focus ring: `outline: 3px solid var(--focus); outline-offset: 4px` (2px offset inside the dense dock row).

### Motion
Durations: state swap **0ms** · micro (mute/toggle) **120ms** · control feedback **160ms** · phase change / drawer / sheet arrival **230ms** (opacity 0→1 plus 5px translate). Ease: `cubic-bezier(.2,.8,.2,1)`. Urgency pulse (final minute): 1s opacity pulse — suppressed under reduced motion, where orange numerals and the spoken "1:00" announcement carry urgency instead. `prefers-reduced-motion: reduce` sets all durations to 0 and removes translate; no task ever waits on an animation.

### Z-layers
content **0** · dock **10** · drawer **20** · sheet **30** · toast **40** · skip link **50**. Only one drawer-or-sheet layer open at a time; Escape closes the topmost and returns focus to its trigger.

### Breakpoints & targets
Minimum viewport **320px**. Compact **<768** (single column, fixed bottom dock, bottom sheets). Mid **768–1439** (two-column room grid, centered forms, centered dialogs). Wide **≥1440** (shell max 1360). All interactive targets ≥ 44×44px; primary CTA 46–50px height. Icons 20px (16px small), 1.7 stroke, round caps; avatars are geometric person marks — never photos; the one product illustration (satellite orbit) appears on the landing only.

## Information budget per screen (hard budgets)

One job per screen. A budget is a ceiling, not a target; anything over budget moves into a drawer, a later step, or gets cut. Counts apply to the default (nothing-disclosed) state.

| Route | One job | Hard budget |
| --- | --- | --- |
| `/` | Start | ≤ 60 words in the first viewport: 1 headline (talk to a stranger, close a deal, five minutes, no video), 1 sentence, 1 primary CTA (Start negotiating → /play), ≤ 1 secondary link, ≤ 4 nav items, 13+ notice. No feature grid, no stats, no prose above the fold. |
| `/login` | Return | ≤ 50 words: ≤ 2 fields (email, password) + 1 primary + 1 signup link. Age-gate refusal is a `role="alert"` notice, not a modal. |
| `/signup` | Create account | ≤ 90 words: 5 inputs (display name, email, password, birth date, terms consent) + 1 primary. Under-13 refusal: ≤ 40 words, no account created, one back action only. |
| `/play` | Get matched (friend invite secondary) | ≤ 60 words: guest entry (13+ age acknowledgment — one checkbox + one line, no returnTo for guests), 1 primary match action, ≤ 1 secondary disclosure (invite a friend → room code), ≤ 1 status line. Waiting-for-stranger: ≤ 2 honest lines, no counts (FIFO queue, ~2.5s polling). Private-room waiting: code + copy + ≤ 2 lines. |
| `/room/:code` brief | Learn your identity | Dossier ≤ 140 words: identity line, ≤ 3 background notes, exactly 3 goals × ≤ 14 words. Aside ≤ 60 words. 1 primary action (Ready). |
| `/room/:code` call | Negotiate | Stage = conversation feed + header (clock, connection word, 2 compact identity chips) + collapsed proposal line. Dock ≤ 5 buttons. Dossier drawer closed by default; its header ≤ 1 line. Voice tiles appear only with a configured relay. |
| `/results/:code` | Understand the outcome | Headline ≤ 8 words; receipt ≤ 3 lines; per player 1 score + 3 goal rows; coaching ≤ 1 card or 1 unavailability line; ≤ 1 rematch action. |
| `/leaderboard` | See standings | ≤ 4 columns, ≤ 20 rows, ≤ 1 opt-in notice. Empty state ≤ 25 words. |
| `/account` | Manage account | ≤ 3 groups, ≤ 7 controls. Destructive actions behind a confirm sheet (≤ 30 words). |
| `/privacy`, `/terms` | Understand processing / rules | Prose only: single column ≤ 68ch, h2-deep structure, zero marketing, no cross-links besides each other. |
| 404 / bad room code | Recover | ≤ 20 words + 1 action. |

Global: exactly one primary action per screen; private briefs never render on the stage; toasts ≤ 8 words; never two overlays at once; no screen ever shows both players' private information; server-assigned roles and goals are displayed, never chosen in the UI.
