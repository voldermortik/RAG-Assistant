import {
  proxyActivities,
  defineSignal,
  defineQuery,
  setHandler,
  condition,
  ActivityFailure,
  sleep,
  workflowInfo,
} from "@temporalio/workflow";
import type * as nodeActivities from "../activities/node.activities";
import type * as dbActivities from "../activities/db.activities";
import { defaultRetryPolicy, dbWriteRetryPolicy } from "../lib/retry";

// ---------------------------------------------------------------------------
// Activity proxies
// ---------------------------------------------------------------------------

const { executeHttpRequest, executeCodeNode, evaluateCondition, executeSetVariable } =
  proxyActivities<typeof nodeActivities>({
    startToCloseTimeout: "60s",
    scheduleToCloseTimeout: "5m",
    retry: defaultRetryPolicy,
  });

const { executeCodeNodeSandboxed } = proxyActivities<typeof nodeActivities>({
  startToCloseTimeout: "10s",
  scheduleToCloseTimeout: "30s",
  retry: defaultRetryPolicy,
});

const { updateExecutionStatus, writeExecutionStep } =
  proxyActivities<typeof dbActivities>({
    startToCloseTimeout: "10s",
    scheduleToCloseTimeout: "30s",
    retry: dbWriteRetryPolicy,
  });

// ---------------------------------------------------------------------------
// Workflow input types
// ---------------------------------------------------------------------------

export interface WorkflowNode {
  id: string;
  type:
    | "HttpRequest"
    | "Code"
    | "Condition"
    | "SetVariable"
    | "SubWorkflow"
    | "Wait"
    | "Agent";
  name: string;
  config: Record<string, unknown>;
  /** IDs of nodes that must complete before this node can run */
  dependsOn: string[];
}

export interface ExecutionWorkflowInput {
  workflowId: string;
  executionId: string;
  tenantId: string;
  nodes: WorkflowNode[];
  triggerPayload: Record<string, unknown>;
}

export type StepStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "skipped"
  | "cancelled";

export interface StepState {
  nodeId: string;
  nodeType: string;
  status: StepStatus;
  output?: Record<string, unknown>;
  error?: string;
}

export interface WorkflowStatus {
  executionId: string;
  currentStep: string | null;
  completedSteps: string[];
  failedSteps: string[];
  status: "running" | "success" | "error" | "cancelled";
  steps: StepState[];
}

// ---------------------------------------------------------------------------
// Signals & Queries
// ---------------------------------------------------------------------------

export const cancelSignal = defineSignal("cancel");
export const statusQuery = defineQuery<WorkflowStatus>("status");

// ---------------------------------------------------------------------------
// Main durable workflow
// ---------------------------------------------------------------------------

export async function executeFlowWorkflow(
  input: ExecutionWorkflowInput
): Promise<WorkflowStatus> {
  const { executionId, tenantId, workflowId, nodes, triggerPayload } = input;

  // Mutable state tracked across the workflow
  let cancelled = false;
  let currentStep: string | null = null;
  const completedSteps: string[] = [];
  const failedSteps: string[] = [];
  const stepStates: Map<string, StepState> = new Map();
  // Shared execution context — variables can be set by SetVariable nodes
  const executionContext: Record<string, unknown> = {
    trigger: triggerPayload,
    workflowId,
    executionId,
    tenantId,
  };

  // Initialize step states
  for (const node of nodes) {
    stepStates.set(node.id, {
      nodeId: node.id,
      nodeType: node.type,
      status: "pending",
    });
  }

  // Register signal handler
  setHandler(cancelSignal, () => {
    cancelled = true;
  });

  // Register query handler
  setHandler(statusQuery, (): WorkflowStatus => ({
    executionId,
    currentStep,
    completedSteps: [...completedSteps],
    failedSteps: [...failedSteps],
    status: cancelled
      ? "cancelled"
      : failedSteps.length > 0
        ? "error"
        : completedSteps.length === nodes.length
          ? "success"
          : "running",
    steps: Array.from(stepStates.values()),
  }));

  // Mark execution as running in DB
  await updateExecutionStatus({
    executionId,
    tenantId,
    status: "running",
    startedAt: new Date(),
  });

  // ---------------------------------------------------------------------------
  // Execute nodes in topological order respecting dependsOn edges
  // ---------------------------------------------------------------------------
  const info = workflowInfo();
  const traceId = info.workflowId;

  for (const node of nodes) {
    if (cancelled) {
      stepStates.set(node.id, { ...stepStates.get(node.id)!, status: "cancelled" });
      continue;
    }

    // Wait for all dependencies to complete
    const deps = node.dependsOn ?? [];
    if (deps.length > 0) {
      await condition(() => {
        return deps.every(
          (depId) =>
            completedSteps.includes(depId) ||
            (stepStates.get(depId)?.status === "skipped") ||
            (stepStates.get(depId)?.status === "error")
        );
      });
    }

    // If a dependency failed, skip this node
    const hasFailedDep = deps.some((d) => failedSteps.includes(d));
    if (hasFailedDep) {
      stepStates.set(node.id, { ...stepStates.get(node.id)!, status: "skipped" });
      continue;
    }

    if (cancelled) {
      stepStates.set(node.id, { ...stepStates.get(node.id)!, status: "cancelled" });
      continue;
    }

    currentStep = node.id;
    stepStates.set(node.id, { ...stepStates.get(node.id)!, status: "running" });

    // Write "started" step record
    await writeExecutionStep({
      executionId,
      tenantId,
      workflowId,
      nodeId: node.id,
      nodeType: node.type,
      status: "running",
      startedAt: new Date(),
      input: { ...node.config, context: executionContext },
      traceId,
    });

    try {
      let output: Record<string, unknown> = {};

      switch (node.type) {
        case "HttpRequest":
          output = await executeHttpRequest({
            executionId,
            tenantId,
            nodeId: node.id,
            config: node.config,
            context: executionContext,
            traceId,
          });
          break;

        case "Code":
          output = await executeCodeNodeSandboxed({
            executionId,
            tenantId,
            nodeId: node.id,
            config: node.config,
            context: executionContext,
            traceId,
          });
          break;

        case "Condition":
          output = await evaluateCondition({
            executionId,
            tenantId,
            nodeId: node.id,
            config: node.config,
            context: executionContext,
            traceId,
          });
          // Condition nodes can mark downstream nodes as skipped via result
          if (output.branch === "false") {
            // Mark all nodes in false branch as skipped (config-driven)
            const falseBranch = (node.config.falseBranch as string[]) ?? [];
            for (const depId of falseBranch) {
              stepStates.set(depId, {
                nodeId: depId,
                nodeType: "skipped",
                status: "skipped",
              });
            }
          }
          break;

        case "SetVariable":
          output = await executeSetVariable({
            executionId,
            tenantId,
            nodeId: node.id,
            config: node.config,
            context: executionContext,
            traceId,
          });
          // Merge variables into shared context
          if (output.variables) {
            Object.assign(executionContext, output.variables);
          }
          break;

        case "Wait":
          {
            const durationMs = (node.config.durationMs as number) ?? 1000;
            await sleep(durationMs);
            output = { waited: durationMs };
          }
          break;

        default:
          output = { skipped: true, reason: `Unsupported node type: ${node.type}` };
      }

      stepStates.set(node.id, {
        nodeId: node.id,
        nodeType: node.type,
        status: "success",
        output,
      });
      completedSteps.push(node.id);

      // Write completion record
      await writeExecutionStep({
        executionId,
        tenantId,
        workflowId,
        nodeId: node.id,
        nodeType: node.type,
        status: "success",
        completedAt: new Date(),
        output,
        traceId,
      });
    } catch (err) {
      const message =
        err instanceof ActivityFailure
          ? err.cause?.message ?? err.message
          : (err as Error).message;

      stepStates.set(node.id, {
        nodeId: node.id,
        nodeType: node.type,
        status: "error",
        error: message,
      });
      failedSteps.push(node.id);

      await writeExecutionStep({
        executionId,
        tenantId,
        workflowId,
        nodeId: node.id,
        nodeType: node.type,
        status: "error",
        completedAt: new Date(),
        error: { message, stack: (err as Error).stack },
        traceId,
      });

      // Stop execution on first failure unless configured to continue
      if (!node.config.continueOnError) {
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Finalize execution status in DB
  // ---------------------------------------------------------------------------
  const finalStatus = cancelled
    ? "cancelled"
    : failedSteps.length > 0
      ? "error"
      : "success";

  await updateExecutionStatus({
    executionId,
    tenantId,
    status: finalStatus,
    completedAt: new Date(),
    error:
      failedSteps.length > 0
        ? { message: `Steps failed: ${failedSteps.join(", ")}` }
        : null,
  });

  currentStep = null;

  return {
    executionId,
    currentStep: null,
    completedSteps,
    failedSteps,
    status: finalStatus === "cancelled" ? "cancelled" : finalStatus === "error" ? "error" : "success",
    steps: Array.from(stepStates.values()),
  };
}
