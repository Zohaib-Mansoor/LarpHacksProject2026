import { betterAuth } from 'better-auth';
import { anonymous } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { Config } from './config.js';
import type { Database } from './db/client.js';
import * as schema from './db/auth-schema.js';
import type { GameStore } from './store.js';

export function createAuth(db: Database, config: Config, store: GameStore) {
  return betterAuth({
    appName: 'PlayCall',
    baseURL: config.authUrl,
    basePath: '/api/auth',
    secret: config.authSecret,
    trustedOrigins: config.origins,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    session: { expiresIn: 60 * 60 * 24 * 7, cookieCache: { enabled: false } },
    advanced: { useSecureCookies: config.production },
    socialProviders: config.google ? { google: config.google } : {},
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      requireEmailVerification: false,
    },
    plugins: [
      anonymous({
        disableDeleteAnonymousUser: true,
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await store.transferGuest(anonymousUser.user.id, newUser.user.id);
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
