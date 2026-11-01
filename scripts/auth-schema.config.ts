import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";

// Schema-generation input only. No auth handler or server is mounted here.
// Phase 2 must retain UUID generation and the anonymous plugin.
export const auth = betterAuth({
  advanced: { database: { generateId: "uuid" } },
  plugins: [anonymous()],
});
