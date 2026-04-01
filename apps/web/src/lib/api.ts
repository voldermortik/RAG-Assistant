import { getSession } from "next-auth/react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (typeof window !== "undefined") {
    const session = await getSession();
    const accessToken = (session as typeof session & { accessToken?: string })
      ?.accessToken;
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
  }

  return headers;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const url = `${API_URL}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders,
      ...options.headers,
    },
  });

  if (!res.ok) {
    let errorData: unknown;
    try {
      errorData = await res.json();
    } catch {
      errorData = { message: res.statusText };
    }
    const message =
      (errorData as { message?: string })?.message ?? res.statusText;
    throw new ApiError(res.status, message, errorData);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkflowStatus = "active" | "inactive" | "draft";
export type ExecutionStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "cancelled";
export type TriggerType = "manual" | "schedule" | "webhook" | "event";
export type CredentialType = "apiKey" | "oauth2" | "basic" | "custom";
export type MemberRole = "owner" | "admin" | "member" | "viewer";

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  definition: Record<string, unknown>;
  lastRunAt?: string;
  lastRunStatus?: ExecutionStatus;
  createdAt: string;
  updatedAt: string;
  orgId: string;
  createdBy: string;
}

export interface WorkflowListItem {
  id: string;
  name: string;
  description?: string;
  status: WorkflowStatus;
  lastRunAt?: string;
  lastRunStatus?: ExecutionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Execution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: ExecutionStatus;
  triggerType: TriggerType;
  triggeredAt: string;
  completedAt?: string;
  durationMs?: number;
  steps: ExecutionStep[];
}

export interface ExecutionListItem {
  id: string;
  workflowId: string;
  workflowName: string;
  status: ExecutionStatus;
  triggerType: TriggerType;
  triggeredAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface ExecutionStep {
  id: string;
  nodeId: string;
  nodeName: string;
  status: ExecutionStatus;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}

export interface Credential {
  id: string;
  name: string;
  type: CredentialType;
  connector?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCredentialPayload {
  name: string;
  type: CredentialType;
  connector?: string;
  value: Record<string, string>;
}

export interface OrgMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  image?: string;
  role: MemberRole;
  joinedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  plan: "free" | "pro" | "enterprise";
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ─── Workflows API ────────────────────────────────────────────────────────────

export const workflowsApi = {
  list: (params?: { page?: number; pageSize?: number; status?: WorkflowStatus }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
    if (params?.status) qs.set("status", params.status);
    return request<PaginatedResponse<WorkflowListItem>>(
      `/api/v1/workflows?${qs.toString()}`
    );
  },
  get: (id: string) =>
    request<Workflow>(`/api/v1/workflows/${id}`),
  create: (payload: Partial<Workflow>) =>
    request<Workflow>("/api/v1/workflows", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: Partial<Workflow>) =>
    request<Workflow>(`/api/v1/workflows/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  delete: (id: string) =>
    request<void>(`/api/v1/workflows/${id}`, { method: "DELETE" }),
  trigger: (id: string) =>
    request<Execution>(`/api/v1/workflows/${id}/trigger`, { method: "POST" }),
};

// ─── Executions API ───────────────────────────────────────────────────────────

export const executionsApi = {
  list: (params?: {
    page?: number;
    pageSize?: number;
    workflowId?: string;
    status?: ExecutionStatus;
  }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
    if (params?.workflowId) qs.set("workflowId", params.workflowId);
    if (params?.status) qs.set("status", params.status);
    return request<PaginatedResponse<ExecutionListItem>>(
      `/api/v1/executions?${qs.toString()}`
    );
  },
  get: (id: string) =>
    request<Execution>(`/api/v1/executions/${id}`),
  cancel: (id: string) =>
    request<Execution>(`/api/v1/executions/${id}/cancel`, { method: "POST" }),
};

// ─── Credentials API ──────────────────────────────────────────────────────────

export const credentialsApi = {
  list: () => request<Credential[]>("/api/v1/credentials"),
  create: (payload: CreateCredentialPayload) =>
    request<Credential>("/api/v1/credentials", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  delete: (id: string) =>
    request<void>(`/api/v1/credentials/${id}`, { method: "DELETE" }),
};

// ─── Organization API ─────────────────────────────────────────────────────────

export const orgApi = {
  get: () => request<Organization>("/api/v1/org"),
  update: (payload: Partial<Organization>) =>
    request<Organization>("/api/v1/org", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  create: (payload: { name: string; slug: string }) =>
    request<Organization>("/api/v1/org", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  members: {
    list: () => request<OrgMember[]>("/api/v1/org/members"),
    invite: (payload: { email: string; role: MemberRole }) =>
      request<OrgMember>("/api/v1/org/members/invite", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    updateRole: (userId: string, role: MemberRole) =>
      request<OrgMember>(`/api/v1/org/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    remove: (userId: string) =>
      request<void>(`/api/v1/org/members/${userId}`, { method: "DELETE" }),
  },
};

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  register: (payload: {
    name: string;
    email: string;
    password: string;
  }) =>
    request<{ user: { id: string; email: string; name: string } }>(
      "/api/v1/auth/register",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    ),
};
