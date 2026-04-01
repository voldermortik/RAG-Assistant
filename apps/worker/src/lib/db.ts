import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import { logger } from "./logger";

// Inline schema — avoids bundling workspace packages in the worker
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Inline table definitions (mirror packages/db/src/schema)
// ---------------------------------------------------------------------------

export const executions = pgTable("executions", {
  id: uuid("id").primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  workflowId: uuid("workflow_id").notNull(),
  status: text("status").notNull(),
  triggerType: text("trigger_type").notNull(),
  triggerPayload: jsonb("trigger_payload"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  error: jsonb("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const executionSteps = pgTable("execution_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  executionId: uuid("execution_id").notNull(),
  workflowId: uuid("workflow_id").notNull(),
  nodeId: text("node_id").notNull(),
  nodeType: text("node_type").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  input: jsonb("input"),
  output: jsonb("output"),
  error: jsonb("error"),
  retryCount: integer("retry_count").notNull().default(0),
  traceId: text("trace_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// DB client
// ---------------------------------------------------------------------------

let _queryClient: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle<{ executions: typeof executions; executionSteps: typeof executionSteps }>> | null = null;

export function getDb() {
  if (_db) return _db;

  logger.info("[DB] Initialising Drizzle client");

  _queryClient = postgres(env.DATABASE_URL, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });

  _db = drizzle(_queryClient, {
    schema: { executions, executionSteps },
  });

  return _db;
}

export async function closeDb(): Promise<void> {
  if (_queryClient) {
    await _queryClient.end();
    _queryClient = null;
    _db = null;
    logger.info("[DB] Connection closed");
  }
}
