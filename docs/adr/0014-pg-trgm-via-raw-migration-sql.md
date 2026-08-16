# ADR-0014: `pg_trgm` extension and trigram index via raw migration SQL, not Prisma's `postgresqlExtensions` preview feature

**Status:** Approved. Supersedes the `postgresqlExtensions`/`extensions = [pgTrgm]` approach used in
the schema-design step.

## Context

The Database Schema step originally declared the trigram index using Prisma's
`postgresqlExtensions` preview feature (`extensions = [pgTrgm]` in the datasource block,
`@@index([name(ops: raw("gin_trgm_ops"))], type: Gin)` on `Product`). Direction for this step was
to avoid that preview feature and enable `pg_trgm` and its index through raw SQL in the migration
instead.

Doing so has a real, verified consequence: because `schema.prisma` no longer declares the index,
Prisma's schema-diffing (`prisma migrate dev`'s second phase, after applying pending migrations)
detects it as drift and offers to **drop it**. Confirmed directly:

```
$ npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
-- DropIndex
DROP INDEX "products_name_trgm_idx";
```

The `CHECK (stock >= 0)` constraint and the `CREATE EXTENSION` statement do **not** trigger the
same drift warning — only the index does, because Prisma's diff engine tracks indexes but not
check constraints or extensions.

## Decision

`pg_trgm` and the trigram index are created via hand-written SQL in
`prisma/migrations/20260814214726_init_etapa1_catalog/migration.sql`, not declared in
`schema.prisma`. To make this safe long-term, **`prisma migrate dev` (without `--create-only`)
is never run in this project.** The only sanctioned local workflow is:

1. `npm run db:migrate:new` (`prisma migrate dev --create-only`) — drafts a migration without
   applying it and without running the dangerous second-phase diff.
2. Review the generated SQL by hand. If it contains `DROP INDEX "products_name_trgm_idx"` (or any
   other statement touching the unmanaged pg_trgm objects), remove that statement before
   proceeding.
3. `npm run db:migrate:deploy` (`prisma migrate deploy`) to apply — same command used for
   staging/production, and critically, it only applies pending migrations; it never diffs or
   proposes new changes.

`package.json` intentionally does not expose a script for bare `prisma migrate dev` — only
`db:migrate:new` (create-only) and `db:migrate:deploy` (apply) exist, so there's no convenient
shortcut back to the risky command.

## Alternatives considered

- Keep `postgresqlExtensions` (the original approach) — rejected per explicit direction for this
  step; also a preview feature, which the project already avoids adding without strong reason.
- Accept the drift risk and rely on discipline alone — rejected: "always remember to check" is a
  weaker guarantee than "the risky command doesn't exist as a script," especially over a
  four-month solo-maintained project.

## Consequences

Every future schema change goes through create-only-review-deploy, not the more common
create-and-apply-in-one-step `prisma migrate dev` workflow. This is slightly more manual than the
Prisma-idiomatic default, in exchange for the trigram search index never being silently dropped.
