/**
 * HMAC-SHA256 webhook signature verification
 */
import { createHmac, timingSafeEqual } from "crypto";

const SIGNATURE_HEADER = "X-FlowCore-Signature";
const SIGNATURE_VERSION = "v1";

/**
 * Generates an HMAC-SHA256 signature for a webhook payload.
 * Signature format: v1=<hex-digest>
 */
export function generateWebhookSignature(
  payload: string | Buffer,
  secret: string,
): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(payload);
  return `${SIGNATURE_VERSION}=${hmac.digest("hex")}`;
}

/**
 * Verifies the X-FlowCore-Signature header.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) {
    return false;
  }

  const expected = generateWebhookSignature(payload, secret);

  try {
    const expectedBuf = Buffer.from(expected, "utf8");
    const actualBuf = Buffer.from(signatureHeader, "utf8");

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }

    return timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}

export { SIGNATURE_HEADER };
