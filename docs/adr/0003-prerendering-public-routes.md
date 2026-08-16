# ADR-0003: Build-time prerendering for public routes

**Status:** Approved

## Context

A plain Vite CSR build serves an empty `<div id="root">` to any client that doesn't execute
JavaScript. Googlebot executes JS reasonably well today, so pure Google SEO could arguably
survive a CSR SPA — but WhatsApp's and Facebook's link-preview scrapers do not execute JS at
all, and WhatsApp is this business's primary contact channel. A shared product link needs a
correct title/image preview on the very first response, not after hydration.

## Decision

Public marketing/catalog routes (Home, About, Brands, Branches, Contact, Catalog, Product
Detail) are prerendered at build time (`vite-react-ssg` or equivalent), producing real HTML with
correct `<title>`, meta description, and Open Graph tags per route. Authenticated/interactive
routes (profile, admin, once they exist) remain pure client-rendered SPA — SEO doesn't apply
there, so the prerendering cost isn't paid for them.

## Alternatives considered

- Full SSR framework migration (Next.js/Remix) — rejected: changes the approved stack for a
  problem a build-time prerender step solves within it.
- Do nothing, rely on Googlebot's JS execution — rejected: doesn't fix WhatsApp/Facebook preview
  scraping, which is the harder and more business-relevant requirement here.

## Consequences

Adds one build-time dependency and a build step. Public routes must not assume `window`/browser
APIs are available at render time without a client-only guard.
