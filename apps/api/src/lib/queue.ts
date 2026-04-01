/**
 * BullMQ queue setup for workflow executions
 */
import { Queue } from "bullmq";
import { env } from "../env.js";
import { getRedis } from "./redis.js";

export interface WorkflowExecuteJobData {
  executionId: string;
  workflowId: string;
  tenantId: string;
  triggerType: "webhook" | "schedule" | "manual" | "event";
  triggerPayload: Record<string, unknown>;
  idempotencyKey?: string;
}

let executionQueue: Queue<WorkflowExecuteJobData> | null = null;

export function getExecutionQueue(): Queue<WorkflowExecuteJobData> {
  if (!executionQueue) {
    const redis = getRedis();
    executionQueue = new Queue<WorkflowExecuteJobData>(
      env.EXECUTION_QUEUE_NAME,
      {
        connection: redis,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
          removeOnComplete: {
            count: 1000,
            age: 86400, // 24h
          },
          removeOnFail: {
            count: 500,
            age: 604800, // 7 days
          },
        },
      },
    );

    executionQueue.on("error", (err: Error) => {
      console.error("[Queue] BullMQ error:", err.message);
    });
  }
  return executionQueue;
}

export async function enqueueExecution(
  data: WorkflowExecuteJobData,
  opts?: { jobId?: string; delay?: number },
): Promise<string> {
  const queue = getExecutionQueue();
  const job = await queue.add("workflow:execute", data, {
    ...(opts?.jobId ? { jobId: opts.jobId } : {}),
    ...(opts?.delay ? { delay: opts.delay } : {}),
  });
  if (!job.id) {
    throw new Error("Failed to enqueue execution job");
  }
  return job.id;
}
