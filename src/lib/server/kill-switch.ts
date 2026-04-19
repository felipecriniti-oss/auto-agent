/**
 * Per CONTEXT.md D-17:
 *   Kill switch: process.env.NEGOTIATION_ENABLED !== 'false' checked per-request.
 *   Exact string match required — only the literal "false" disables.
 *
 * Read per-request (no caching) so Vercel env-var flips take effect immediately
 * without redeploy.
 */
export function isNegotiationEnabled(): boolean {
  return process.env.NEGOTIATION_ENABLED !== "false";
}
