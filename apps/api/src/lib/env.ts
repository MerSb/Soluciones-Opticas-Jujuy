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
  // Required in every environment, including local dev — a short/missing
  // secret fails fast here rather than producing forgeable sessions. See
  // docs/adr/0018-authentication-session-strategy.md. Generate a real
  // local value with `openssl rand -hex 32`; never commit one.
  JWT_SECRET: z
    .string()
    .min(
      32,
      "JWT_SECRET must be at least 32 characters — generate one with `openssl rand -hex 32`.",
    ),
  // All three optional and all-or-nothing (see the .refine below) — a
  // developer without Cloudinary credentials must still be able to run
  // the whole app; only the upload-signature endpoint itself refuses
  // with a clear error when unconfigured (see lib/cloudinary.ts). Never
  // required at startup the way JWT_SECRET is: unlike a forgeable
  // session, a missing Cloudinary credential has no silent-corruption
  // failure mode to fail fast against — it just means one feature is
  // off. See docs/adr/0022-cloudinary-image-pipeline.md.
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
});

export const env = envSchema
  .refine(
    (value) =>
      [value.CLOUDINARY_CLOUD_NAME, value.CLOUDINARY_API_KEY, value.CLOUDINARY_API_SECRET].every(
        (v) => v !== undefined,
      ) ||
      [value.CLOUDINARY_CLOUD_NAME, value.CLOUDINARY_API_KEY, value.CLOUDINARY_API_SECRET].every(
        (v) => v === undefined,
      ),
    {
      message:
        "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must be set together, or not at all.",
    },
  )
  .parse(process.env);
