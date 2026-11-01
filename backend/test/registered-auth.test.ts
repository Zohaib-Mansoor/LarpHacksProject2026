import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { buildDemoApp } from '../src/demo-app.js';
import type { Database } from '../src/db/client.js';
import * as schema from '../src/db/schema.js';
const origin = 'http://127.0.0.1:4173';
const pg = new PGlite();
const db = drizzle(pg, { schema });
let app: Awaited<ReturnType<typeof buildDemoApp>>['app'];
const config = {
  requireAccount: true,
  production: false,
  host: '127.0.0.1',
  port: 4173,
  databaseUrl: '',
  authUrl: origin,
  authSecret: 'auth-integration-test-secret-over-thirty-two',
  origins: [origin],
  demoMode: true,
};
beforeAll(async () => {
  await migrate(db, { migrationsFolder: 'drizzle' });
  app = (await buildDemoApp({ db: db as unknown as Database, config })).app;
}, 30000);
afterAll(async () => {
  await app?.close();
  await pg.close();
});
const post = (url: string, payload: object, cookie = '') =>
  app.inject({ method: 'POST', url, payload, headers: { origin, cookie } });
it('blocks guests, persists a hashed account, permits unverified registered login and restores it after rebuilding the app', async () => {
  expect((await post('/api/auth/sign-in/anonymous', {})).statusCode).toBe(403);
  expect((await post('/api/vc/rooms', { consent: true })).statusCode).toBe(401);
  const email = 'registered@account.test',
    password = 'A-different-strong-test-password';
  const signup = await post('/api/auth/sign-up/email', {
    name: 'Registered Player',
    email,
    password,
  });
  expect(signup.statusCode, signup.body).toBe(200);
  const cookie = signup.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  expect(
    (await post('/api/vc/rooms', { consent: true }, cookie)).statusCode,
  ).toBe(201);
  const accounts = await db.select().from(schema.account);
  expect(accounts[0]?.password).toBeTruthy();
  expect(accounts[0]?.password).not.toContain(password);
  const users = await db.select().from(schema.user);
  expect(users[0]?.emailVerified).toBe(false);
  await app.close();
  app = (await buildDemoApp({ db: db as unknown as Database, config })).app;
  expect(
    (
      await post('/api/auth/sign-in/email', {
        email,
        password: 'incorrect-password',
      })
    ).statusCode,
  ).toBe(401);
  const login = await post('/api/auth/sign-in/email', { email, password });
  expect(login.statusCode, login.body).toBe(200);
  const restored = login.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  const profile = await app.inject({
    url: '/api/me/settings',
    headers: { cookie: restored },
  });
  expect(profile.json().displayName).toBe('Registered Player');
}, 30000);
