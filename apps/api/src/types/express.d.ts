import type { Role } from "@soluciones-opticas/shared";

// Populated by middleware/authenticate.ts. Never anything beyond what a
// JWT payload already carries (see lib/jwt.ts's own comment on why it's
// minimal) — a DB read against `auth.userId` is how a route gets
// anything more.
declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; role: Role };
    }
  }
}

export {};
