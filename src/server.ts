import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

if (existsSync(".env")) loadEnvFile(".env");
const origin = process.env.APP_ORIGIN;
const secret = process.env.BETTER_AUTH_SECRET;
if (!origin || new URL(origin).origin !== origin) throw new Error("APP_ORIGIN must be an origin such as http://localhost:3000");
if (!secret || secret.length < 32) throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters");
if (process.env.NODE_ENV === "production" && !origin.startsWith("https://")) throw new Error("Production APP_ORIGIN must use HTTPS");
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");
const { db, pool } = await import("./db/index.js");
const { buildApp } = await import("./app.js");
const app = buildApp(db, origin, secret);
app.addHook("onClose", async () => { await pool.end(); });
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => { void app.close(); });
}
try {
  await db.execute("select 1");
  await app.listen({ host: "0.0.0.0", port });
  console.log(`RoleCall lobby API listening on ${origin}`);
} catch (error: unknown) {
  console.error(error);
  await app.close();
  process.exitCode = 1;
}
