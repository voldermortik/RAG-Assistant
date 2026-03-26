import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { workflows } from "./workflows.js";

export const executions = pgTable(
  "executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "running", "success", "error", "cancelled"],
    })
      .notNull()
      .default("pending"),
    triggerType: text("trigger_type", {
      enum: ["webhook", "schedule", "manual", "event"],
    }).notNull(),
    triggerPayload: jsonb("trigger_payload"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    error: jsonb("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("executions_tenant_id_idx").on(t.tenantId),
    index("executions_workflow_id_idx").on(t.workflowId),
    index("executions_status_idx").on(t.status),
    index("executions_created_at_idx").on(t.createdAt),
    index("executions_tenant_workflow_idx").on(t.tenantId, t.workflowId),
  ],
);

export type Execution = typeof executions.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;
