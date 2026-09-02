import type { NextFunction, Request, Response } from "express";
import type { Role } from "@soluciones-opticas/shared";
import { ApiError } from "../lib/api-error.js";

// Answers "are you allowed to do this?" — always used after authenticate
// (which populates req.auth), never instead of it. Kept as a separate
// middleware per §14 of the auth brief rather than folded into
// authenticate, so a route can require a specific role without every
// authenticated route paying for a role check it doesn't need.
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(ApiError.unauthenticated("Iniciá sesión para continuar."));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(ApiError.forbidden("No tenés permiso para realizar esta acción."));
      return;
    }
    next();
  };
}
