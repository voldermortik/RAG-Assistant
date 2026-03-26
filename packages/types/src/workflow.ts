import { type ExecutionStatus } from "./execution.js";

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

export type NodeId = string;
export type WorkflowId = string;
export type TenantId = string;

// ---------------------------------------------------------------------------
// Node types supported by the engine
// ---------------------------------------------------------------------------

export type NodeType =
  | "Trigger"
  | "HttpRequest"
  | "Code"
  | "Condition"
  | "Loop"
  | "Wait"
  | "ConnectorAction"
  | "SubWorkflow"
  | "HumanInTheLoop"
  | "Merge"
  | "Split"
  | "Transform"
  | "Note";

// ---------------------------------------------------------------------------
// Node position (canvas coordinates)
// ---------------------------------------------------------------------------

export interface NodePosition {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Node metadata shared by all node types
// ---------------------------------------------------------------------------

export interface NodeMeta {
  label: string;
  description?: string;
  disabled: boolean;
  retryPolicy?: RetryPolicy;
  timeoutMs?: number;
  continueOnError: boolean;
}

// ---------------------------------------------------------------------------
// Retry policy
// ---------------------------------------------------------------------------

export type BackoffStrategy = "fixed" | "exponential" | "linear";

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: BackoffStrategy;
  initialDelayMs: number;
  maxDelayMs: number;
  retryOn: Array<"error" | "timeout" | "http_5xx">;
}

// ---------------------------------------------------------------------------
// Node configuration (type-discriminated union)
// ---------------------------------------------------------------------------

export interface HttpRequestConfig {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  headers: Record<string, string>;
  queryParams: Record<string, string>;
  body?: string;
  timeoutMs: number;
  followRedirects: boolean;
  responseType: "json" | "text" | "binary";
}

export interface CodeConfig {
  language: "javascript" | "typescript" | "python";
  code: string;
  packages: string[];
}

export interface ConditionConfig {
  expression: string;
  trueBranchId: NodeId;
  falseBranchId: NodeId;
}

export interface LoopConfig {
  iterableExpression: string;
  maxIterations: number;
  bodyNodeId: NodeId;
}

export interface WaitConfig {
  durationMs?: number;
  untilExpression?: string;
}

export interface ConnectorActionConfig {
  connectorId: string;
  actionId: string;
  input: Record<string, unknown>;
  credentialId: string;
}

export interface SubWorkflowConfig {
  workflowId: WorkflowId;
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
  waitForCompletion: boolean;
}

export interface HumanInTheLoopConfig {
  assigneeExpression: string;
  formSchema: Record<string, unknown>;
  timeoutMs: number;
  timeoutBehavior: "fail" | "skip" | "auto_approve";
}

export interface TriggerConfig {
  triggerType: "webhook" | "schedule" | "event" | "manual";
  schedule?: string;
  webhookPath?: string;
  eventPattern?: string;
  filters: Array<{ field: string; operator: string; value: unknown }>;
}

export interface TransformConfig {
  expression: string;
  outputKey: string;
}

export type NodeConfig =
  | TriggerConfig
  | HttpRequestConfig
  | CodeConfig
  | ConditionConfig
  | LoopConfig
  | WaitConfig
  | ConnectorActionConfig
  | SubWorkflowConfig
  | HumanInTheLoopConfig
  | TransformConfig
  | Record<string, unknown>;

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------

export interface WorkflowNode {
  id: NodeId;
  type: NodeType;
  position: NodePosition;
  meta: NodeMeta;
  config: NodeConfig;
  /** Run-time execution status (undefined when not yet run) */
  executionStatus?: ExecutionStatus;
}

// ---------------------------------------------------------------------------
// Edge
// ---------------------------------------------------------------------------

export type EdgeCondition = "always" | "on_success" | "on_error" | "on_condition";

export interface WorkflowEdge {
  id: string;
  sourceNodeId: NodeId;
  targetNodeId: NodeId;
  condition: EdgeCondition;
  /** Optional label shown in the canvas */
  label?: string;
  /** Expression evaluated when condition === 'on_condition' */
  expression?: string;
}

// ---------------------------------------------------------------------------
// Workflow settings
// ---------------------------------------------------------------------------

export interface WorkflowSettings {
  timezone: string;
  concurrency: number;
  maxExecutionDurationMs: number;
  errorBehavior: "stop" | "continue";
  logLevel: "debug" | "info" | "warn" | "error";
}

// ---------------------------------------------------------------------------
// Workflow status lifecycle
// ---------------------------------------------------------------------------

export type WorkflowStatus = "draft" | "active" | "paused" | "archived";

// ---------------------------------------------------------------------------
// Workflow (the DAG definition)
// ---------------------------------------------------------------------------

export interface Workflow {
  id: WorkflowId;
  tenantId: TenantId;
  name: string;
  description: string;
  status: WorkflowStatus;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
  tags: string[];
  folderId: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
}

// ---------------------------------------------------------------------------
// Workflow version snapshot (immutable once created)
// ---------------------------------------------------------------------------

export interface WorkflowVersion {
  id: string;
  workflowId: WorkflowId;
  version: number;
  snapshot: Omit<Workflow, "id" | "tenantId" | "createdAt" | "updatedAt">;
  changelog: string;
  createdAt: Date;
  createdBy: string;
}

// ---------------------------------------------------------------------------
// Workflow folder (for organisation)
// ---------------------------------------------------------------------------

export interface WorkflowFolder {
  id: string;
  tenantId: TenantId;
  name: string;
  parentFolderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
