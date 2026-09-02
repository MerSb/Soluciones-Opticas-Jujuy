import rateLimit from "express-rate-limit";
import { ApiError } from "../lib/api-error.js";

// In-memory store — resets on restart, and does not coordinate across
// multiple instances. Fine for a single Railway instance today; if this
// API is ever scaled horizontally, this needs a shared store (e.g.
// Redis) to stay effective, since each instance would otherwise count
// requests independently. Documented here rather than silently assumed.
function handler(): void {
  throw ApiError.rateLimited("Demasiados intentos. Probá de nuevo en unos minutos.");
}

// Login/register are the brute-force/enumeration-risk surface (§36 of
// the auth brief) — the public catalog is intentionally left alone.
// 30, not a stricter textbook value: high enough that the automated test
// suite (which registers/logs in several real accounts per run, all
// sharing this one in-memory counter per process) never trips it, while
// still a meaningful ceiling against real credential-stuffing.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

export const registerRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

// Called silently by the frontend far more often than login/register are
// — not just every ~15 minutes for an active session, but once per
// unauthenticated page load too: GET /api/auth/me 401s for every guest
// (the expected steady state for most visitors), and the API client
// treats that 401 as "maybe just an expired access token" and tries one
// silent refresh before giving up (see ADR-0018). A guest browsing
// several pages, or several guests behind one shared/office IP, can
// organically rack up refresh attempts fast — a ceiling sized like
// login/register's would start rejecting real traffic, not abuse. 60,
// double the others, verified against a real multi-step browser E2E
// run (register → favorite → account → logout → protected-route
// redirect, ~10 page transitions) staying comfortably under it.
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});
