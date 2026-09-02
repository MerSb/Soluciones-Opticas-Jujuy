import jwt from "jsonwebtoken";
import type { Role } from "@soluciones-opticas/shared";
import { env } from "./env.js";

// Short-lived per ADR-0006 — a stolen/leaked access token is only ever
// useful for a few minutes. Session length beyond that comes from the
// rotating refresh cookie (lib/refresh-token.ts), not from a long-lived
// access token.
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const ACCESS_TOKEN_TTL_MS = ACCESS_TOKEN_TTL_SECONDS * 1000;

// Minimal payload by design (§11 of the auth brief) — never email, phone,
// or profile data. `sub`/`role` is everything `authenticate`/`authorize`
// need; anything else is a DB read against the user's own id.
export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (
    typeof decoded === "string" ||
    typeof decoded.sub !== "string" ||
    typeof decoded.role !== "string"
  ) {
    throw new Error("Malformed access token payload.");
  }
  return { sub: decoded.sub, role: decoded.role as Role };
}
