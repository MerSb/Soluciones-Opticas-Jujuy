import type { CookieOptions, Response } from "express";
import { env } from "./env.js";
import { ACCESS_TOKEN_TTL_MS } from "./jwt.js";
import { REFRESH_TOKEN_TTL_MS } from "./refresh-token.js";

export const ACCESS_TOKEN_COOKIE = "sopt_access_token";
export const REFRESH_TOKEN_COOKIE = "sopt_refresh_token";

// Local dev: the frontend (localhost:5173) and API (localhost:3001) are
// different origins but the same *site* (SameSite is defined by
// registrable domain, not port) — SameSite=Lax already lets the cookie
// travel on the fetch()es CORS allows, with no need for Secure (which
// plain http can't satisfy anyway). Staging/production: Vercel and
// Railway are genuinely different sites, so the cookie needs
// SameSite=None, which browsers only honor together with Secure. See
// docs/adr/0018-authentication-session-strategy.md.
function baseAttrs(path: string): CookieOptions {
  const crossSite = env.APP_ENV !== "development";
  return {
    httpOnly: true,
    secure: crossSite,
    sameSite: crossSite ? "none" : "lax",
    path,
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...baseAttrs("/"),
    maxAge: ACCESS_TOKEN_TTL_MS,
  });
  // Scoped to /api/auth only — the refresh token never needs to leave
  // the browser on any other request, so it isn't sent on every one.
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...baseAttrs("/api/auth"),
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, baseAttrs("/"));
  res.clearCookie(REFRESH_TOKEN_COOKIE, baseAttrs("/api/auth"));
}
