import { createHash, randomBytes } from "node:crypto";

// 30 days — long enough that a customer isn't asked to log in again on
// every visit, short enough to bound a stolen-cookie's usefulness.
// Rotated on every use (see auth.service.ts), so in practice a single
// value is rarely alive for the full window anyway.
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Opaque, not a JWT — there is nothing to decode; the whole point is a
// database lookup, so a rotated-away or logged-out token can actually be
// rejected server-side (a self-contained JWT refresh token could not be
// revoked before its own expiry). Only the SHA-256 hash is ever stored —
// same reasoning as password hashing: a stolen database row alone must
// never be enough to impersonate a session.
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashRefreshToken(raw) };
}

export function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
