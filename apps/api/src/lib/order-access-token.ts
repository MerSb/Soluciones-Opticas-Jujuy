import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// Guest order access token — ADR-0025. Same scheme as the refresh token
// (lib/refresh-token.ts): 32 random bytes, only the SHA-256 hash is
// stored. The raw value is handed to the caller once, when the order is
// created, and later presented in the X-Order-Access-Token header —
// never in a query string, which the request logger records.

export function generateOrderAccessToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashOrderAccessToken(raw) };
}

export function hashOrderAccessToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Constant-time comparison of a presented token against a stored hash. */
export function verifyOrderAccessToken(raw: string, storedHash: string): boolean {
  const presented = Buffer.from(hashOrderAccessToken(raw), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return presented.length === stored.length && timingSafeEqual(presented, stored);
}
