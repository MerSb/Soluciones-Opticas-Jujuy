# Soluciones Ópticas

Institutional website and product catalog for Soluciones Ópticas, built progressively over four
stages (Etapa 1–4). See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture
and [`docs/adr/`](docs/adr/) for the reasoning behind individual decisions.

## Current status

Etapa 1 (institutional site + database-backed catalog) — repository foundation in progress.

## Repository layout

```
apps/
  web/       React + TypeScript + Vite + Tailwind — public site and catalog
  api/       Node + Express + TypeScript — catalog API
packages/
  shared/    Zod schemas and inferred types, shared between web and api
prisma/      Database schema and migrations (added with the Database Schema step)
docs/        Architecture reference and ADRs
```

## Working in this repo

This is an npm-workspaces monorepo. From the repo root:

```
npm install
```

Per-app dev/build/test commands will be documented here as each app is scaffolded (Frontend
Foundation and Minimal Read-Only Catalog API steps).

## Scope

Etapa 1 delivers the institutional site and a real, database-backed catalog — no user accounts,
favorites, measurements, recommendations, payments, ARCA, or facial analysis yet. Those are
designed for architecturally but implemented in later, separately-approved stages. See
`docs/ARCHITECTURE.md` §2.4 and the ADRs for what's deliberately out of scope right now.
