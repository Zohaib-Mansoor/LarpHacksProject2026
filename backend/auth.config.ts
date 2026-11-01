import { betterAuth } from 'better-auth';
import { anonymous } from 'better-auth/plugins';

// Schema generation only. Runtime config (with a database and secrets) lives in src/auth.ts.
export const auth = betterAuth({
  plugins: [anonymous({ disableDeleteAnonymousUser: true })],
});
