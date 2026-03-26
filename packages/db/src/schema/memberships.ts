import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { users } from "./users.js";

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "editor", "viewer"] })
      .notNull()
      .default("viewer"),
    invitedBy: uuid("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("memberships_tenant_id_idx").on(t.tenantId),
    index("memberships_user_id_idx").on(t.userId),
    unique("memberships_tenant_user_unique").on(t.tenantId, t.userId),
  ],
);

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
