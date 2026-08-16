import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/api-error.js";

// Express only recognizes this as error-handling middleware because it
// takes exactly 4 parameters — the unused ones must stay positional.
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    return;
  }

  // Unexpected error: full detail server-side only. Never a stack
  // trace, SQL, file path, or env data in the response body.
  console.error(error);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
  });
}
