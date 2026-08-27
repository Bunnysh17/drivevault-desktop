import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const DEFAULT_DB_URL = "postgresql://neondb_owner:npg_3HinZIBNpVh8@ep-autumn-field-az8v0i43.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";
const databaseUrl = process.env.DATABASE_URL && process.env.DATABASE_URL.length > 5 ? process.env.DATABASE_URL : DEFAULT_DB_URL;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool, { schema });
