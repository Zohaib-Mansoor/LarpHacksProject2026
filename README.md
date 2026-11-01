# LarpHacksProject2026

Zohaib, Shubhang, Akshit

## PlayCall

**Merged React voice app: [setup, APIs, matchmaking, and tests](docs/VOICE_INTEGRATION.md).**

The default app is now the React frontend from `supert33/realtime-vc`, connected
to the PostgreSQL backend from `codex/backend`. It supports invite rooms, durable
FIFO matchmaking, scripted solo practice, realtime voice, and saved results.
The text-only integration described below remains available as a separate API.

Two players, secret identities, and five minutes to make a deal. The frontend uses
the GitHub backend and PostgreSQL: accounts, settings, text rooms, proposals,
confirmed deals, results, and history persist across restarts.

**[Setup and API reference](docs/INTEGRATION.md)**

**[Deploy the frontend and backend together on Render](docs/RENDER.md)**

[Detailed API README](backend/API_README.md) · [Live local OpenAPI](http://127.0.0.1:4173/api/openapi.json)

```powershell
npm --prefix backend ci
npm --prefix web ci
# Create backend/.env and an empty database using the guide above.
npm run db:migrate
npm run build
npm start
```

Open http://127.0.0.1:4173/. Create a room, share the invite, and play in two
independent browser sessions. React voice rooms use WebRTC with SSE signaling
and a transient PCM fallback. Optional Gemini scene generation in the separate structured API uses a server-only
`GEMINI_API_KEY`; the UI also offers explicitly labelled built-in practice.

Checks: `npm run check`, `npm test`, `npm run build`. Browser flow:
`npm --prefix backend run test:browser` against a running local app.

The React Satellite Deal uses three 20-point goals (60 maximum). The separate
structured scenario API retains its three 100-point goals (300 maximum).

The earlier five-table database and lobby code remain under `src/` and `drizzle/`
for reference. They are not used by the integrated app. Do not apply both sets of
migrations to one database. `backend/` is the canonical backend.
