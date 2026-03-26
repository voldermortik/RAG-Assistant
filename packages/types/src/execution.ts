// ---------------------------------------------------------------------------
// Execution status — used across Workflow nodes and Execution records
// ---------------------------------------------------------------------------

export type ExecutionStatus = "running" | "success" | "error" | "skipped";

// ---------------------------------------------------------------------------
// ExecutionStep — matches the exact interface from the strategy doc
// ---------------------------------------------------------------------------

export interface ExecutionStep {
  id: string; // uuid
  executionId: string; // FK → executions
  workflowId: string;
  tenantId: string;
  nodeId: string; // node ID from workflow DAG
  nodeType: string; // "HttpRequest" | "Code" | "Condition" etc
  status: ExecutionStatus;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  input: Record<string, unknown>; // sanitised — no secrets
  output: Record<string, unknown>; // sanitised — no secrets
  error: { message: string; stack?: string } | null;
  retryCount: number;
  traceId: string; // OTEL trace ID for correlation
}

// ---------------------------------------------------------------------------
// Execution trigger source
// ---------------------------------------------------------------------------

export type ExecutionTriggerSource =
  | "manual"
  | "schedule"
  | "webhook"
  | "event"
  | "api"
  | "sub_workflow"
  | "test";

// ---------------------------------------------------------------------------
// Overall execution record
// ---------------------------------------------------------------------------

export interface Execution {
  id: string;
  workflowId: string;
  workflowVersion: number;
  tenantId: string;
  status: ExecutionStatus | "queued" | "cancelled" | "timed_out";
  triggerSource: ExecutionTriggerSource;
  triggerPayload: Record<string, unknown>;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  steps: ExecutionStep[];
  /** Contextual variables available to all nodes during this run */
  context: Record<string, unknown>;
  error: { message: string; stack?: string } | null;
  traceId: string;
  parentExecutionId: string | null;
  /** Number of times this execution was automatically retried */
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Execution queue item
// ---------------------------------------------------------------------------

export interface ExecutionQueueItem {
  executionId: string;
  workflowId: string;
  tenantId: string;
  priority: "low" | "normal" | "high" | "critical";
  scheduledAt: Date;
  enqueuedAt: Date;
  attempt: number;
}

// ---------------------------------------------------------------------------
// Execution statistics aggregated over a time window
// ---------------------------------------------------------------------------

export interface ExecutionStats {
  tenantId: string;
  workflowId: string | null;
  windowStart: Date;
  windowEnd: Date;
  totalExecutions: number;
  successCount: number;
  errorCount: number;
  cancelledCount: number;
  timedOutCount: number;
  avgDurationMs: number | null;
  p50DurationMs: number | null;
  p95DurationMs: number | null;
  p99DurationMs: number | null;
}

// ---------------------------------------------------------------------------
// HITL (Human-in-the-Loop) approval request
// ---------------------------------------------------------------------------

export type HitlStatus = "pending" | "approved" | "rejected" | "timed_out";

export interface HitlRequest {
  id: string;
  executionId: string;
  executionStepId: string;
  workflowId: string;
  tenantId: string;
  assigneeId: string | null;
  assigneeEmail: string | null;
  formSchema: Record<string, unknown>;
  formData: Record<string, unknown> | null;
  status: HitlStatus;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  expiresAt: Date;
  createdAt: Date;
}
