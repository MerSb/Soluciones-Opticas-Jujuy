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

  // express.json() (body-parser) failures are client errors, not
  // crashes: a body over the 16kb limit or one that isn't valid JSON.
  // Only the type is inspected; the parser's own message is never sent.
  const parserError = bodyParserErrorType(error);
  if (parserError === "entity.too.large") {
    res.status(413).json({
      error: { code: "PAYLOAD_TOO_LARGE", message: "El contenido enviado es demasiado grande." },
    });
    return;
  }
  if (parserError === "entity.parse.failed") {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "El contenido enviado no es JSON válido." },
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

function bodyParserErrorType(error: unknown): string | null {
  if (error && typeof error === "object" && "type" in error && typeof error.type === "string") {
    return error.type;
  }
  return null;
}
