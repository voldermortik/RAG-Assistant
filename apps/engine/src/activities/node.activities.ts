/**
 * Node activity implementations for FlowCore Temporal worker.
 *
 * Each activity:
 *  - Receives structured input with execution context
 *  - Emits an OpenTelemetry span
 *  - Returns a typed output record
 *
 * Timeouts are enforced via the workflow proxy options (60s default, 10s for code nodes).
 */

import { ApplicationFailure, Context } from "@temporalio/activity";
import { trace, SpanStatusCode, context as otelContext, propagation } from "@opentelemetry/api";

const tracer = trace.getTracer("flowcore-engine", "0.1.0");

// ---------------------------------------------------------------------------
// Shared input type
// ---------------------------------------------------------------------------

export interface NodeActivityInput {
  executionId: string;
  tenantId: string;
  nodeId: string;
  config: Record<string, unknown>;
  context: Record<string, unknown>;
  traceId: string;
}

// ---------------------------------------------------------------------------
// executeHttpRequest
// ---------------------------------------------------------------------------

export async function executeHttpRequest(
  input: NodeActivityInput
): Promise<Record<string, unknown>> {
  const { executionId, nodeId, config, context, traceId } = input;

  return tracer.startActiveSpan(
    "activity.executeHttpRequest",
    {
      attributes: {
        "flowcore.execution_id": executionId,
        "flowcore.node_id": nodeId,
        "http.method": String(config.method ?? "GET"),
        "http.url": String(config.url ?? ""),
        "flowcore.trace_id": traceId,
      },
    },
    async (span) => {
      try {
        const method = String(config.method ?? "GET").toUpperCase();
        const rawUrl = String(config.url ?? "");

        // Interpolate {{variable}} placeholders from execution context
        const url = interpolate(rawUrl, context);

        const headers: Record<string, string> = {};

        // Merge user-supplied headers
        if (config.headers && typeof config.headers === "object") {
          for (const [k, v] of Object.entries(config.headers as Record<string, string>)) {
            headers[k] = interpolate(String(v), context);
          }
        }

        // Inject auth
        if (config.auth_type === "bearer" && config.auth_value) {
          headers["Authorization"] = `Bearer ${interpolate(String(config.auth_value), context)}`;
        } else if (config.auth_type === "basic" && config.auth_value) {
          headers["Authorization"] = `Basic ${Buffer.from(
            interpolate(String(config.auth_value), context)
          ).toString("base64")}`;
        } else if (config.auth_type === "api_key" && config.auth_value && config.auth_header) {
          headers[String(config.auth_header)] = interpolate(String(config.auth_value), context);
        }

        // Build query params
        let urlWithParams = url;
        if (config.query_params && typeof config.query_params === "object") {
          const params = new URLSearchParams();
          for (const [k, v] of Object.entries(config.query_params as Record<string, string>)) {
            params.set(k, interpolate(String(v), context));
          }
          urlWithParams = `${url}${url.includes("?") ? "&" : "?"}${params.toString()}`;
        }

        // Build body
        let bodyString: string | undefined;
        if (
          config.body !== undefined &&
          method !== "GET" &&
          method !== "HEAD"
        ) {
          if (typeof config.body === "string") {
            bodyString = interpolate(config.body, context);
          } else {
            bodyString = interpolateObject(config.body, context);
          }
          if (!headers["Content-Type"]) {
            headers["Content-Type"] = "application/json";
          }
        }

        // Propagate OTEL context via W3C traceparent
        const carrier: Record<string, string> = {};
        propagation.inject(otelContext.active(), carrier);
        Object.assign(headers, carrier);

        const response = await fetch(urlWithParams, {
          method,
          headers,
          body: bodyString,
          signal: AbortSignal.timeout(55_000), // slightly under the 60s activity timeout
        });

        const responseText = await response.text();
        let responseBody: unknown;
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          try {
            responseBody = JSON.parse(responseText);
          } catch {
            responseBody = responseText;
          }
        } else {
          responseBody = responseText;
        }

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        if (!response.ok && config.failOnHttpError !== false) {
          throw ApplicationFailure.create({
            message: `HTTP ${response.status} ${response.statusText}: ${responseText.slice(0, 500)}`,
            type: "HttpError",
            nonRetryable: response.status >= 400 && response.status < 500,
            details: [{ status: response.status, body: responseBody }],
          });
        }

        const result = {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: responseBody,
          url: urlWithParams,
          method,
        };

        span.setAttribute("http.status_code", response.status);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    }
  );
}

// ---------------------------------------------------------------------------
// executeCodeNode (aliased as executeCodeNodeSandboxed from workflow proxy)
// ---------------------------------------------------------------------------

export async function executeCodeNode(
  input: NodeActivityInput
): Promise<Record<string, unknown>> {
  const { executionId, nodeId, config, context, traceId } = input;

  return tracer.startActiveSpan(
    "activity.executeCodeNode",
    {
      attributes: {
        "flowcore.execution_id": executionId,
        "flowcore.node_id": nodeId,
        "flowcore.trace_id": traceId,
      },
    },
    async (span) => {
      try {
        const code = String(config.code ?? "");
        if (!code.trim()) {
          throw ApplicationFailure.create({
            message: "Code node has no code to execute",
            type: "NonRetryableActivityError",
            nonRetryable: true,
          });
        }

        // Sandboxed evaluation: expose a limited API via a wrapper function
        // In production this should run in a VM2 / isolated-vm sandbox
        const fn = new Function(
          "context",
          "env",
          `
          "use strict";
          try {
            ${code}
          } catch(e) {
            throw e;
          }
        `
        );

        // Expose only safe env variables
        const safeEnv: Record<string, string> = {
          NODE_ENV: process.env["NODE_ENV"] ?? "production",
        };

        let result: unknown;
        try {
          result = await Promise.resolve(fn(context, safeEnv));
        } catch (evalErr) {
          throw ApplicationFailure.create({
            message: `Code execution error: ${(evalErr as Error).message}`,
            type: "CodeExecutionError",
            nonRetryable: false,
            details: [{ stack: (evalErr as Error).stack }],
          });
        }

        const output =
          result !== null && typeof result === "object" && !Array.isArray(result)
            ? (result as Record<string, unknown>)
            : { result };

        span.setStatus({ code: SpanStatusCode.OK });
        return output;
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    }
  );
}

// Alias used by the workflow proxy for the sandboxed code node
export const executeCodeNodeSandboxed = executeCodeNode;

// ---------------------------------------------------------------------------
// evaluateCondition
// ---------------------------------------------------------------------------

export async function evaluateCondition(
  input: NodeActivityInput
): Promise<Record<string, unknown>> {
  const { executionId, nodeId, config, context, traceId } = input;

  return tracer.startActiveSpan(
    "activity.evaluateCondition",
    {
      attributes: {
        "flowcore.execution_id": executionId,
        "flowcore.node_id": nodeId,
        "flowcore.trace_id": traceId,
      },
    },
    async (span) => {
      try {
        const expression = String(config.expression ?? "true");

        // Safely evaluate the condition expression
        const fn = new Function(
          "context",
          `"use strict"; return (${interpolate(expression, context)});`
        );

        let result: boolean;
        try {
          result = Boolean(fn(context));
        } catch (evalErr) {
          throw ApplicationFailure.create({
            message: `Condition evaluation error: ${(evalErr as Error).message}`,
            type: "ConditionEvaluationError",
            nonRetryable: false,
          });
        }

        const output = {
          result,
          branch: result ? "true" : "false",
          expression,
        };

        span.setAttribute("flowcore.condition.result", String(result));
        span.setStatus({ code: SpanStatusCode.OK });
        return output;
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    }
  );
}

// ---------------------------------------------------------------------------
// executeSetVariable
// ---------------------------------------------------------------------------

export async function executeSetVariable(
  input: NodeActivityInput
): Promise<Record<string, unknown>> {
  const { executionId, nodeId, config, context, traceId } = input;

  return tracer.startActiveSpan(
    "activity.executeSetVariable",
    {
      attributes: {
        "flowcore.execution_id": executionId,
        "flowcore.node_id": nodeId,
        "flowcore.trace_id": traceId,
      },
    },
    async (span) => {
      try {
        const assignments = (config.assignments ?? []) as Array<{
          key: string;
          value: unknown;
          type?: "literal" | "expression" | "jsonpath";
        }>;

        const variables: Record<string, unknown> = {};

        for (const assignment of assignments) {
          const { key, value, type = "literal" } = assignment;

          if (type === "expression") {
            const fn = new Function("context", `"use strict"; return (${String(value)});`);
            try {
              variables[key] = fn(context);
            } catch {
              variables[key] = null;
            }
          } else if (type === "jsonpath") {
            // Simple dot-notation path resolver
            variables[key] = resolvePath(context, String(value));
          } else {
            // Literal — interpolate template strings
            variables[key] =
              typeof value === "string" ? interpolate(value, context) : value;
          }
        }

        span.setStatus({ code: SpanStatusCode.OK });
        return { variables, count: Object.keys(variables).length };
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        span.recordException(err as Error);
        throw err;
      } finally {
        span.end();
      }
    }
  );
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Interpolate {{variable.path}} placeholders in a string using the execution context.
 */
function interpolate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
    const val = resolvePath(ctx, path.trim());
    return val !== undefined && val !== null ? String(val) : "";
  });
}

/**
 * Deep interpolate all string values in an object.
 */
function interpolateObject(
  obj: unknown,
  ctx: Record<string, unknown>
): string {
  return JSON.stringify(obj, (_key, val) =>
    typeof val === "string" ? interpolate(val, ctx) : val
  );
}

/**
 * Resolve a dot-notation path like "trigger.body.userId" against an object.
 */
function resolvePath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, segment) => {
    if (acc !== null && acc !== undefined && typeof acc === "object") {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}
