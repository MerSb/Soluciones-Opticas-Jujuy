import { z } from "zod";

// Fails fast with a clear message at startup rather than a cryptic
// downstream error the first time a missing var is actually used.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORT: z.coerce.number().int().positive().default(3001),
  // "development" | "test" | "production" only — this is the value
  // Node/Express/npm tooling itself keys production-mode behavior off
  // of, so staging deploys still set NODE_ENV=production (a staging
  // deployment IS a production-mode run of the server, just against
  // different data/domain). APP_ENV below is the actual environment
  // label — kept separate rather than widening this enum to "staging",
  // per docs/ENVIRONMENT.md's explicit reasoning.
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  // Comma-separated list of allowed origins. No wildcard default — see
  // docs/API.md "CORS" for why "*" is never assumed.
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
});

export const env = envSchema.parse(process.env);
