import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { workflows } from "./workflows.js";
import { users } from "./users.js";

export const workflowVersions = pgTable(
  "workflow_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    definition: jsonb("definition").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("workflow_versions_tenant_id_idx").on(t.tenantId),
    index("workflow_versions_workflow_id_idx").on(t.workflowId),
    unique("workflow_versions_workflow_version_unique").on(
      t.workflowId,
      t.version,
    ),
  ],
);

export type WorkflowVersion = typeof workflowVersions.$inferSelect;
export type NewWorkflowVersion = typeof workflowVersions.$inferInsert;
