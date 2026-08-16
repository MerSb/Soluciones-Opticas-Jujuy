# ADR-0009: Vercel + Railway as the deployment target

**Status:** Approved

## Context

Solo developer, hard 16-week deadline. Compared Vercel+Railway, Vercel+Supabase, DigitalOcean,
and a Hostinger VPS on ops burden, DX, DB management, and SSL.

## Decision

Vercel for the frontend (with per-branch preview deployments), Railway for the API + managed
PostgreSQL (with a separate staging service). Domain: `.com.ar` via NIC Argentina, registered in
the client's own account.

## Alternatives considered

- Vercel + Supabase — reasonable, rejected: its bundled Auth/Storage pushes toward its own client
  library where Prisma + Cloudinary are already the chosen tools, adding vendor surface without a
  clear need.
- DigitalOcean / Hostinger VPS — rejected: both shift real DevOps hours (server patching, Nginx,
  certbot, monitoring) onto a solo developer already carrying the full stack; that time is
  better spent on Etapas 2–4.

## Consequences

Hosting is billed in USD, a recurring cost exposed to ARS currency movement for the client —
flagged explicitly so it's budgeted knowingly, not discovered later. Migration to a VPS remains
possible later if costs grow post-launch.
