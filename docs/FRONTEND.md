# Imported PlayCall prototype

**Updated:** the default frontend is now connected to PostgreSQL through Fastify.
Follow [INTEGRATION.md](INTEGRATION.md). Root `start`/`dev` run the integrated app;
`npm run frontend:prototype` runs the preserved original in-memory server.
The historical import details below describe that original prototype only.

Imported `playcall/` from GitHub branch `codev/supert33/work`, commit `0df1a9b`.
The teammate's source is preserved. Root backend files and configuration remain
in place.

```powershell
npm --prefix playcall install --ignore-scripts
npm start
```

Open http://127.0.0.1:4173/ and choose text practice, or explore the authored demo.
Use a second browser session and the invite link to try a two-player room.

This is the teammate's existing JavaScript prototype, with its own in-memory
game server. It is not yet connected to our Fastify/Better Auth/PostgreSQL API
on port 3000. Restarting the prototype clears its rooms. React/Vite integration
remains future work; this import does not replace that selected stack.

Voice and transcription are disabled in the local configuration. No audio or
LLM services have been configured.

Checks: `npm run check` and `npm test` (root commands target `playcall`).
