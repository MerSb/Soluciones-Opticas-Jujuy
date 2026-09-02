# Environments

Three environments, two of which exist today.

## Local development

**Status: exists.** PostgreSQL 16 via Docker Compose (`docker-compose.yml`, repo root) —
isolated from any other project's containers on the same machine, on host port `5437` (`5432` and
`5433` were both already in use locally by other projects; not a meaningful choice otherwise).

```
docker compose up -d       # start
docker compose down        # stop (data persists in the named volume)
docker compose down -v     # stop and delete all local data
```

Connection string (dev-only credentials, not sensitive — see `docker-compose.yml`):

```
DATABASE_URL="postgresql://soluciones_opticas:soluciones_opticas@localhost:5437/soluciones_opticas_dev?schema=public"
```

Used for: `prisma migrate dev --create-only` (drafting migrations — see
[`DATABASE_DESIGN.md`](DATABASE_DESIGN.md) migration policy), local seed data, integration
testing, destructive resets (`npm run db:reset:local`).

## Staging — Vercel (frontend) + Railway (API + PostgreSQL)

**Status: repo is prepared; the account-level provisioning itself has not been performed from
this sandboxed session.** No `railway`/`vercel` CLI session here is authenticated
(`railway whoami` / `vercel whoami` both report logged out), and there is no GitHub push
credential either — so creating the actual Railway/Vercel projects and pushing the branch that
triggers their Git integration both require the steps in
[`DEPLOYMENT.md`](DEPLOYMENT.md#manual-steps-required) to be run by a human with access to those
accounts. Everything this repo can control ahead of that — build/start scripts, env schema,
CORS, migration workflow, staging data — is done; see `DEPLOYMENT.md` for the full picture and
the exact manual checkpoint.

Architecture: Vercel serves `apps/web` as a static SPA build only — it never runs the API as
Vercel serverless functions. Railway runs `apps/api`'s **compiled** output (`npm run build` then
`npm run start`, i.e. `node dist/server.js` — never the `tsx --watch` dev script) as a long-lived
Node process, plus a dedicated Railway PostgreSQL service used by nothing else.

Manual steps to provision (do this, then this repo's tooling handles the rest):

1. Create a Railway project, add a PostgreSQL plugin (a dedicated staging database — never
   reused by local dev or, later, production).
2. Copy the connection string Railway provides.
3. Set it as `DATABASE_URL` in Railway's own environment configuration for the API service —
   **never** in this repo, never in `.env`, never committed, and never as a `VITE_`-prefixed
   variable (that would bundle it into the frontend's public JS).
4. Before running any migration against it, confirm `pg_trgm` is available:
   `SELECT * FROM pg_available_extensions WHERE name = 'pg_trgm';` via Railway's query console or
   `psql`. It ships in the standard `contrib` module of the official Postgres images Railway
   uses, so this is expected to succeed — confirm before relying on it per the brief's explicit
   instruction to verify, not assume, extension availability on the target environment. If it is
   unavailable, stop and re-open the search-architecture decision — do not silently swap it out.
5. Apply the already-reviewed migration: `DATABASE_URL="<railway-url>" npx prisma migrate deploy`
   — never `prisma migrate dev`, `migrate reset`, or `db push` against staging (see migration
   policy, `docs/adr/0014-pg-trgm-via-raw-migration-sql.md`).
6. Run `DATABASE_URL="<railway-url>" npm run db:seed:staging` once, to initialize staging with
   the one real confirmed branch plus clearly `[DEMO]`-labeled catalog rows — see "Staging data"
   below. Never `npm run db:seed` (that script is the local-dev fictional seed, self-documented
   as local-only) and never invented product/price/stock data presented as real.
7. Set the Railway API service's other environment variables: `NODE_ENV=production`,
   `APP_ENV=staging`, `CORS_ORIGINS=<the Vercel staging URL, exact origin, no trailing slash>`,
   and `JWT_SECRET=<a real generated secret, 32+ chars — `openssl rand -hex 32`, never reused
from local `.env`>`. `PORT` is injected by Railway itself — the app already reads
   `process.env.PORT` dynamically (`apps/api/src/lib/env.ts`), never hardcoded.
8. Create a Vercel project with Root Directory `apps/web`, connected to this GitHub repo's `dev`
   branch (see `DEPLOYMENT.md` for the branch/workflow rationale). Set `VITE_API_BASE_URL` in
   Vercel's environment config to the Railway API's public URL.

Used for: staging validation, integration testing against real infrastructure, and later, client
review of each biweekly milestone (`docs/ARCHITECTURE.md` §17).

### `NODE_ENV` vs `APP_ENV`

The Zod env schema (`apps/api/src/lib/env.ts`) keeps `NODE_ENV` restricted to
`"development" | "test" | "production"` — that's the value Node/Express/npm tooling itself keys
production-mode behavior off of, and widening it to include `"staging"` would be a novel,
non-standard value flowing into code that doesn't expect it. Staging deployments still set
`NODE_ENV=production` (a staging deploy _is_ a production-mode run of the server, just against
different data/domain) and add a separate `APP_ENV: "development" | "staging" | "production"`
field as the actual environment label, defaulting to `"development"`. The startup log line prints
both (`API listening on port 3001 (NODE_ENV=production, APP_ENV=staging)`), so the two are never
confused when reading Railway logs.

### Staging data

`prisma/seed.ts` is explicitly local-development-only (see its own header comment) and is never
run against staging. `prisma/seed-staging.ts` is the staging-specific counterpart
(`npm run db:seed:staging`, idempotent, run manually against the Railway `DATABASE_URL` — never
wired to `prisma migrate reset` or any automatic hook):

- One real `Branch` row, using the client's confirmed address/phone/WhatsApp number (the same
  values `apps/web/src/content/site-content.ts` already displays) — no second, fictional branch
  invented to match unconfirmed "varias sucursales" marketing copy elsewhere.
- The real, empty `Promociones` category (no products ever attached without a confirmed real
  promotion).
- Fictional brands/products needed to exercise catalog listing, filtering, and `pg_trgm`
  typo-tolerant search against the real staging database — every brand and product name is
  prefixed `[DEMO]` so it's unmistakable in the deployed UI itself, not just in code comments.

## Production

**Status: intentionally not provisioned.** Per direction for this step: production
infrastructure is created when the MVP is close to deployment, not now — avoiding a recurring
cost with nothing yet to serve. When it is time, it follows the same `prisma migrate deploy`
policy as staging, on its own separate Railway (or equivalent) database — never the staging
database with a relabeled purpose.

## Environment variables

`.env.example` (committed, placeholders only) documents every variable this repo currently uses,
plus commented-out future ones for traceability:

| Variable                           | Status | Notes                                                                                                                                                                                      |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                     | Active | Local Docker Postgres locally; Railway's staging connection string in staging (set in Railway's environment config, not in this repo). API-side only — never exposed to the frontend/Vite. |
| `PORT`                             | Active | `apps/api`. Defaults to `3001` locally; Railway injects its own value, read dynamically — never hardcoded.                                                                                 |
| `NODE_ENV`                         | Active | `apps/api`. `development` \| `test` \| `production` only — staging sets `production`. See "`NODE_ENV` vs `APP_ENV`" above.                                                                 |
| `APP_ENV`                          | Active | `apps/api`. `development` \| `staging` \| `production` — the actual environment label, separate from `NODE_ENV`.                                                                           |
| `CORS_ORIGINS`                     | Active | `apps/api`. Comma-separated allowlist. Never `*`. Local: `http://localhost:5173`. Staging: the exact Vercel staging origin only.                                                           |
| `JWT_SECRET`                       | Active | `apps/api`. Required in every environment (min 32 chars). Generate a distinct value per environment — never reuse the local dev secret in staging.                                         |
| `VITE_API_BASE_URL`                | Active | `apps/web`, build-time. Points at the local API in dev; at the Railway API's public URL in staging (set in Vercel's environment config, not in this repo).                                 |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Future | Added when auth is built (Etapa 2)                                                                                                                                                         |
| `CLOUDINARY_URL`                   | Future | Added when the Cloudinary integration is built                                                                                                                                             |
| `MERCADOPAGO_ACCESS_TOKEN`         | Future | Added when Mercado Pago integration is built (out of this engagement's scope)                                                                                                              |
| `ARCA_CERT_PATH`                   | Future | Added when ARCA integration is built (out of this engagement's scope)                                                                                                                      |

## Authentication (staging compatibility)

The session cookie strategy (`docs/adr/0018-authentication-session-strategy.md`) was designed
around this exact three-environment model from the start, not retrofitted: cookie attributes are
already environment-dependent (`SameSite=Lax`/non-`Secure` locally, `SameSite=None`/`Secure` in
staging/production), and `cors()` already sets `credentials: true` alongside the existing strict
`CORS_ORIGINS` allowlist — required for the cookie to travel between the Vercel and Railway
origins. Nothing about staging deployment requires touching auth code; only the environment
variables above need to be set on the Railway service.

## Search-engine indexing (staging)

Staging must never compete with the eventual real production site in search results, and the
policy chosen to prevent that must not be able to leak into production by accident.

Decision: rely on Vercel's own platform behavior rather than app code. Vercel automatically sends
`X-Robots-Tag: noindex` on Preview Deployment responses (the deploys triggered by pushes to any
branch other than the project's designated Production branch) — but only for the assigned
`*.vercel.app` URL; it stops doing so if a custom domain is attached to that branch. So as long as
staging (a) deploys from `dev` as a Preview, per the branch/workflow decision in `DEPLOYMENT.md`,
and (b) is never given a custom domain (per §46 of the staging brief — the client's real domain is
explicitly out of scope for this phase), the `noindex` header is applied automatically and
disappears naturally once `main` is later promoted to a real Production deployment with the
client's domain. No `robots.txt` `Disallow`, no `<meta name="robots">`, and no code change was
added for this — a hardcoded staging-only `Disallow: /` in the single `apps/web/public/robots.txt`
served to every environment would risk shipping to production by omission, which is worse than
relying on the platform's own environment-scoped behavior. Verify with
`curl -sI <staging-url> | grep -i x-robots-tag` once the staging URL exists (see `DEPLOYMENT.md`'s
verification checklist).

Real values exist only in `.env` (gitignored) locally and in each environment's own secret store
(Railway's environment configuration) elsewhere — never in Git, at any point, in any commit.

## Backups

Not yet applicable — no persistent environment exists yet (local dev data is disposable by
design; staging isn't provisioned). Once staging is provisioned: rely on Railway's managed
automated backups initially, confirm the retention window at that time.
[`ARCHITECTURE.md`](ARCHITECTURE.md) §21 already commits to this as the eventual policy.
