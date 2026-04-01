import { z } from "zod";

// ---------------------------------------------------------------------------
// Local type definitions (mirrors packages/types connector.ts)
// ---------------------------------------------------------------------------

type ConnectorCategory =
  | "communication"
  | "crm"
  | "database"
  | "devops"
  | "ecommerce"
  | "finance"
  | "hr"
  | "marketing"
  | "productivity"
  | "storage"
  | "analytics"
  | "ai_ml"
  | "security"
  | "utility";

interface NoAuthConfig {
  type: "none";
}

type AuthConfig = NoAuthConfig;

interface Credentials {
  [key: string]: string;
}

interface Trigger {
  id: string;
  name: string;
  description: string;
  type: "polling" | "webhook" | "realtime";
  outputSchema: z.ZodSchema;
  configSchema?: z.ZodSchema;
  defaultPollIntervalSeconds?: number;
  subscribe: (
    config: unknown,
    credentials: Credentials,
    emit: (payload: unknown) => void,
  ) => Promise<(() => Promise<void>) | void>;
}

interface Action {
  id: string;
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  outputSchema: z.ZodSchema;
  execute: (input: unknown, credentials: Credentials) => Promise<unknown>;
}

interface FlowCoreConnector {
  meta: {
    id: string;
    name: string;
    version: string;
    icon: string;
    category: ConnectorCategory;
    docsUrl: string;
  };
  auth: AuthConfig;
  triggers: Trigger[];
  actions: Action[];
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const RequestInputSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  url: z.string().url({ message: "url must be a valid URL" }),
  headers: z.record(z.string()).optional(),
  body: z.unknown().optional(),
  auth_type: z.enum(["bearer", "basic", "apikey", "none"]).optional().default("none"),
  /** For bearer: the token; for basic: "username:password"; for apikey: the key value */
  auth_value: z.string().optional(),
  /** For apikey auth: the header name to use (defaults to X-API-Key) */
  auth_header_name: z.string().optional().default("X-API-Key"),
  /** Timeout in milliseconds (defaults to 30 000) */
  timeout_ms: z.number().int().positive().optional().default(30_000),
  /** Follow redirects (defaults to true) */
  follow_redirects: z.boolean().optional().default(true),
});

const RequestOutputSchema = z.object({
  status: z.number(),
  headers: z.record(z.string()),
  body: z.unknown(),
  duration_ms: z.number(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAuthHeaders(
  authType: "bearer" | "basic" | "apikey" | "none",
  authValue: string | undefined,
  authHeaderName: string,
): Record<string, string> {
  if (!authValue || authType === "none") return {};

  switch (authType) {
    case "bearer":
      return { Authorization: `Bearer ${authValue}` };
    case "basic": {
      const encoded = Buffer.from(authValue).toString("base64");
      return { Authorization: `Basic ${encoded}` };
    }
    case "apikey":
      return { [authHeaderName]: authValue };
    default:
      return {};
  }
}

async function executeRequest(rawInput: unknown, _credentials: Credentials): Promise<unknown> {
  const input = RequestInputSchema.parse(rawInput);

  const authHeaders = buildAuthHeaders(
    input.auth_type,
    input.auth_value,
    input.auth_header_name,
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "FlowCore-HTTP-Connector/0.1.0",
    ...authHeaders,
    ...(input.headers ?? {}),
  };

  const hasBody =
    input.body !== undefined &&
    input.body !== null &&
    !["GET", "DELETE"].includes(input.method);

  const requestInit: RequestInit = {
    method: input.method,
    headers,
    body: hasBody ? JSON.stringify(input.body) : undefined,
    redirect: input.follow_redirects ? "follow" : "manual",
    signal: AbortSignal.timeout(input.timeout_ms),
  };

  const startedAt = Date.now();

  const response = await fetch(input.url, requestInit);

  const duration_ms = Date.now() - startedAt;

  // Collect response headers
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  // Parse body — attempt JSON, fall back to text
  let body: unknown;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await response.json() as unknown;
  } else {
    body = await response.text();
  }

  return RequestOutputSchema.parse({
    status: response.status,
    headers: responseHeaders,
    body,
    duration_ms,
  });
}

// ---------------------------------------------------------------------------
// Connector definition
// ---------------------------------------------------------------------------

const httpConnector: FlowCoreConnector = {
  meta: {
    id: "http",
    name: "HTTP / Webhook",
    version: "0.1.0",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    category: "utility",
    docsUrl: "https://docs.flowcore.io/connectors/http",
  },

  auth: {
    type: "none",
  },

  triggers: [],

  actions: [
    {
      id: "request",
      name: "HTTP Request",
      description:
        "Send an HTTP request (GET, POST, PUT, PATCH, DELETE) to any URL. Auth can be embedded in the request config via auth_type and auth_value.",
      inputSchema: RequestInputSchema,
      outputSchema: RequestOutputSchema,
      execute: executeRequest,
    },
  ],
};

export default httpConnector;
export type { FlowCoreConnector };
