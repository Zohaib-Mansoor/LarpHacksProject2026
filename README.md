# LarpHacksProject2026
Zohaib, Shubhang, Akshit

## RoleCall backend

Two players, secret identities, and a negotiation to close. The current backend
supports guest sessions and private invite lobbies with two seats.

- [Database setup and migrations](docs/DATABASE.md)
- [Guest login, lobby API, and local running instructions](docs/LOBBY.md)

```powershell
npm ci
# Set up .env and PostgreSQL using the guides above first.
npm run db:migrate
npm run api:dev
```

Checks: `npm run db:typecheck`, `npm run api:typecheck`, and `npm run api:test`.
The API tests require local PostgreSQL. Gameplay and frontend integration are
still in progress.
