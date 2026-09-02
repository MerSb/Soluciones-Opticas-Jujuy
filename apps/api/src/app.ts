import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./lib/env.js";
import { ApiError } from "./lib/api-error.js";
import { apiRouter } from "./routes/index.js";
import { requestLogger } from "./middleware/request-logger.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";

// Separated from server.ts so tests (supertest) can exercise the app
// directly without binding a real port.
export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header = same-origin or a non-browser client (curl,
        // server-to-server) — nothing to check against an allowlist.
        // Browsers always send Origin on cross-origin requests, which is
        // what this actually gates. CORS_ORIGINS is env-driven per
        // environment (docs/ENVIRONMENT.md) — never "*".
        if (!origin || env.CORS_ORIGINS.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new ApiError(403, "CORS_FORBIDDEN", `Origin "${origin}" is not allowed.`));
      },
      // Required for the auth cookie to travel on cross-origin requests
      // (Vercel frontend → Railway API) — see
      // docs/adr/0018-authentication-session-strategy.md. Safe only
      // because origin is never "*" above; the two are a matched pair.
      credentials: true,
    }),
  );
  app.use(requestLogger);
  app.use(cookieParser());
  // 16kb: every body this API accepts is a login/register/profile form,
  // not a file upload — bounds request size without touching any
  // legitimate use.
  app.use(express.json({ limit: "16kb" }));

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
