# Deployment (staging)

Staging only. Production is not provisioned — see `ENVIRONMENT.md`. This document exists so a
future developer (or a future session) doesn't have to re-derive any of this from scratch.

Architecture: **Vercel** (frontend, `apps/web`, static SPA build) + **Railway** (API, `apps/api`,
a long-lived compiled Node process) + **Railway PostgreSQL** (a dedicated staging database,
never shared with local dev or, later, production).

## Branch/workflow model

```
feature/*  →  dev  →  STAGING (Vercel Preview + Railway)  →  [QA approved]  →  main  →  PRODUCTION (future)
```

- Staging deployments are sourced from `dev`. `main` is reserved for the future production
  deployment and is never used for staging.
- Feature branches are not deployed as canonical staging without a specific preview reason —
  they can still get Vercel's normal per-branch Preview deployments (that's free, automatic, and
  fine), but "staging" as a stable reference environment means "whatever `dev` currently is."
- No custom CI/CD system is introduced for this: Vercel's and Railway's native Git integration
  (auto-deploy on push to a configured branch) is a clean fit for a two-service app at this
  stage. Revisit only if a real need for pre-deploy checks beyond what each platform already
  runs (the local validation suite below) shows up.
- This also matters for search-engine indexing — see "Indexing" below.

## Manual steps required

**This repo cannot push to GitHub or create Railway/Vercel resources from this environment** — no
GitHub SSH key or credential helper is configured, and the `railway`/`vercel` CLIs installed here
are both unauthenticated (`railway whoami` → `Unauthorized`, `vercel whoami` → `Logged out.`).
Everything up to this point (build/start scripts, env schema, CORS, migration workflow, staging
seed) is prepared and locally validated; these steps need to be run by someone with access to the
actual GitHub/Railway/Vercel accounts. Do not skip ahead of this checkpoint — nothing past this
list has actually been deployed.

### 1. Get the code onto GitHub

The branch containing all of this work (`feature/premium-visual-upgrade` as of this writing) has
never been pushed — `origin/dev` is still at an older commit. Per the branch/workflow model
above, staging deploys from `dev`, so this branch needs to reach `dev` first:

1. From a machine with a working GitHub credential (SSH key or `gh auth login`), push the branch:
   `git push origin feature/premium-visual-upgrade`.
2. Open a pull request into `dev` (or fast-forward merge locally and push `dev` directly, if
   that's the preferred workflow) and merge it.
3. Confirm `origin/dev` now includes this work: `git log origin/dev -1` should show the latest
   commit from this phase.

### 2. Create the Railway project and staging Postgres

1. Open [railway.app](https://railway.app) and log in (or create an account).
2. Select **New Project**.
3. Choose **Deploy PostgreSQL** (or **Add a database → PostgreSQL** if starting from an existing
   project). This is the dedicated staging database — nothing else uses it.
4. Once provisioned, open the Postgres service's **Variables** (or **Connect**) tab and copy the
   connection string. Do not paste it into this repo, into `.env`, or into any chat/document — it
   goes only into the API service's own Railway environment variables (next section).
5. Confirm `pg_trgm` is available before relying on it: open the Postgres service's **Query**
   tab (or connect with `psql` using the copied connection string) and run:
   `SELECT * FROM pg_available_extensions WHERE name = 'pg_trgm';`
   It's expected to return a row (standard Postgres `contrib` module, present on Railway's
   official Postgres images) — if it doesn't, stop and report back rather than proceeding; do not
   substitute frontend filtering for the trigram search.

### 3. Create the Railway API service

1. In the same Railway project, select **New → GitHub Repo** and pick this repository, `dev`
   branch. (This is also the point where Railway will ask for GitHub authorization if it hasn't
   already been granted — approve access to this specific repo.)
2. Because this is an npm-workspaces monorepo, set the service's **Root Directory to the
   repository root** (not `apps/api`) — the install step needs to run where `package-lock.json`
   and the root `postinstall` (`prisma generate`) live. Do not point Root Directory at `apps/api`
   itself; that directory has no lockfile of its own and would break workspace dependency
   resolution (including `@soluciones-opticas/shared`).
3. Set:
   - **Build Command**: `npm run build:api`
   - **Start Command**: `npm run start:api`
   - (Install Command can stay Railway's default `npm install` — the root `postinstall` script
     runs `prisma generate` automatically as part of that.)
4. Set the Node version. Root `package.json` already declares `"engines": { "node": ">=20" }`;
   Railway's Nixpacks builder generally honors this, but if the detected version isn't what's
   expected, set the environment variable `NIXPACKS_NODE_VERSION=20` on the service for
   determinism.
5. Do **not** enable a database attachment/plugin on this service beyond referencing the
   Postgres service's connection string as a variable (next step) — the API service itself has no
   database of its own.
6. Confirm before finishing: the service must run `node dist/server.js` (compiled output), never
   `npm run dev` (the `tsx --watch` dev script) — that's what `start:api` already does; don't
   override the start command to something else.

### 4. Set the API service's environment variables

In the Railway API service's **Variables** tab, set:

| Variable       | Value                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | The Postgres connection string copied in step 2. Paste it only here.                                                          |
| `NODE_ENV`     | `production`                                                                                                                  |
| `APP_ENV`      | `staging`                                                                                                                     |
| `CORS_ORIGINS` | The Vercel staging URL (set this after step 6 below produces it) — exact origin, comma-separated if more than one, never `*`. |

`PORT` does not need to be set — Railway injects it, and `apps/api/src/lib/env.ts` already reads
`process.env.PORT` dynamically.

### 5. Run the migration and staging seed

Once the API service has a `DATABASE_URL` set, run these **from a machine with the Railway CLI
authenticated** (`railway login`), or by pasting the Railway-provided `DATABASE_URL` into a local
one-off shell — never into a committed file:

```
DATABASE_URL="<railway-connection-string>" npx prisma migrate deploy
DATABASE_URL="<railway-connection-string>" npm run db:seed:staging
```

Never `prisma migrate dev`, `prisma migrate reset`, or `prisma db push` against this database —
see `docs/adr/0014-pg-trgm-via-raw-migration-sql.md`. After running, verify against the real
database state (not just the exit code): `DATABASE_URL="<railway-connection-string>" npx prisma
migrate status` should report no pending migrations, and a manual query
(`SELECT indexname FROM pg_indexes WHERE indexname = 'products_name_trgm_idx';`) should return a
row.

### 6. Create the Vercel project

1. Open [vercel.com](https://vercel.com) and log in (or create an account).
2. Select **Add New → Project**, choose **Import Git Repository**, and pick this repository.
   (This is also where Vercel will ask to authorize GitHub access if it hasn't been granted yet.)
3. Set **Root Directory** to `apps/web`.
4. Vercel should auto-detect the Vite framework preset (build command `vite build` / `npm run
build`, output directory `dist`) — confirm rather than assume; `apps/web/package.json` already
   has the correct `build`/`preview` scripts.
5. Set the **Production Branch** to `main` (not `dev`) in the project's Git settings — this is
   what makes `dev` deploy as a Preview, which is what gives staging the automatic
   `X-Robots-Tag: noindex` header (see "Indexing" below). Do not assign a custom domain to this
   Preview deployment.
6. Add environment variable `VITE_API_BASE_URL` set to the Railway API service's public URL
   (from step 3 — Railway assigns a `*.up.railway.app` URL by default; a custom domain is not
   needed for staging).
7. Deploy. Copy the resulting `*.vercel.app` staging URL and go back to step 4 above to set
   `CORS_ORIGINS` on the Railway API service to this exact origin.

## Indexing

See `docs/ENVIRONMENT.md`'s "Search-engine indexing (staging)" section for the full reasoning.
Summary: no code was added for this. As long as staging is a Vercel Preview deployment (sourced
from `dev`, per the Production Branch = `main` setting above) with no custom domain attached,
Vercel automatically sends `X-Robots-Tag: noindex` on every response — verify with:

```
curl -sI https://<staging-url> | grep -i x-robots-tag
```

## Rollback

- **Frontend (Vercel)**: every deployment is immutable and addressable — use Vercel's dashboard
  "Instant Rollback" to re-point the staging alias at any previous deployment. No data
  implications; safe at any time.
- **API (Railway)**: Railway keeps previous deployments too; redeploying an older one is
  equivalent to a rollback for the API process itself. This does **not** roll back the database.
- **Database (Prisma/Postgres)**: Prisma does not generate safe automatic down-migrations —
  `prisma migrate deploy` only ever applies forward. If a migration causes a problem in staging,
  the default response is a **forward fix**: write and deploy a new migration that corrects the
  issue, rather than attempting to hand-write a down-migration under pressure. A true down-
  migration is only attempted when one has been deliberately authored and reviewed ahead of time
  for that specific change — never improvised during an incident.

## Backups

Not yet configured for staging (data here is disposable demo/test data, not something that needs
a retention policy). Railway offers automated backups on its Postgres plugin; if/when staging
data needs to survive an accidental `migrate reset` or similar, enable that from the Postgres
service's own settings at that time. Production backup policy is deferred until production
exists — see `ENVIRONMENT.md`.

## Costs

The client is billed in USD via these platforms. Do not upgrade either project off its free/trial
tier, and do not enable any paid add-on, without the user's explicit approval — this document
does not assume any specific current pricing, since that changes over time; check each platform's
own pricing page before committing to anything beyond the free tier.

## Post-deploy verification checklist

Run once both services are live, against the real deployed URLs (not localhost):

- `GET https://<api-url>/api/health` returns `200 {"status":"ok"}`.
- Catalog endpoints (`/api/products`, `/api/products/:slug`, `/api/brands`, `/api/categories`,
  `/api/branches`) return real data from the staging database, including the `[DEMO]`-prefixed
  catalog rows and the one real branch.
- Typo-tolerant search (`pg_trgm`) returns results for a deliberately misspelled query against
  the deployed API, not just locally.
- A request from an origin **not** in `CORS_ORIGINS` is rejected; a request from the Vercel
  staging origin succeeds.
- Response headers include Helmet's security headers (e.g. `X-Content-Type-Options`,
  `X-Frame-Options` or `Content-Security-Policy` depending on Helmet's defaults) — confirm on a
  real response, not just by reading `app.ts`.
- A forced API error (e.g. an invalid product slug) returns a generic client-facing message —
  never a stack trace, SQL, `DATABASE_URL`, or filesystem path.
- Every app route loads on direct navigation and on refresh (Vercel's SPA rewrite), including a
  genuinely unmatched path resolving to the real `NotFoundPage`.
- Hero and storefront images load from the deployed frontend, at the expected responsive sizes.
- Dark/light/system theme: persists across reload, no flash, works on mobile and desktop.
- WhatsApp CTA opens with the confirmed number pre-filled; "Cómo llegar" opens a maps link built
  from the confirmed address (never invented coordinates).
- Browser console is clean (no failed asset requests, no mixed-content warnings) on both a mobile
  viewport and desktop widths (1280×900, 1440×900).
- Lighthouse (performance/accessibility/best-practices/SEO) run against the real staging URL in
  both themes — report actual numbers, including any run-to-run noise, rather than a single
  cherry-picked score.
- `curl -sI https://<staging-url> | grep -i x-robots-tag` shows `noindex`.
