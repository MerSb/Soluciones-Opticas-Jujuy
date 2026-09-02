import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { ApiError } from "../lib/api-error.js";

// Parsed data is stashed on res.locals rather than overwriting
// req.query/req.params — those are typed as string-only by Express,
// and validated data includes coerced numbers/enums that no longer
// match that shape.
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(ApiError.validation("Invalid query parameters.", result.error.flatten()));
      return;
    }
    res.locals.query = result.data;
    next();
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(ApiError.validation("Invalid route parameters.", result.error.flatten()));
      return;
    }
    res.locals.params = result.data;
    next();
  };
}

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(ApiError.validation("Invalid request body.", result.error.flatten()));
      return;
    }
    res.locals.body = result.data;
    next();
  };
}
