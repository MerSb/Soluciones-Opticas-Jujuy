# Environments

Three environments, two of which exist today.

## Local development

**Status: exists.** PostgreSQL 16 via Docker Compose (`docker-compose.yml`, repo root) —
isolated from any other project's containers on the same machine, on host port `5433` (`5432`
was already in use locally; not a meaningful choice otherwise).

```
docker compose up -d       # start
docker compose down        # stop (data persists in the named volume)
docker compose down -v     # stop and delete all local data
```

Connection string (dev-only credentials, not sensitive — see `docker-compose.yml`):

```
DATABASE_URL="postgresql://soluciones_opticas:soluciones_opticas@localhost:5433/soluciones_opticas_dev?schema=public"
```

Used for: `prisma migrate dev --create-only` (drafting migrations — see
[`DATABASE_DESIGN.md`](DATABASE_DESIGN.md) migration policy), local seed data, integration
testing, destructive resets (`npm run db:reset:local`).

## Staging — Railway PostgreSQL

**Status: not yet provisioned.** This requires creating a project in the Railway web dashboard
under the client's/your own Railway account — an account-level action outside what this session
can perform (no `railway` CLI is installed or authenticated here, and provisioning involves an
external account, not just local tooling).

Manual steps to provision (do this, then this repo's tooling handles the rest):

1. Create a Railway project, add a PostgreSQL plugin.
2. Copy the connection string Railway provides.
3. Set it as `DATABASE_URL` in Railway's own environment configuration for the API service —
   **never** in this repo, never in `.env`, never committed.
4. Before running any migration against it, confirm `pg_trgm` is available:
   `SELECT * FROM pg_available_extensions WHERE name = 'pg_trgm';` via Railway's query console or
   `psql`. It ships in the standard `contrib` module of the official Postgres images Railway
   uses, so this is expected to succeed — confirm before relying on it per the brief's explicit
   instruction to verify, not assume, extension availability on the target environment. If it is
   unavailable, stop and re-open the search-architecture decision — do not silently swap it out.
5. Apply the already-reviewed migration: `DATABASE_URL="<railway-url>" npx prisma migrate deploy`
   — never `prisma migrate dev` against staging (see migration policy).

Used for: staging validation, integration testing against real infrastructure, and later, client
review of each biweekly milestone (`docs/ARCHITECTURE.md` §17).

## Production

**Status: intentionally not provisioned.** Per direction for this step: production
infrastructure is created when the MVP is close to deployment, not now — avoiding a recurring
cost with nothing yet to serve. When it is time, it follows the same `prisma migrate deploy`
policy as staging, on its own separate Railway (or equivalent) database — never the staging
database with a relabeled purpose.

## Environment variables

`.env.example` (committed, placeholders only) documents every variable this repo currently uses,
plus commented-out future ones for traceability:

| Variable                           | Status | Notes                                                                                                                                              |
| ---------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                     | Active | Points at local Docker Postgres locally; at Railway's staging connection string in staging (set in Railway's environment config, not in this repo) |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Future | Added when auth is built (Etapa 2)                                                                                                                 |
| `CLOUDINARY_URL`                   | Future | Added when the Cloudinary integration is built                                                                                                     |
| `MERCADOPAGO_ACCESS_TOKEN`         | Future | Added when Mercado Pago integration is built (out of this engagement's scope)                                                                      |
| `ARCA_CERT_PATH`                   | Future | Added when ARCA integration is built (out of this engagement's scope)                                                                              |

Real values exist only in `.env` (gitignored) locally and in each environment's own secret store
(Railway's environment configuration) elsewhere — never in Git, at any point, in any commit.

## Backups

Not yet applicable — no persistent environment exists yet (local dev data is disposable by
design; staging isn't provisioned). Once staging is provisioned: rely on Railway's managed
automated backups initially, confirm the retention window at that time.
[`ARCHITECTURE.md`](ARCHITECTURE.md) §21 already commits to this as the eventual policy.
