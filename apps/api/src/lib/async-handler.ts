import type { NextFunction, Request, Response } from "express";

// Express doesn't await async route handlers itself — an unhandled
// rejection inside one would otherwise never reach error-handler.ts.
// One small wrapper here beats repeating try/catch in every controller.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
