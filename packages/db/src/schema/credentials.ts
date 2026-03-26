import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const credentials = pgTable(
  "credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["apiKey", "oauth2", "basicAuth", "none"],
    })
      .notNull()
      .default("none"),
    vaultSecretId: text("vault_secret_id").notNull(),
    connectorId: text("connector_id"),
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
    index("credentials_tenant_id_idx").on(t.tenantId),
    index("credentials_created_by_idx").on(t.createdBy),
    index("credentials_connector_id_idx").on(t.connectorId),
  ],
);

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;
