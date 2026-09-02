# ADR-0022: Real Cloudinary image pipeline — signed direct upload, no file ever touches the API

**Status:** Approved. Code complete; the real Cloudinary account itself is a human checkpoint — see
"Deployment status" below.

## Context

`ProductImage.cloudinaryPublicId` (ADR-0010) has existed as a plain string column since Etapa 1,
and the Admin Catalog Management phase (ADR-0021) built full CRUD around it — but confirmed, in
that phase's own audit, that no Cloudinary SDK, account, or upload flow existed anywhere in the
repository, and deliberately stopped there rather than inventing one. This phase builds that
missing piece: a real upload path from an Admin's file picker to a stored, deliverable Cloudinary
asset, plus the staging infrastructure to run the whole application somewhere other than a laptop.

Audited before writing any code (repeating ADR-0021's own audit discipline): current
`ProductImage` schema is exactly `{ cloudinaryPublicId: String, alt: String, sortOrder: Int,
isPrimary: Boolean }` — no width/height/format/URL columns exist, confirming ADR-0010's
public-id-not-URL model was already the right shape to build on, not something to redesign.

## Decision 1 — Signed direct-to-Cloudinary upload, not a multipart proxy through the API

Two architectures were evaluated (per the brief's own explicit instruction to evaluate, not
assume):

**A. Browser → API (multipart) → Cloudinary.** The API receives the file bytes, validates them,
forwards to Cloudinary, writes the DB row. Rejected: it requires parsing multipart bodies (a new
dependency — multer/busboy — for zero other benefit), routes potentially several-MB file bytes
through Railway's API process memory on every upload, and — critically — a multipart POST is
exactly the shape a plain HTML form can submit cross-site with no CORS preflight. Routing file
uploads through a cookie-authenticated multipart endpoint would have reopened the CSRF surface
this phase's own audit was already closing for JSON endpoints (see Decision 3 below).

**B. Browser → API (JSON, signature only) → Browser → Cloudinary (direct) → Browser → API (JSON,
confirm).** Chosen. The API never receives a file. It signs a short-lived, narrowly-scoped upload
authorization (`POST .../images/sign-upload`, JSON, cookie-authenticated, `authorize("ADMIN")` —
identical shape to every other admin mutation); the browser uploads directly to Cloudinary's own
endpoint with no cookies and no CORS relationship to our API at all; the browser then confirms the
resulting metadata via the **existing** `POST .../images` endpoint from ADR-0021, unchanged. No new
multipart endpoint, no new binary-body handling, no new dependency for receiving files (the
`cloudinary` npm package is used only for signing and delete, both tiny JSON-in/JSON-out calls).

Consequences of B: two extra round-trips instead of one, and a moment where a real Cloudinary asset
can exist with nothing in our database referencing it yet (handled explicitly — see Decision 4).
Both are the right trade for keeping the API stateless with respect to file bytes and never
reopening the CSRF surface.

## Decision 2 — `allowed_formats` is signed and server-enforced; file size is not

Verified against Cloudinary's own API reference before implementing (not assumed from memory):
`public_id`, `timestamp`, and `allowed_formats` are all real, documented parameters that can be
included in a signed upload request, and Cloudinary itself rejects an upload whose actual format
isn't in that list — enforced by the provider, not just advisory, and a client can't strip the
constraint without invalidating the signature. **No documented Cloudinary parameter enforces a
maximum file size on a signed upload** (also verified against the same reference, not assumed) —
`MAX_IMAGE_BYTES` (8 MB, `apps/api/src/lib/image-validation.ts`) is therefore a client-side-only
check today, a named, deliberate V1 limitation, not an oversight. Revisit via an unsigned upload
preset's dashboard-configured size cap, or a post-upload eager/webhook rejection, if a real client
upload ever needs a harder guarantee.

## Decision 3 — CSRF re-evaluation (not a copy of ADR-0018's prior conclusion)

Re-evaluating ADR-0018's reasoning before adding this endpoint (as instructed) surfaced a real,
pre-existing gap unrelated to file upload specifically: `express.json()` only parses a body when
`Content-Type` is `application/json` — for any other content type it still calls `next()`, so any
POST route with no _required_ body field was reachable via a bare cross-site HTML form submission
(a simple request: no CORS preflight, no readable response, but cookies attached under
`SameSite=None` in staging). Endpoints with a real, Zod-validated required body were already safe
(an empty/undefined body fails validation) — `/auth/logout`, `/auth/refresh`, `/favorites/:slug`,
every `/admin/.../restore` were not. Fixed centrally with `middleware/require-json.ts`: every POST
now requires a genuine `application/json` Content-Type, which a plain form can never set. This was
fixed _before_ adding the new sign-upload endpoint (itself bodyless) specifically so it inherits
the closed gap rather than reopening a corner of it. PATCH/DELETE were left alone — HTML forms
cannot submit those methods at all, so they were never exposed to this vector.

Net result: the direct-to-Cloudinary upload step needed no CSRF defense of its own to design,
because it was designed to never be a cookie-authenticated mutation in the first place (see
Decision 1 above) — the only two requests that touch our cookie-authenticated API in this whole
flow (sign-upload, confirm) are both plain JSON POSTs, protected the same way every other mutation
in this API already is.

## Decision 4 — Orphan/failure handling, ordered explicitly (no real distributed transaction exists)

There is no distributed transaction across Postgres and an external HTTP provider, so every
failure mode was reasoned through and handled explicitly rather than left to chance:

- **Upload succeeds, confirm (DB write) fails**: `createImage` wraps its Prisma write in a
  try/catch; on failure it best-effort deletes the now-orphaned Cloudinary asset
  (`imageProvider.tryCleanupOrphanedAsset`) before rethrowing the original error. A cleanup
  failure is logged, never masks or replaces the real error.
- **Delete: remote-then-DB, in that order.** `deleteImage` fetches the DB row first (to get the
  `cloudinaryPublicId`), deletes the remote asset, and only then deletes the DB row. A remote
  failure leaves the DB row completely untouched — safe to retry, never a false "deleted"
  response. A DB failure _after_ a successful remote delete (a narrow, rare window) is logged as a
  named `CRITICAL` inconsistency — no automatic reconciliation exists in V1 — and the error still
  propagates so the admin sees a real failure, not a false success.
- **Delete is idempotent.** Cloudinary's Node SDK resolves (never throws) `{result: "not found"}`
  for an already-gone asset — treated as success, same as `{result: "ok"}`, which is what makes a
  retry after a partial failure safe rather than compounding the problem.
- **Abandoned upload, no confirm call ever sent** (the browser tab closes between a successful
  direct-to-Cloudinary upload and the confirm request): a true, named V1 limitation — nothing
  server-side can detect this synchronously. A future phase could add a periodic reconciliation
  job comparing a Cloudinary folder's contents against `ProductImage` rows; out of scope here.

## Decision 5 — Folder/public_id strategy

`soluciones-opticas/<APP_ENV>/products/<productId>/<variantId>/<uuid>` — fully server-generated
(`node:crypto`'s `randomUUID()`), never a client filename (no path traversal, no private
information, no collision risk). Passed to Cloudinary as a single `public_id` rather than a
separate `folder` parameter: Cloudinary's folder+public_id concatenation behavior differs between
an account's "Fixed" vs. "Dynamic" folder mode, which this project has no way to confirm without
real credentials — a single unambiguous `public_id` sidesteps that entirely. The `<APP_ENV>`
segment (`development` / `staging` / `production`) keeps environments from ever sharing an
uncontrolled namespace, per the brief's explicit folder-separation requirement.

## Decision 6 — Provider service boundary, mocked wholesale in ordinary tests

`services/image-provider.service.ts` is the only seam every other module calls through;
`lib/cloudinary.ts` is the only module that imports the `cloudinary` SDK. Ordinary Admin API tests
`vi.mock()` the whole service boundary (no real network, no real credentials needed to run the
suite); `lib/cloudinary.test.ts` and `image-provider.service.test.ts` separately verify the mapping/
signing/idempotent-delete logic with the SDK itself mocked one layer deeper. This is what makes
`npm run test:api` fully green in an environment — like the one this phase was implemented in —
with zero Cloudinary credentials configured.

## Decision 7 — Cloudinary is optional configuration, not a required one

`CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` are optional and
all-or-nothing in `apps/api/src/lib/env.ts` (a `.refine()` rejects a partial set). Unlike
`JWT_SECRET` — required everywhere, fails the whole server at startup if missing, because a
forgeable session has real silent-corruption risk — a missing Cloudinary credential has no such
failure mode: the rest of the application runs completely normally, and only the upload-signature
endpoint itself refuses with a clear `502` ("El almacenamiento de imágenes no está configurado en
este entorno"). This is deliberate: this exact phase was implemented and fully tested in an
environment with no real Cloudinary account, and that must remain possible for any future
contributor working locally without one, too.

## Alternatives considered

**Unsigned upload preset** (Cloudinary dashboard-configured, no server signature needed at all) —
rejected: the brief explicitly asks to justify this before using it, and it would mean any holder
of the (necessarily public, embedded-in-JS) preset name could upload directly to the account with
no server-side authorization check at all — no `authenticate`, no `authorize("ADMIN")`, nothing.
Signed uploads cost one extra JSON round-trip and keep every upload gated behind real
authentication.

**Storing the full delivery URL instead of `public_id`** — already rejected once, in ADR-0010; this
phase reconfirms rather than revisits it, since nothing about a real upload flow changes that
reasoning.

## Deployment status (human checkpoint)

Code, tests, and docs for this decision are complete and were validated against Cloudinary's own
public API documentation. **No real Cloudinary account exists yet** — creating one, an account is
an external, potentially-billed resource this phase's own instructions require stopping before
creating. See the final report's checkpoint section for exactly what a human needs to do
(`CLOUDINARY_CLOUD_NAME`/`CLOUDINARY_API_KEY`/`CLOUDINARY_API_SECRET`, where to find them, free-tier
confirmation) and what already works locally in the meantime (everything except the real Cloudinary
smoke test — the whole app, including graceful `502` handling when unconfigured, was verified live).

## Consequences

- Revisit Decision 2 (file-size enforcement) if a real client upload needs a harder server-side
  guarantee than the client-side check.
- Revisit the CSRF section again the day any _new_ multipart/raw-binary-body endpoint is ever
  introduced — this decision's whole point was to avoid needing one.
- Revisit the abandoned-upload orphan gap if it proves to matter in practice (a reconciliation job,
  not a redesign of the upload flow itself).
