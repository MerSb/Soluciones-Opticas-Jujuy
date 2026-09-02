import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/api-error.js";
import { ACCESS_TOKEN_COOKIE } from "../lib/cookies.js";
import { verifyAccessToken } from "../lib/jwt.js";

// Answers "who are you?" only — attaches a minimal auth context and
// rejects anything invalid/expired. Never checks *what* the caller is
// allowed to do; that's authorize.ts (§13/§14 of the auth brief keep
// these deliberately separate). Stateless: verifies the JWT signature
// and expiry only, no DB round-trip — a user deleted mid-session stays
// "authenticated" until their access token naturally expires (documented
// as a known limitation, not a bug).
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;
  if (!token) {
    next(ApiError.unauthenticated("Iniciá sesión para continuar."));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub, role: payload.role };
    next();
  } catch {
    next(ApiError.unauthenticated("Tu sesión expiró. Iniciá sesión nuevamente."));
  }
}
