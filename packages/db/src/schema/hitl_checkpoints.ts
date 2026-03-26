import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { executions } from "./executions.js";
import { users } from "./users.js";

export const hitlCheckpoints = pgTable(
  "hitl_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    nodeId: text("node_id").notNull(),
    assigneeEmail: text("assignee_email").notNull(),
    message: text("message").notNull(),
    status: text("status", {
      enum: ["pending", "approved", "rejected", "timed_out"],
    })
      .notNull()
      .default("pending"),
    decidedBy: uuid("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    comment: text("comment"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("hitl_checkpoints_tenant_id_idx").on(t.tenantId),
    index("hitl_checkpoints_execution_id_idx").on(t.executionId),
    index("hitl_checkpoints_status_idx").on(t.status),
    index("hitl_checkpoints_assignee_email_idx").on(t.assigneeEmail),
    index("hitl_checkpoints_expires_at_idx").on(t.expiresAt),
  ],
);

export type HitlCheckpoint = typeof hitlCheckpoints.$inferSelect;
export type NewHitlCheckpoint = typeof hitlCheckpoints.$inferInsert;
