/**
 * Webhook authentication helpers — Phase 8.
 *
 * D-01 (revised in RESEARCH.md): Apify does not natively support HMAC-SHA256
 * webhook signatures. The native auth model is a shared-secret token in a
 * custom header. We use `crypto.timingSafeEqual` to compare in constant time
 * to prevent timing attacks.
 *
 * The HMAC variant is scaffolded but NOT wired into any route. It is ready
 * for Phase 13 hardening if/when Apify's Headers template is configured to
 * compute `sha256(body, secret)` server-side at send time.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of a header value against an expected shared secret.
 *
 * Returns false on null/undefined/empty header, length mismatch, or content
 * mismatch. Never throws. Uses `crypto.timingSafeEqual` for the actual compare;
 * length is pre-checked to avoid the `timingSafeEqual` length-mismatch throw
 * (and length leaks only the secret length, which is a fixed deployment value).
 */
export function verifySharedSecret(
  headerValue: string | null | undefined,
  expectedSecret: string,
): boolean {
  if (!headerValue) return false;
  if (!expectedSecret) return false;
  const provided = Buffer.from(headerValue, "utf8");
  const expected = Buffer.from(expectedSecret, "utf8");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/**
 * HMAC-SHA256 verification — scaffolded for Phase 13 hardening.
 *
 * Compares `sha256(rawBody, secret)` against `headerValue` in constant time.
 * NOT yet wired into any route. When Apify Headers template can produce a
 * payload-hash header at send time, the webhook route can be updated to call
 * this function with `await request.text()` as `rawBody`.
 */
export function verifyHmacSha256(
  rawBody: string,
  headerValue: string | null | undefined,
  secret: string,
): boolean {
  if (!headerValue) return false;
  if (!secret) return false;
  const computed = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(headerValue, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
