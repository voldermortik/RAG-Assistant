import { type ExecutionTriggerSource, type Execution, type ExecutionStep } from "./execution.js";
import { type Workflow, type WorkflowStatus } from "./workflow.js";
import { type Tenant, type Membership, type TenantRole, type ApiKey } from "./tenant.js";
import { type FlowCoreConnector } from "./connector.js";
import { type PlanTier } from "./billing.js";

// ---------------------------------------------------------------------------
// Generic pagination
// ---------------------------------------------------------------------------

export type SortOrder = "asc" | "desc";

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// ---------------------------------------------------------------------------
// Generic API response envelope
// ---------------------------------------------------------------------------

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  requestId: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// API error codes
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "PLAN_LIMIT_EXCEEDED"
  | "QUOTA_EXCEEDED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "BAD_GATEWAY"
  | "UNPROCESSABLE_ENTITY"
  | "METHOD_NOT_ALLOWED"
  | "GONE";

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ValidationError[];
    requestId: string;
    timestamp: string;
    /** Documentation link for this error */
    docsUrl?: string;
  };
}

// ---------------------------------------------------------------------------
// Workflow API
// ---------------------------------------------------------------------------

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  folderId?: string;
  tags?: string[];
  /** Optionally bootstrap with an initial set of nodes/edges */
  nodes?: Workflow["nodes"];
  edges?: Workflow["edges"];
  settings?: Partial<Workflow["settings"]>;
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  status?: WorkflowStatus;
  folderId?: string | null;
  tags?: string[];
  nodes?: Workflow["nodes"];
  edges?: Workflow["edges"];
  settings?: Partial<Workflow["settings"]>;
  /** Provide when saving a published version to record changelog */
  changelog?: string;
}

export interface ListWorkflowsRequest extends PaginationParams {
  status?: WorkflowStatus;
  folderId?: string;
  tags?: string[];
  search?: string;
}

// ---------------------------------------------------------------------------
// Execution API
// ---------------------------------------------------------------------------

export interface TriggerWorkflowRequest {
  /** Override variables injected into the trigger payload */
  payload?: Record<string, unknown>;
  source?: ExecutionTriggerSource;
  /** Optional idempotency key (UUID) — prevents duplicate executions */
  idempotencyKey?: string;
}

export interface TriggerWorkflowResponse {
  executionId: string;
  workflowId: string;
  status: Execution["status"];
  queuedAt: string;
  /** Resolved only when the execution completes synchronously (test runs) */
  execution?: Execution;
}

export interface CancelExecutionRequest {
  reason?: string;
}

export interface ListExecutionsRequest extends PaginationParams {
  workflowId?: string;
  status?: Execution["status"];
  triggerSource?: ExecutionTriggerSource;
  startedAfter?: string;
  startedBefore?: string;
}

export interface GetExecutionStepsResponse {
  steps: ExecutionStep[];
  total: number;
}

// ---------------------------------------------------------------------------
// Tenant & membership API
// ---------------------------------------------------------------------------

export interface UpdateTenantRequest {
  name?: string;
  settings?: Partial<Tenant["settings"]>;
}

export interface InviteMemberRequest {
  email: string;
  role: TenantRole;
}

export interface UpdateMemberRoleRequest {
  role: TenantRole;
}

export interface MemberWithUser extends Membership {
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  };
}

// ---------------------------------------------------------------------------
// API key API
// ---------------------------------------------------------------------------

export interface CreateApiKeyRequest {
  name: string;
  scopes: ApiKey["scopes"];
  expiresAt?: string;
}

export interface CreateApiKeyResponse {
  apiKey: ApiKey;
  /** Raw key — shown exactly once, never retrievable again */
  rawKey: string;
}

// ---------------------------------------------------------------------------
// Billing API
// ---------------------------------------------------------------------------

export interface BillingUsageResponse {
  tenantId: string;
  plan: PlanTier;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  executionsUsed: number;
  executionsLimit: number;
  workflowsCount: number;
  workflowsLimit: number;
  membersCount: number;
  membersLimit: number;
  overageExecutions: number;
  overageCostCents: number;
}

export interface ChangePlanRequest {
  plan: PlanTier;
  /** Required for paid plans — Stripe payment method ID */
  paymentMethodId?: string;
}

// ---------------------------------------------------------------------------
// Connector API
// ---------------------------------------------------------------------------

export interface ListConnectorsResponse {
  connectors: Array<
    Pick<FlowCoreConnector, "meta" | "auth"> & {
      actionsCount: number;
      triggersCount: number;
    }
  >;
}

export interface ConnectorCredential {
  id: string;
  tenantId: string;
  connectorId: string;
  name: string;
  authType: string;
  createdAt: string;
  updatedAt: string;
  /** Obfuscated preview, e.g. "••••••••abcd" */
  preview: string | null;
}

export interface CreateCredentialRequest {
  connectorId: string;
  name: string;
  credentials: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Webhook events (outbound from FlowCore to user's endpoints)
// ---------------------------------------------------------------------------

export type WebhookEventType =
  | "execution.started"
  | "execution.completed"
  | "execution.failed"
  | "execution.cancelled"
  | "execution.timed_out"
  | "workflow.activated"
  | "workflow.deactivated"
  | "hitl.approval_requested"
  | "hitl.approved"
  | "hitl.rejected"
  | "hitl.timed_out"
  | "member.invited"
  | "member.joined"
  | "member.removed"
  | "plan.upgraded"
  | "plan.downgraded"
  | "quota.warning"
  | "quota.exceeded";

export interface WebhookEvent<T = unknown> {
  id: string;
  type: WebhookEventType;
  tenantId: string;
  timestamp: string;
  apiVersion: string;
  data: T;
  /** HMAC-SHA256 signature of the raw payload, prefixed with "sha256=" */
  signature: string;
  /** Retry attempt number (0 = first delivery) */
  attempt: number;
}
