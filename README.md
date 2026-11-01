# LarpHacksProject2026

Zohaib, Shubhang, Akshit

## PlayCall

Two players, secret identities, and five minutes to make a deal. The frontend uses
the GitHub backend and PostgreSQL: accounts, settings, text rooms, proposals,
confirmed deals, results, and history persist across restarts.

**[Setup and API reference](docs/INTEGRATION.md)**

```powershell
npm --prefix backend ci
# Create backend/.env and an empty database using the guide above.
npm run db:migrate
npm run build
npm start
```

Open http://127.0.0.1:4173/. Create a room, share the invite, and play in two
independent browser sessions. Default mode uses text and polling; no audio, LLMs,
WebSockets, or workers are running.

Checks: `npm run check`, `npm test`, `npm run build`. Browser flow:
`npm --prefix backend run test:browser` against a running local app.

The imported backend's mission scale is three objectives worth 100 points each
(300 maximum). The original satellite sample at `/?demo=1` is separate illustrative
content, with its original 60-point rubric.

The earlier five-table database and lobby code remain under `src/` and `drizzle/`
for reference. They are not used by the integrated app. Do not apply both sets of
migrations to one database. `backend/` is the canonical backend.
