/**
 * RS256 JWT sign/verify helpers using jose
 */
import {
  SignJWT,
  jwtVerify,
  importPKCS8,
  importSPKI,
  type JWTPayload,
} from "jose";
import { env } from "../env.js";

export interface AccessTokenPayload extends JWTPayload {
  sub: string; // userId
  tenantId: string;
  email: string;
  role: string;
  type: "access";
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string; // userId
  tenantId: string;
  type: "refresh";
  jti: string; // token family for rotation
}

let cachedPrivateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;
let cachedPublicKey: Awaited<ReturnType<typeof importSPKI>> | null = null;

async function getPrivateKey() {
  if (!cachedPrivateKey) {
    cachedPrivateKey = await importPKCS8(env.JWT_PRIVATE_KEY, "RS256");
  }
  return cachedPrivateKey;
}

async function getPublicKey() {
  if (!cachedPublicKey) {
    cachedPublicKey = await importSPKI(env.JWT_PUBLIC_KEY, "RS256");
  }
  return cachedPublicKey;
}

export async function signAccessToken(
  payload: Omit<AccessTokenPayload, "type" | "iat" | "exp">,
): Promise<string> {
  const privateKey = await getPrivateKey();
  return new SignJWT({ ...payload, type: "access" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TOKEN_TTL_SECONDS}s`)
    .setIssuer("flowcore")
    .setAudience("flowcore:api")
    .sign(privateKey);
}

export async function signRefreshToken(
  payload: Omit<RefreshTokenPayload, "type" | "iat" | "exp">,
): Promise<string> {
  const privateKey = await getPrivateKey();
  return new SignJWT({ ...payload, type: "refresh" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_REFRESH_TOKEN_TTL_SECONDS}s`)
    .setIssuer("flowcore")
    .setAudience("flowcore:api")
    .sign(privateKey);
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenPayload> {
  const publicKey = await getPublicKey();
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: "flowcore",
    audience: "flowcore:api",
    algorithms: ["RS256"],
  });

  if (payload["type"] !== "access") {
    throw new Error("Invalid token type");
  }

  return payload as AccessTokenPayload;
}

export async function verifyRefreshToken(
  token: string,
): Promise<RefreshTokenPayload> {
  const publicKey = await getPublicKey();
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: "flowcore",
    audience: "flowcore:api",
    algorithms: ["RS256"],
  });

  if (payload["type"] !== "refresh") {
    throw new Error("Invalid token type");
  }

  return payload as RefreshTokenPayload;
}
