// Thrown from controllers/services, caught by middleware/error-handler.ts.
// `code` is a stable, machine-readable string for API consumers; `message`
// is the human-readable public explanation. Never carries anything not
// safe to send to a client — see docs/API.md "Error format".
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static notFound(message: string): ApiError {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static validation(message: string, details?: unknown): ApiError {
    return new ApiError(400, "VALIDATION_ERROR", message, details);
  }
}
