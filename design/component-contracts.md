# Component contracts and ownership

- Root orchestrator: Git/CoDev integration, reference captures, shared design approval, live-room integration, review evidence and final publishing.
- Frontend foundation/public lane: playcall/public/index.html, style.css, refinement.css, app.js and new frontend modules. Own presentation, navigation and forms. Coordinate with server lane through the API contract below; do not edit lib/game.mjs scoring rules.
- Server/account lane: playcall/server.mjs, new account/auth module and account tests. Preserve existing room APIs and privacy. Do not edit teammate database schema/migrations. Reuse Better Auth where feasible; clearly disclose a development-only fallback if used.
- Legal/settings content is delivered as compact frontend routes with truthful server behavior, not a consent modal full of prose.

## Proposed API additions
GET /api/session -> {user:null|{id,displayName,email,leaderboardOptIn},...}
POST /api/auth/signup -> {email,password,displayName,birthDate,acceptTerms}; enforce 13+ on server, do not retain DOB.
POST /api/auth/login -> {email,password,ageConfirmed:true}; secure HttpOnly session cookie.
POST /api/auth/logout; PATCH /api/account; DELETE /api/account.
GET /api/leaderboard -> {entries:[{displayName,missionPoints,rounds,wins}],userRank:null|number} from confirmed real rounds only; opt-in.
Room creation/join requires authenticated eligible session; include user ownership in the server-side room player, never in peer-visible private data. Keep tokens out of invitation URLs.

Agents must agree actual response shapes in messages before integration. All user text is escaped. Unsupported providers return an explicit state. Tests cover meaningful server-side security/age/access behavior rather than CSS details.
