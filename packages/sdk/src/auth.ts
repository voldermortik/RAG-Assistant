import {
  type AuthConfig,
  type OAuth2Config,
  type ApiKeyConfig,
  type BasicAuthConfig,
  type Credentials,
} from "@flowcore/types";
import { authFailedError, authExpiredError } from "./errors.js";

// ---------------------------------------------------------------------------
// Auth helper return types
// ---------------------------------------------------------------------------

export interface ResolvedOAuth2Credentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  tokenType: string;
  scope?: string;
}

export interface TokenRefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

// ---------------------------------------------------------------------------
// OAuth2 helper
// ---------------------------------------------------------------------------

/**
 * Exchange an authorisation code for tokens (Authorization Code flow).
 */
export async function exchangeCodeForTokens(
  config: OAuth2Config,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<ResolvedOAuth2Credentials> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  if (codeVerifier !== undefined && config.pkce) {
    params.set("code_verifier", codeVerifier);
  }

  if (config.additionalTokenParams !== undefined) {
    for (const [key, value] of Object.entries(config.additionalTokenParams)) {
      params.set(key, value);
    }
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw authFailedError(
      `OAuth2 token exchange failed (${response.status.toString()}): ${body}`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  return parseTokenResponse(data);
}

/**
 * Refresh an existing access token using the refresh token.
 */
export async function refreshAccessToken(
  config: OAuth2Config,
  refreshToken: string,
): Promise<TokenRefreshResult> {
  if (config.refreshUrl === undefined && config.tokenUrl === "") {
    throw authExpiredError("No refresh URL configured for this connector");
  }

  const url = config.refreshUrl ?? config.tokenUrl;

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw authExpiredError(
      `OAuth2 token refresh failed (${response.status.toString()}): ${body}`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const parsed = parseTokenResponse(data);

  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken ?? refreshToken,
    expiresAt: parsed.expiresAt,
  };
}

/**
 * Build the authorization URL for the Authorization Code flow.
 */
export function buildAuthorizationUrl(
  config: OAuth2Config,
  redirectUri: string,
  state: string,
  scopes?: string[],
  codeChallenge?: string,
): string {
  const effectiveScopes = scopes ?? config.defaultScopes;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: effectiveScopes.join(" "),
    state,
  });

  if (codeChallenge !== undefined && config.pkce) {
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }

  if (config.additionalAuthParams !== undefined) {
    for (const [key, value] of Object.entries(config.additionalAuthParams)) {
      params.set(key, value);
    }
  }

  return `${config.authorizationUrl}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Header injection helpers
// ---------------------------------------------------------------------------

/**
 * Inject auth credentials into a Headers object based on the connector's
 * AuthConfig and the resolved Credentials.
 */
export function injectAuthHeaders(
  headers: Headers,
  authConfig: AuthConfig,
  credentials: Credentials,
): void {
  switch (authConfig.type) {
    case "oauth2": {
      const token = credentials["accessToken"];
      if (token === undefined) {
        throw authFailedError("No accessToken found in credentials");
      }
      headers.set("Authorization", `Bearer ${token}`);
      break;
    }
    case "apiKey": {
      const keyConfig = authConfig as ApiKeyConfig;
      const apiKey = credentials[keyConfig.paramName];
      if (apiKey === undefined) {
        throw authFailedError(`No ${keyConfig.paramName} found in credentials`);
      }
      if (keyConfig.in === "header") {
        headers.set(keyConfig.paramName, apiKey);
      }
      break;
    }
    case "basicAuth": {
      const basicConfig = authConfig as BasicAuthConfig;
      const usernameKey = basicConfig.usernameLabel ?? "username";
      const passwordKey = basicConfig.passwordLabel ?? "password";
      const username = credentials[usernameKey] ?? "";
      const password = credentials[passwordKey] ?? "";
      const encoded = Buffer.from(`${username}:${password}`).toString("base64");
      headers.set("Authorization", `Basic ${encoded}`);
      break;
    }
    case "custom":
    case "none":
      break;
  }
}

/**
 * Inject API key into query parameters if the auth config specifies `in: "query"`.
 */
export function injectApiKeyQueryParam(
  searchParams: URLSearchParams,
  authConfig: AuthConfig,
  credentials: Credentials,
): void {
  if (authConfig.type !== "apiKey") return;

  const keyConfig = authConfig as ApiKeyConfig;
  if (keyConfig.in !== "query") return;

  const apiKey = credentials[keyConfig.paramName];
  if (apiKey === undefined) {
    throw authFailedError(`No ${keyConfig.paramName} found in credentials`);
  }
  searchParams.set(keyConfig.paramName, apiKey);
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random code verifier (RFC 7636).
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Derive the code challenge from a verifier using SHA-256 (RFC 7636 S256).
 */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function base64UrlEncode(buffer: Uint8Array): string {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function parseTokenResponse(data: Record<string, unknown>): ResolvedOAuth2Credentials {
  const accessToken = data["access_token"];
  if (typeof accessToken !== "string") {
    throw authFailedError("Token response did not contain access_token");
  }

  const tokenType = typeof data["token_type"] === "string" ? data["token_type"] : "Bearer";
  const refreshToken = typeof data["refresh_token"] === "string" ? data["refresh_token"] : undefined;
  const scope = typeof data["scope"] === "string" ? data["scope"] : undefined;

  let expiresAt: Date | undefined;
  if (typeof data["expires_in"] === "number") {
    expiresAt = new Date(Date.now() + data["expires_in"] * 1000);
  }

  return { accessToken, tokenType, refreshToken, expiresAt, scope };
}
