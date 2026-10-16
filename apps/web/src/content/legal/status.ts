// Publication switch for the legal pages (audit points 1–3).
//
// A page is published only when its flag here is `true`. Flip it only
// when the document has no `[[PENDIENTE: …]]` markers left (a test
// enforces it) AND the business and its legal advisor approved the text.
//
// These are literal booleans on purpose: app/routes.tsx and the Footer
// check them next to SHOW_LEGAL_DRAFTS (./visibility.ts), both build-time constants, so
// a production build drops an unapproved page completely — route, footer
// link and draft text — and scripts/prerender-heads.ts writes no HTML for
// it (its URL is a real 404). Drafts stay reviewable with `npm run dev`.
//
// This module stays plain data (no imports, no import.meta.env): the
// build imports it from Node too.

export const LEGAL_NOTICE_APPROVED = false;
export const PRIVACY_POLICY_APPROVED = false;
export const COOKIE_POLICY_APPROVED = false;

export const LEGAL_PAGES = [
  { slug: "aviso-legal", title: "Aviso legal", approved: LEGAL_NOTICE_APPROVED },
  { slug: "privacidad", title: "Política de privacidad", approved: PRIVACY_POLICY_APPROVED },
  { slug: "cookies", title: "Política de cookies", approved: COOKIE_POLICY_APPROVED },
] as const;
