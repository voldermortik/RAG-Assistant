// ---------------------------------------------------------------------------
// Plan tiers
// ---------------------------------------------------------------------------

export type PlanTier = "free" | "pro" | "team" | "business" | "enterprise" | "self_hosted";

// ---------------------------------------------------------------------------
// Log retention (days)
// ---------------------------------------------------------------------------

export type LogRetentionDays = 3 | 30 | 90 | 365 | -1;

// ---------------------------------------------------------------------------
// Pricing limits per plan
// ---------------------------------------------------------------------------

export interface PricingLimits {
  /** Plan identifier */
  tier: PlanTier;
  /** Human-readable display name */
  displayName: string;
  /** Maximum number of workflows. -1 = unlimited */
  maxWorkflows: number;
  /** Maximum executions per calendar month. -1 = unlimited */
  maxExecutionsPerMonth: number;
  /** Maximum team members (seats). -1 = unlimited */
  maxUsers: number;
  /** How many days execution logs are retained. -1 = unlimited */
  logRetentionDays: LogRetentionDays;
  /** Agent-mode / AI step access */
  agentAccess: boolean;
  /** Human-in-the-loop step access */
  hitlAccess: boolean;
  /** SSO (SAML/OIDC) support */
  ssoAccess: boolean;
  /** Fine-grained RBAC support */
  rbacAccess: boolean;
  /** Custom connector SDK support */
  customConnectors: boolean;
  /** Dedicated infrastructure / SLA */
  dedicatedInfrastructure: boolean;
  /**
   * Monthly base price in USD cents.
   * 0 = free, -1 = custom / contact sales
   */
  basePriceCentsPerMonth: number;
  /**
   * Per-seat monthly price in USD cents (0 if flat-rate or N/A).
   */
  perUserCentsPerMonth: number;
  /** Execution overage rate in USD cents per execution (after monthly quota). */
  overageRateCentsPerExecution: number;
  /** Minimum polling interval for triggers in seconds */
  minPollIntervalSeconds: number;
  /** Maximum concurrent executions per tenant */
  maxConcurrentExecutions: number;
}

// ---------------------------------------------------------------------------
// Overage rate constant (shared by billing logic)
// ---------------------------------------------------------------------------

/** $0.001 per execution expressed in USD cents */
export const OVERAGE_RATE_PER_EXECUTION = 0.1;

// ---------------------------------------------------------------------------
// Plan definitions
// ---------------------------------------------------------------------------

export const PLAN_LIMITS: Record<PlanTier, PricingLimits> = {
  free: {
    tier: "free",
    displayName: "Free",
    maxWorkflows: 5,
    maxExecutionsPerMonth: 500,
    maxUsers: 1,
    logRetentionDays: 3,
    agentAccess: false,
    hitlAccess: false,
    ssoAccess: false,
    rbacAccess: false,
    customConnectors: false,
    dedicatedInfrastructure: false,
    basePriceCentsPerMonth: 0,
    perUserCentsPerMonth: 0,
    overageRateCentsPerExecution: 0,
    minPollIntervalSeconds: 300,
    maxConcurrentExecutions: 3,
  },

  pro: {
    tier: "pro",
    displayName: "Pro",
    maxWorkflows: -1,
    maxExecutionsPerMonth: 10_000,
    maxUsers: 1,
    logRetentionDays: 30,
    agentAccess: false,
    hitlAccess: false,
    ssoAccess: false,
    rbacAccess: false,
    customConnectors: true,
    dedicatedInfrastructure: false,
    basePriceCentsPerMonth: 0,
    perUserCentsPerMonth: 2_900,
    overageRateCentsPerExecution: 10,
    minPollIntervalSeconds: 60,
    maxConcurrentExecutions: 10,
  },

  team: {
    tier: "team",
    displayName: "Team",
    maxWorkflows: -1,
    maxExecutionsPerMonth: 50_000,
    maxUsers: 5,
    logRetentionDays: 30,
    agentAccess: true,
    hitlAccess: true,
    ssoAccess: false,
    rbacAccess: false,
    customConnectors: true,
    dedicatedInfrastructure: false,
    basePriceCentsPerMonth: 9_900,
    perUserCentsPerMonth: 0,
    overageRateCentsPerExecution: 10,
    minPollIntervalSeconds: 60,
    maxConcurrentExecutions: 25,
  },

  business: {
    tier: "business",
    displayName: "Business",
    maxWorkflows: -1,
    maxExecutionsPerMonth: 250_000,
    maxUsers: 15,
    logRetentionDays: 90,
    agentAccess: true,
    hitlAccess: true,
    ssoAccess: true,
    rbacAccess: true,
    customConnectors: true,
    dedicatedInfrastructure: false,
    basePriceCentsPerMonth: 29_900,
    perUserCentsPerMonth: 0,
    overageRateCentsPerExecution: 10,
    minPollIntervalSeconds: 15,
    maxConcurrentExecutions: 100,
  },

  enterprise: {
    tier: "enterprise",
    displayName: "Enterprise",
    maxWorkflows: -1,
    maxExecutionsPerMonth: -1,
    maxUsers: -1,
    logRetentionDays: 365,
    agentAccess: true,
    hitlAccess: true,
    ssoAccess: true,
    rbacAccess: true,
    customConnectors: true,
    dedicatedInfrastructure: true,
    basePriceCentsPerMonth: -1,
    perUserCentsPerMonth: -1,
    overageRateCentsPerExecution: 10,
    minPollIntervalSeconds: 5,
    maxConcurrentExecutions: -1,
  },

  self_hosted: {
    tier: "self_hosted",
    displayName: "Self-Hosted",
    maxWorkflows: -1,
    maxExecutionsPerMonth: -1,
    maxUsers: -1,
    logRetentionDays: -1,
    agentAccess: true,
    hitlAccess: true,
    ssoAccess: true,
    rbacAccess: true,
    customConnectors: true,
    dedicatedInfrastructure: true,
    basePriceCentsPerMonth: 0,
    perUserCentsPerMonth: 0,
    overageRateCentsPerExecution: 0,
    minPollIntervalSeconds: 1,
    maxConcurrentExecutions: -1,
  },
};
