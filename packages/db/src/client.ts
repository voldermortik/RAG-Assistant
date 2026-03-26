import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Create the postgres.js connection
const queryClient = postgres(databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});

// Create the Drizzle ORM client
export const db = drizzle(queryClient, { schema });

export type Database = typeof db;

// Re-export schema for convenience
export { schema };
