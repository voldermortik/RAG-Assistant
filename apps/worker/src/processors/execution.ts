import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { getDb, executions, executionSteps } from "../lib/db";
import { checkAndIncrement } from "../lib/quota";
import { dispatchNode } from "../nodes/index";
import type { Logger } from "../lib/logger";
import type { ExecutionJobData, WorkflowNode } from "../worker";

export class QuotaExceededError extends Error {
  constructor(tenantId: string, used: number, limit: number) {
    super(`Quota exceeded for tenant ${tenantId}: ${used}/${limit} executions this month`);
    this.name = "QuotaExceededError";
  }
}

export async function processExecution(
  job: Job<ExecutionJobData>,
  log: Logger,
): Promise<void> {
  const { workflowId, executionId, tenantId, definition, triggerPayload } = job.data;

  const db = getDb();

  // 1. Check quota
  const quota = await checkAndIncrement(tenantId);
  if (!quota.allowed) {
    log.error("[execution] Quota exceeded", { tenantId, used: quota.used, limit: quota.limit });

    // Mark execution as error in DB
    await db
      .update(executions)
      .set({
        status: "error",
        completedAt: new Date(),
        error: { code: "QUOTA_EXCEEDED", message: `Monthly execution limit of ${quota.limit} reached` },
        updatedAt: new Date(),
      })
      .where(eq(executions.id, executionId));

    throw new QuotaExceededError(tenantId, quota.used, quota.limit);
  }

  const executionStartAt = new Date();

  // 2. Update execution status to "running"
  await db
    .update(executions)
    .set({
      status: "running",
      startedAt: executionStartAt,
      updatedAt: new Date(),
    })
    .where(eq(executions.id, executionId));

  log.info("[execution] Started", {
    executionId,
    workflowId,
    tenantId,
    nodeCount: definition.nodes.length,
  });

  // Execution context: collects outputs from each node so later nodes can reference earlier results
  const context: Record<string, unknown> = {
    trigger: triggerPayload,
    variables: {} as Record<string, unknown>,
  };

  // 3. Process each node in sequence
  let fatalError: Error | null = null;

  for (const node of definition.nodes) {
    const stepStartAt = new Date();

    // a. Write step record with status "running"
    const [step] = await db
      .insert(executionSteps)
      .values({
        tenantId,
        executionId,
        workflowId,
        nodeId: node.id,
        nodeType: node.type,
        status: "running",
        startedAt: stepStartAt,
        input: context as Record<string, unknown>,
        retryCount: job.attemptsMade,
        traceId: job.id ?? undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!step) {
      log.warn("[execution] Failed to insert step record", { nodeId: node.id });
      continue;
    }

    log.info("[execution] Executing node", {
      executionId,
      nodeId: node.id,
      nodeType: node.type,
    });

    try {
      // b. Execute node via dispatcher
      const output = await dispatchNode(node as WorkflowNode, context, log);
      const stepEndAt = new Date();
      const durationMs = stepEndAt.getTime() - stepStartAt.getTime();

      // Store node output in context for subsequent nodes
      context[`nodes.${node.id}`] = output;

      // c. Update step with output and success status
      await db
        .update(executionSteps)
        .set({
          status: "success",
          completedAt: stepEndAt,
          durationMs,
          output: output as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(executionSteps.id, step.id));

      log.info("[execution] Node completed", {
        executionId,
        nodeId: node.id,
        nodeType: node.type,
        durationMs,
      });
    } catch (err) {
      const stepEndAt = new Date();
      const durationMs = stepEndAt.getTime() - stepStartAt.getTime();
      fatalError = err instanceof Error ? err : new Error(String(err));

      log.error("[execution] Node failed", {
        executionId,
        nodeId: node.id,
        nodeType: node.type,
        error: fatalError.message,
        durationMs,
      });

      // d. Update step status to error
      await db
        .update(executionSteps)
        .set({
          status: "error",
          completedAt: stepEndAt,
          durationMs,
          error: {
            message: fatalError.message,
            stack: fatalError.stack,
          },
          updatedAt: new Date(),
        })
        .where(eq(executionSteps.id, step.id));

      break;
    }
  }

  const executionEndAt = new Date();
  const totalDurationMs = executionEndAt.getTime() - executionStartAt.getTime();

  if (fatalError) {
    // Update execution to error status
    await db
      .update(executions)
      .set({
        status: "error",
        completedAt: executionEndAt,
        durationMs: totalDurationMs,
        error: {
          message: fatalError.message,
          stack: fatalError.stack,
        },
        updatedAt: new Date(),
      })
      .where(eq(executions.id, executionId));

    log.error("[execution] Failed", {
      executionId,
      workflowId,
      tenantId,
      durationMs: totalDurationMs,
      error: fatalError.message,
    });

    // Re-throw so BullMQ can apply retry policy
    throw fatalError;
  }

  // 4. Update execution status to "success"
  await db
    .update(executions)
    .set({
      status: "success",
      completedAt: executionEndAt,
      durationMs: totalDurationMs,
      updatedAt: new Date(),
    })
    .where(eq(executions.id, executionId));

  log.info("[execution] Completed successfully", {
    executionId,
    workflowId,
    tenantId,
    durationMs: totalDurationMs,
    nodesExecuted: definition.nodes.length,
  });
}
