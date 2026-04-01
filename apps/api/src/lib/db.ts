/**
 * Re-exports the shared Drizzle DB client from @flowcore/db.
 * All route handlers import `db` from here to keep imports consistent.
 */
export { db, schema } from "@flowcore/db";
export type { Database } from "@flowcore/db";
