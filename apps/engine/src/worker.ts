import { Worker, NativeConnection } from "@temporalio/worker";
import { env } from "./env";
import * as nodeActivities from "./activities/node.activities";
import * as dbActivities from "./activities/db.activities";

export async function createWorker(): Promise<Worker> {
  const connection = await NativeConnection.connect({
    address: env.TEMPORAL_ADDRESS,
  });

  const worker = await Worker.create({
    connection,
    namespace: env.TEMPORAL_NAMESPACE,
    taskQueue: env.TEMPORAL_TASK_QUEUE,

    // Workflow bundle — Temporal bundles workflows separately from activities
    workflowsPath: require.resolve("./workflows/execution.workflow"),

    // All activity implementations
    activities: {
      ...nodeActivities,
      ...dbActivities,
    },

    // Concurrency tuning
    maxConcurrentWorkflowTaskPollers:
      env.MAX_CONCURRENT_WORKFLOW_TASK_POLLERS,
    maxConcurrentActivityTaskPollers:
      env.MAX_CONCURRENT_ACTIVITY_TASK_POLLERS,

    // Interceptors can be added here for OTEL tracing
    interceptors: {
      workflowModules: [],
    },
  });

  return worker;
}
