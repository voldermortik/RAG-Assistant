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

interface OAuth2Config {
  type: "oauth2";
  authorizationUrl: string;
  tokenUrl: string;
  refreshUrl?: string;
  revokeUrl?: string;
  scopes: string[];
  defaultScopes: string[];
  clientId: string;
  clientSecret: string;
  pkce: boolean;
  additionalAuthParams?: Record<string, string>;
  additionalTokenParams?: Record<string, string>;
}

type AuthConfig = OAuth2Config;

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
// Constants
// ---------------------------------------------------------------------------

const SLACK_API_BASE = "https://slack.com/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBotToken(credentials: Credentials): string {
  const token = credentials["access_token"] ?? credentials["bot_token"];
  if (!token) {
    throw new Error(
      "Slack credentials must contain access_token or bot_token",
    );
  }
  return token;
}

async function slackPost<T>(
  endpoint: string,
  payload: Record<string, unknown>,
  token: string,
): Promise<T> {
  const response = await fetch(`${SLACK_API_BASE}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Slack API HTTP error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { ok: boolean; error?: string } & T;

  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error ?? "unknown_error"}`);
  }

  return data;
}

async function slackGet<T>(endpoint: string, params: Record<string, string>, token: string): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const url = `${SLACK_API_BASE}/${endpoint}${qs ? `?${qs}` : ""}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(
      `Slack API HTTP error: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { ok: boolean; error?: string } & T;

  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error ?? "unknown_error"}`);
  }

  return data;
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

// send_message
const SendMessageInputSchema = z.object({
  channel: z.string().min(1, "channel is required"),
  text: z.string().min(1, "text is required"),
  blocks: z.array(z.unknown()).optional(),
  thread_ts: z.string().optional(),
  mrkdwn: z.boolean().optional().default(true),
});

const SendMessageOutputSchema = z.object({
  ok: z.boolean(),
  channel: z.string(),
  ts: z.string(),
  message: z.unknown(),
});

// post_message (alias with channel_id naming)
const PostMessageInputSchema = z.object({
  channel_id: z.string().min(1, "channel_id is required"),
  text: z.string().min(1, "text is required"),
  blocks: z.array(z.unknown()).optional(),
  thread_ts: z.string().optional(),
  mrkdwn: z.boolean().optional().default(true),
});

const PostMessageOutputSchema = SendMessageOutputSchema;

// list_channels
const ListChannelsInputSchema = z.object({
  exclude_archived: z.boolean().optional().default(true),
  types: z.string().optional().default("public_channel,private_channel"),
  limit: z.number().int().positive().max(1000).optional().default(200),
  cursor: z.string().optional(),
});

const ListChannelsOutputSchema = z.object({
  channels: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
  next_cursor: z.string().optional(),
});

// Webhook trigger output schemas
const MessageReceivedOutputSchema = z.object({
  type: z.string(),
  channel: z.string(),
  user: z.string().optional(),
  text: z.string(),
  ts: z.string(),
  team: z.string().optional(),
  event_ts: z.string().optional(),
  channel_type: z.string().optional(),
});

const ReactionAddedOutputSchema = z.object({
  type: z.string(),
  user: z.string(),
  reaction: z.string(),
  item_user: z.string().optional(),
  item: z.object({
    type: z.string(),
    channel: z.string().optional(),
    ts: z.string().optional(),
  }),
  event_ts: z.string(),
});

// ---------------------------------------------------------------------------
// Action implementations
// ---------------------------------------------------------------------------

async function sendMessage(rawInput: unknown, credentials: Credentials): Promise<unknown> {
  const input = SendMessageInputSchema.parse(rawInput);
  const token = getBotToken(credentials);

  const payload: Record<string, unknown> = {
    channel: input.channel,
    text: input.text,
    mrkdwn: input.mrkdwn,
  };
  if (input.blocks) payload["blocks"] = input.blocks;
  if (input.thread_ts) payload["thread_ts"] = input.thread_ts;

  const result = await slackPost<{
    channel: string;
    ts: string;
    message: unknown;
  }>("chat.postMessage", payload, token);

  return SendMessageOutputSchema.parse({ ok: true, ...result });
}

async function postMessage(rawInput: unknown, credentials: Credentials): Promise<unknown> {
  const input = PostMessageInputSchema.parse(rawInput);
  // Delegate to sendMessage, mapping channel_id → channel
  return sendMessage(
    {
      channel: input.channel_id,
      text: input.text,
      blocks: input.blocks,
      thread_ts: input.thread_ts,
      mrkdwn: input.mrkdwn,
    },
    credentials,
  );
}

async function listChannels(rawInput: unknown, credentials: Credentials): Promise<unknown> {
  const input = ListChannelsInputSchema.parse(rawInput);
  const token = getBotToken(credentials);

  const params: Record<string, string> = {
    exclude_archived: String(input.exclude_archived),
    types: input.types,
    limit: String(input.limit),
  };
  if (input.cursor) params["cursor"] = input.cursor;

  const result = await slackGet<{
    channels: Array<{ id: string; name: string; [key: string]: unknown }>;
    response_metadata?: { next_cursor?: string };
  }>("conversations.list", params, token);

  return ListChannelsOutputSchema.parse({
    channels: result.channels.map((c) => ({ id: c["id"] ?? "", name: c["name"] ?? "" })),
    next_cursor: result.response_metadata?.next_cursor ?? undefined,
  });
}

// ---------------------------------------------------------------------------
// Connector definition
// ---------------------------------------------------------------------------

const slackConnector: FlowCoreConnector = {
  meta: {
    id: "slack",
    name: "Slack",
    version: "0.1.0",
    icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>`,
    category: "communication",
    docsUrl: "https://docs.flowcore.io/connectors/slack",
  },

  auth: {
    type: "oauth2",
    authorizationUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    refreshUrl: undefined,
    revokeUrl: "https://slack.com/api/auth.revoke",
    scopes: [
      "chat:write",
      "channels:read",
      "channels:history",
      "reactions:read",
      "groups:read",
      "im:read",
      "mpim:read",
    ],
    defaultScopes: ["chat:write", "channels:read", "reactions:read"],
    clientId: process.env["SLACK_CLIENT_ID"] ?? "",
    clientSecret: process.env["SLACK_CLIENT_SECRET"] ?? "",
    pkce: false,
    additionalAuthParams: { "user_scope": "" },
  },

  triggers: [
    {
      id: "message_received",
      name: "Message Received",
      description:
        "Fires when a message is posted to a channel the app belongs to. Delivered via Slack Events API webhook.",
      type: "webhook",
      outputSchema: MessageReceivedOutputSchema,
      configSchema: z.object({
        channel: z.string().optional().describe("Optional: restrict to a specific channel ID"),
      }),
      subscribe: async (_config, _credentials, _emit) => {
        // Webhook-based: the FlowCore engine registers a webhook URL with the
        // Slack Events API (event type: message.channels). The engine calls emit()
        // when it receives a POST to the registered endpoint. No polling needed.
      },
    },
    {
      id: "reaction_added",
      name: "Reaction Added",
      description:
        "Fires when a reaction emoji is added to any message. Delivered via Slack Events API webhook.",
      type: "webhook",
      outputSchema: ReactionAddedOutputSchema,
      subscribe: async (_config, _credentials, _emit) => {
        // Webhook-based via Slack Events API (event type: reaction_added).
      },
    },
  ],

  actions: [
    {
      id: "send_message",
      name: "Send Message",
      description:
        "Post a message to a Slack channel or DM. Supports plain text, mrkdwn, and Block Kit blocks.",
      inputSchema: SendMessageInputSchema,
      outputSchema: SendMessageOutputSchema,
      execute: sendMessage,
    },
    {
      id: "post_message",
      name: "Post Message",
      description:
        "Post a message to a Slack channel by channel ID. Alias for send_message with explicit channel_id naming.",
      inputSchema: PostMessageInputSchema,
      outputSchema: PostMessageOutputSchema,
      execute: postMessage,
    },
    {
      id: "list_channels",
      name: "List Channels",
      description: "Retrieve a list of channels (public and private) accessible to the bot.",
      inputSchema: ListChannelsInputSchema,
      outputSchema: ListChannelsOutputSchema,
      execute: listChannels,
    },
  ],
};

export default slackConnector;
export type { FlowCoreConnector };
