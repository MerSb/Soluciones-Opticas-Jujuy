import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../lib/api-error.js";

// Closes a real CSRF gap found during the Cloudinary/staging-readiness
// phase's mandatory CSRF re-evaluation (ADR-0018 originally, revisited in
// docs/adr/0022-cloudinary-image-pipeline.md): `express.json()` only
// *parses* a body when Content-Type is `application/json` — for any
// other content type (or none) it leaves `req.body` empty and still
// calls `next()`, so the request still reaches the route handler. A
// plain HTML `<form method="post">` can only ever submit
// `application/x-www-form-urlencoded`, `multipart/form-data`, or
// `text/plain` — never `application/json` — and browsers send such a
// form submission cross-site with no CORS preflight and no read access
// to the response, but WITH cookies attached (`SameSite=None` in
// staging/production). Every POST route that doesn't require a real,
// Zod-validated body with at least one required field (register/login/
// admin creates all already fail safely on an empty body) was reachable
// this way before this middleware: `/auth/logout`, `/auth/refresh`,
// `/favorites/:slug`, every `/admin/.../restore`, and the new upload-
// signature endpoint this phase adds.
//
// Fixed once, centrally, for every current and future bodyless POST —
// not endpoint-by-endpoint — by requiring a real `application/json`
// Content-Type on every POST regardless of whether it happens to need a
// body. Since a plain form can never set that content type, this alone
// forces any cross-origin attempt back onto `fetch()`/XHR, which *does*
// trigger a CORS preflight this API's strict origin allowlist already
// rejects. PATCH/DELETE are excluded — HTML forms cannot submit those
// methods at all (the `method` attribute only accepts GET/POST), so they
// were never exposed to this specific vector and gain nothing from it.
export function requireJsonContentType(req: Request, _res: Response, next: NextFunction): void {
  if (req.method !== "POST") {
    next();
    return;
  }
  const contentType = req.headers["content-type"];
  if (!contentType || !contentType.toLowerCase().includes("application/json")) {
    next(
      ApiError.unsupportedMediaType(
        'This request must use "Content-Type: application/json", even with an empty body.',
      ),
    );
    return;
  }
  next();
}
