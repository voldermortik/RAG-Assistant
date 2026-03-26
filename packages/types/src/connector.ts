import { type z } from "zod";

// ---------------------------------------------------------------------------
// Connector categories
// ---------------------------------------------------------------------------

export type ConnectorCategory =
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

// ---------------------------------------------------------------------------
// Auth config
// ---------------------------------------------------------------------------

export type AuthType = "oauth2" | "apiKey" | "basicAuth" | "custom" | "none";

export interface OAuth2Config {
  type: "oauth2";
  authorizationUrl: string;
  tokenUrl: string;
  refreshUrl?: string;
  revokeUrl?: string;
  scopes: string[];
  defaultScopes: string[];
  clientId: string;
  /** Client secret — injected at runtime from env, never stored in connector meta */
  clientSecret: string;
  pkce: boolean;
  additionalAuthParams?: Record<string, string>;
  additionalTokenParams?: Record<string, string>;
}

export interface ApiKeyConfig {
  type: "apiKey";
  /** Where to transmit the key: HTTP header, query param, or request body */
  in: "header" | "query" | "body";
  /** Parameter name, e.g. "X-API-Key", "api_key", "token" */
  paramName: string;
  /** Human-readable label shown in the credentials form */
  label: string;
  placeholder?: string;
}

export interface BasicAuthConfig {
  type: "basicAuth";
  usernameLabel?: string;
  passwordLabel?: string;
}

export interface CustomAuthConfig {
  type: "custom";
  fields: Array<{
    key: string;
    label: string;
    type: "text" | "password" | "url" | "select";
    options?: string[];
    required: boolean;
    placeholder?: string;
  }>;
}

export interface NoAuthConfig {
  type: "none";
}

export type AuthConfig =
  | OAuth2Config
  | ApiKeyConfig
  | BasicAuthConfig
  | CustomAuthConfig
  | NoAuthConfig;

// ---------------------------------------------------------------------------
// Credentials — the resolved secrets passed to execute/subscribe
// ---------------------------------------------------------------------------

export interface Credentials {
  /** Raw key/value pairs after resolving from the vault */
  [key: string]: string;
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

export type TriggerType = "polling" | "webhook" | "realtime";

export interface Trigger {
  id: string;
  name: string;
  description: string;
  type: TriggerType;
  /** Zod schema describing the data emitted by this trigger */
  outputSchema: z.ZodSchema;
  /** Zod schema for user-provided filter/config options */
  configSchema?: z.ZodSchema;
  /**
   * For polling triggers: how often to check (seconds).
   * Overridable by the user up to plan limits.
   */
  defaultPollIntervalSeconds?: number;
  /**
   * Subscribe is called once when the workflow is activated.
   * Return an unsubscribe function for realtime/webhook triggers.
   */
  subscribe: (
    config: unknown,
    credentials: Credentials,
    emit: (payload: unknown) => void,
  ) => Promise<(() => Promise<void>) | void>;
}

// ---------------------------------------------------------------------------
// Action — matches the exact interface from the strategy doc
// ---------------------------------------------------------------------------

export interface Action {
  id: string;
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  outputSchema: z.ZodSchema;
  execute: (input: unknown, credentials: Credentials) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// FlowCoreConnector — matches the exact interface from the strategy doc
// ---------------------------------------------------------------------------

export interface FlowCoreConnector {
  meta: {
    id: string; // e.g. "slack"
    name: string; // e.g. "Slack"
    version: string; // semver
    icon: string; // SVG string
    category: ConnectorCategory;
    docsUrl: string;
  };
  auth: AuthConfig;
  triggers: Trigger[];
  actions: Action[];
}
