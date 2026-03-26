import { type PlanTier } from "./billing.js";

// ---------------------------------------------------------------------------
// RBAC roles
// ---------------------------------------------------------------------------

/**
 * Platform-level roles (within a tenant).
 * - owner:   full control including billing and deletion
 * - admin:   full control except billing/deletion
 * - editor:  create/edit/run workflows, manage connectors
 * - viewer:  read-only access to workflows and executions
 * - billing: billing management only (no workflow access)
 */
export type TenantRole = "owner" | "admin" | "editor" | "viewer" | "billing";

/**
 * Fine-grained resource permissions.
 */
export type Permission =
  | "workflow:read"
  | "workflow:create"
  | "workflow:update"
  | "workflow:delete"
  | "workflow:run"
  | "workflow:publish"
  | "execution:read"
  | "execution:cancel"
  | "connector:read"
  | "connector:create"
  | "connector:update"
  | "connector:delete"
  | "credential:read"
  | "credential:create"
  | "credential:update"
  | "credential:delete"
  | "member:read"
  | "member:invite"
  | "member:remove"
  | "member:update_role"
  | "billing:read"
  | "billing:update"
  | "audit_log:read"
  | "tenant:update"
  | "tenant:delete"
  | "api_key:read"
  | "api_key:create"
  | "api_key:delete";

/** Default permissions per role */
export const ROLE_PERMISSIONS: Record<TenantRole, Permission[]> = {
  owner: [
    "workflow:read",
    "workflow:create",
    "workflow:update",
    "workflow:delete",
    "workflow:run",
    "workflow:publish",
    "execution:read",
    "execution:cancel",
    "connector:read",
    "connector:create",
    "connector:update",
    "connector:delete",
    "credential:read",
    "credential:create",
    "credential:update",
    "credential:delete",
    "member:read",
    "member:invite",
    "member:remove",
    "member:update_role",
    "billing:read",
    "billing:update",
    "audit_log:read",
    "tenant:update",
    "tenant:delete",
    "api_key:read",
    "api_key:create",
    "api_key:delete",
  ],
  admin: [
    "workflow:read",
    "workflow:create",
    "workflow:update",
    "workflow:delete",
    "workflow:run",
    "workflow:publish",
    "execution:read",
    "execution:cancel",
    "connector:read",
    "connector:create",
    "connector:update",
    "connector:delete",
    "credential:read",
    "credential:create",
    "credential:update",
    "credential:delete",
    "member:read",
    "member:invite",
    "member:remove",
    "member:update_role",
    "billing:read",
    "audit_log:read",
    "tenant:update",
    "api_key:read",
    "api_key:create",
    "api_key:delete",
  ],
  editor: [
    "workflow:read",
    "workflow:create",
    "workflow:update",
    "workflow:run",
    "workflow:publish",
    "execution:read",
    "execution:cancel",
    "connector:read",
    "credential:read",
    "credential:create",
    "credential:update",
    "member:read",
    "api_key:read",
    "api_key:create",
  ],
  viewer: [
    "workflow:read",
    "execution:read",
    "connector:read",
    "member:read",
    "audit_log:read",
  ],
  billing: ["billing:read", "billing:update", "tenant:update"],
};

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------

export type TenantPlan = PlanTier;

export type TenantStatus = "active" | "suspended" | "trial" | "cancelled";

export interface TenantSettings {
  allowedEmailDomains: string[];
  requireMfa: boolean;
  sessionTimeoutMinutes: number;
  logRetentionDays: number;
  webhookSigningSecret: string | null;
  defaultTimezone: string;
  customBranding: {
    logoUrl: string | null;
    primaryColor: string | null;
    faviconUrl: string | null;
  } | null;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  plan: TenantPlan;
  status: TenantStatus;
  settings: TenantSettings;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  trialEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export type UserStatus = "active" | "suspended" | "pending_verification";

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Membership (user ↔ tenant)
// ---------------------------------------------------------------------------

export type MembershipStatus = "active" | "invited" | "deactivated";

export interface Membership {
  id: string;
  tenantId: string;
  userId: string;
  role: TenantRole;
  status: MembershipStatus;
  invitedBy: string | null;
  invitedAt: Date | null;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// API Key
// ---------------------------------------------------------------------------

export type ApiKeyScope = Permission | "*";

export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  /** SHA-256 hash of the raw key — never store the raw key */
  keyHash: string;
  scopes: ApiKeyScope[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  revokedAt: Date | null;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  actorId: string;
  actorType: "user" | "api_key" | "system";
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// SSO configuration (Business/Enterprise only)
// ---------------------------------------------------------------------------

export type SsoProtocol = "saml" | "oidc";

export interface SsoConfig {
  id: string;
  tenantId: string;
  protocol: SsoProtocol;
  enabled: boolean;
  domain: string;
  /** OIDC: issuer / SAML: entity ID */
  issuer: string;
  /** OIDC: client ID */
  clientId: string | null;
  /** OIDC: discovery URL / SAML: metadata URL */
  metadataUrl: string | null;
  /** SAML: raw XML metadata */
  metadataXml: string | null;
  attributeMapping: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}
