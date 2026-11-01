import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

// Server/scripts only: never import this module into the browser bundle.
const connectionString = process.env.DATABASE_URL;
if (!connectionString?.trim()) {
  throw new Error("DATABASE_URL is required. Set it before importing src/db/index.ts.");
}

export const pool = new Pool({ connectionString, max: 5 });
export const db = drizzle(pool, { schema });
