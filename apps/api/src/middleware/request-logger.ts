import type { NextFunction, Request, Response } from "express";

// Hand-rolled rather than morgan/pino — method, path, status, and
// duration to the console is small enough not to justify a new
// dependency at this stage. Upgrade to pino (already named in
// docs/ARCHITECTURE.md §13) when real production observability is
// actually needed.
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = performance.now();
  res.on("finish", () => {
    const durationMs = Math.round(performance.now() - start);
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
  });
  next();
}
