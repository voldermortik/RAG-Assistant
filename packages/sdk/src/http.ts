import { type AuthConfig, type Credentials } from "@flowcore/types";
import { injectAuthHeaders, injectApiKeyQueryParam } from "./auth.js";
import {
  ConnectorError,
  httpError,
  networkError,
  rateLimitedError,
  parseError,
} from "./errors.js";

// ---------------------------------------------------------------------------
// HTTP client configuration
// ---------------------------------------------------------------------------

export interface HttpClientConfig {
  baseUrl: string;
  authConfig?: AuthConfig;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;
  /** Maximum number of retries on 5xx/429 responses */
  maxRetries?: number;
  /** Initial backoff delay in ms for retry logic */
  initialRetryDelayMs?: number;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface HttpRequestOptions {
  method?: HttpMethod;
  path: string;
  queryParams?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  /** Override the base timeout for this specific request */
  timeoutMs?: number;
  /** Set to false to skip auth injection for this request */
  auth?: boolean;
}

export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  headers: Headers;
}

// ---------------------------------------------------------------------------
// FlowCore HTTP client
// ---------------------------------------------------------------------------

/**
 * Thin HTTP client used inside connector action / trigger implementations.
 * Handles auth injection, JSON serialization, timeout, and retryable errors.
 */
export class HttpClient {
  private readonly config: Required<HttpClientConfig>;

  constructor(config: HttpClientConfig) {
    this.config = {
      authConfig: { type: "none" },
      defaultHeaders: {},
      timeoutMs: 30_000,
      maxRetries: 3,
      initialRetryDelayMs: 500,
      ...config,
    };
  }

  async get<T>(path: string, options?: Omit<HttpRequestOptions, "method" | "path" | "body">): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: "GET", path });
  }

  async post<T>(path: string, body?: unknown, options?: Omit<HttpRequestOptions, "method" | "path" | "body">): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: "POST", path, body });
  }

  async put<T>(path: string, body?: unknown, options?: Omit<HttpRequestOptions, "method" | "path" | "body">): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: "PUT", path, body });
  }

  async patch<T>(path: string, body?: unknown, options?: Omit<HttpRequestOptions, "method" | "path" | "body">): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: "PATCH", path, body });
  }

  async delete<T>(path: string, options?: Omit<HttpRequestOptions, "method" | "path" | "body">): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, method: "DELETE", path });
  }

  async request<T>(options: HttpRequestOptions, credentials?: Credentials): Promise<HttpResponse<T>> {
    const method = options.method ?? "GET";
    const applyAuth = options.auth !== false;

    let url = buildUrl(this.config.baseUrl, options.path, options.queryParams);

    // Inject API key into query string if needed
    if (applyAuth && credentials !== undefined && this.config.authConfig.type === "apiKey") {
      const searchParams = new URLSearchParams(new URL(url).search);
      injectApiKeyQueryParam(searchParams, this.config.authConfig, credentials);
      const urlObj = new URL(url);
      urlObj.search = searchParams.toString();
      url = urlObj.toString();
    }

    const headers = new Headers({
      "Content-Type": "application/json",
      Accept: "application/json",
      ...this.config.defaultHeaders,
      ...options.headers,
    });

    if (applyAuth && credentials !== undefined) {
      injectAuthHeaders(headers, this.config.authConfig, credentials);
    }

    const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : undefined;

    let lastError: ConnectorError | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.config.initialRetryDelayMs * Math.pow(2, attempt - 1);
        await sleep(delay);
      }

      const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => { controller.abort(); }, timeoutMs);

      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          body: bodyStr,
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === "AbortError") {
          lastError = new ConnectorError({
            code: "HTTP_TIMEOUT",
            message: `Request timed out after ${timeoutMs.toString()}ms`,
            cause: err,
            retryable: true,
          });
        } else {
          lastError = networkError(`Network error: ${err instanceof Error ? err.message : String(err)}`, err);
        }

        if (attempt < this.config.maxRetries) continue;
        throw lastError;
      }
      clearTimeout(timeoutId);

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get("Retry-After");
        const retryAfterMs = retryAfterHeader !== null ? parseRetryAfter(retryAfterHeader) : undefined;
        lastError = rateLimitedError(retryAfterMs);
        if (attempt < this.config.maxRetries) {
          if (retryAfterMs !== undefined) await sleep(retryAfterMs);
          continue;
        }
        throw lastError;
      }

      if (response.status >= 500) {
        const body = await safeReadBody(response);
        lastError = httpError(response.status, `Upstream server error (${response.status.toString()})`, body);
        if (attempt < this.config.maxRetries) continue;
        throw lastError;
      }

      if (!response.ok) {
        const body = await safeReadBody(response);
        throw httpError(response.status, `HTTP ${response.status.toString()} ${response.statusText}`, body);
      }

      const contentType = response.headers.get("Content-Type") ?? "";
      let data: T;

      if (response.status === 204 || response.headers.get("Content-Length") === "0") {
        data = undefined as unknown as T;
      } else if (contentType.includes("application/json")) {
        try {
          data = (await response.json()) as T;
        } catch (err) {
          throw parseError("Failed to parse JSON response", err);
        }
      } else {
        data = (await response.text()) as unknown as T;
      }

      return { data, status: response.status, headers: response.headers };
    }

    // This path is unreachable but satisfies the TypeScript control flow
    throw lastError ?? networkError("Unexpected error in HTTP client");
  }
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Create an HttpClient pre-bound to credentials so connector actions don't
 * have to pass credentials on every call.
 */
export function createHttpClient(
  config: HttpClientConfig,
  credentials: Credentials,
): {
  get: <T>(path: string, options?: Omit<HttpRequestOptions, "method" | "path" | "body">) => Promise<HttpResponse<T>>;
  post: <T>(path: string, body?: unknown, options?: Omit<HttpRequestOptions, "method" | "path" | "body">) => Promise<HttpResponse<T>>;
  put: <T>(path: string, body?: unknown, options?: Omit<HttpRequestOptions, "method" | "path" | "body">) => Promise<HttpResponse<T>>;
  patch: <T>(path: string, body?: unknown, options?: Omit<HttpRequestOptions, "method" | "path" | "body">) => Promise<HttpResponse<T>>;
  delete: <T>(path: string, options?: Omit<HttpRequestOptions, "method" | "path" | "body">) => Promise<HttpResponse<T>>;
} {
  const client = new HttpClient(config);
  return {
    get: <T>(path: string, options?: Omit<HttpRequestOptions, "method" | "path" | "body">) =>
      client.request<T>({ ...options, method: "GET", path }, credentials),
    post: <T>(path: string, body?: unknown, options?: Omit<HttpRequestOptions, "method" | "path" | "body">) =>
      client.request<T>({ ...options, method: "POST", path, body }, credentials),
    put: <T>(path: string, body?: unknown, options?: Omit<HttpRequestOptions, "method" | "path" | "body">) =>
      client.request<T>({ ...options, method: "PUT", path, body }, credentials),
    patch: <T>(path: string, body?: unknown, options?: Omit<HttpRequestOptions, "method" | "path" | "body">) =>
      client.request<T>({ ...options, method: "PATCH", path, body }, credentials),
    delete: <T>(path: string, options?: Omit<HttpRequestOptions, "method" | "path" | "body">) =>
      client.request<T>({ ...options, method: "DELETE", path }, credentials),
  };
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

function buildUrl(
  baseUrl: string,
  path: string,
  queryParams?: Record<string, string | number | boolean | undefined>,
): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);

  if (queryParams !== undefined) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

function parseRetryAfter(header: string): number {
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return seconds * 1000;
  const date = new Date(header);
  if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());
  return 5_000;
}

async function safeReadBody(response: Response): Promise<unknown> {
  try {
    const ct = response.headers.get("Content-Type") ?? "";
    if (ct.includes("application/json")) return (await response.json()) as unknown;
    return await response.text();
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
