import { Client, Connection } from "@temporalio/client";
import { env } from "./env";

let _client: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (_client) return _client;

  const connection = await Connection.connect({
    address: env.TEMPORAL_ADDRESS,
  });

  _client = new Client({
    connection,
    namespace: env.TEMPORAL_NAMESPACE,
  });

  return _client;
}

export async function closeTemporalClient(): Promise<void> {
  if (_client) {
    await _client.connection.close();
    _client = null;
  }
}

/**
 * Start a workflow execution via the Temporal client.
 */
export async function startExecutionWorkflow(params: {
  workflowId: string;
  executionId: string;
  tenantId: string;
  nodes: unknown[];
  triggerPayload: Record<string, unknown>;
}): Promise<string> {
  const client = await getTemporalClient();

  const { executeFlowWorkflow } = await import(
    "./workflows/execution.workflow"
  );

  const handle = await client.workflow.start(executeFlowWorkflow, {
    taskQueue: env.TEMPORAL_TASK_QUEUE,
    workflowId: `exec-${params.executionId}`,
    args: [params],
    workflowExecutionTimeout: `${env.MAX_WORKFLOW_EXECUTION_SECONDS}s`,
  });

  return handle.workflowId;
}

/**
 * Send a cancel signal to a running workflow.
 */
export async function cancelExecutionWorkflow(
  executionId: string
): Promise<void> {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`exec-${executionId}`);
  await handle.cancel();
}

/**
 * Query the current status of a running workflow.
 */
export async function queryExecutionStatus(
  executionId: string
): Promise<unknown> {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(`exec-${executionId}`);

  const { statusQuery } = await import("./workflows/execution.workflow");
  return handle.query(statusQuery);
}
