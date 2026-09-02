# Product image pipeline (Cloudinary)

Operational reference for the real image-upload architecture. See
[`docs/adr/0022-cloudinary-image-pipeline.md`](adr/0022-cloudinary-image-pipeline.md) for the full
reasoning behind every decision summarized here.

## How it works, end to end

```
Admin picks a file
  → client-side validation (MIME + size, apps/web/src/lib/image-validation.ts)
  → POST /api/admin/products/:id/variants/:variantId/images/sign-upload   (JSON, cookie-auth)
  → browser uploads the file directly to Cloudinary                        (no cookies, no our-API)
  → POST /api/admin/products/:id/variants/:variantId/images                (JSON, cookie-auth — persists metadata)
  → public catalog / recommendation engine read the same ProductImage row, no cache/sync step
  → apps/web builds the delivery URL from `publicId` at render time (apps/web/src/lib/cloudinary.ts)
```

The API never receives file bytes at any point.

## Environment variables

Server-side (`apps/api`, never exposed to the frontend):

| Variable                | Required?                                   | Where to find it                                                 |
| ----------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| `CLOUDINARY_CLOUD_NAME` | Optional, all-or-nothing with the other two | Cloudinary Dashboard → "API Keys"                                |
| `CLOUDINARY_API_KEY`    | Optional, all-or-nothing                    | Cloudinary Dashboard → "API Keys"                                |
| `CLOUDINARY_API_SECRET` | Optional, all-or-nothing                    | Cloudinary Dashboard → "API Keys" — **never** log or commit this |

Leaving all three unset is a fully supported local-dev mode: the whole application runs normally,
and only the upload-signature endpoint refuses with a clear `502` message. There is no seeded
placeholder value — this is deliberate; a real credential is required to actually exercise upload.

Client-side (`apps/web`, `VITE_`-prefixed, ships to the browser):

| Variable                     | Notes                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_CLOUDINARY_CLOUD_NAME` | **Not a secret** — it's the public segment of every delivery URL a browser already sees. Leave unset locally to see the branded placeholder instead of real images. |

## Getting real Cloudinary credentials (human checkpoint)

1. Create a free Cloudinary account at cloudinary.com (no credit card required for the free tier as
   of this writing — confirm current terms on Cloudinary's own pricing page before proceeding, per
   this project's cost-approval policy).
2. Dashboard → note the **Cloud name**, **API Key**, and **API Secret**.
3. Set all three as `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` in
   `apps/api`'s environment (local `.env`, or Railway's environment config for staging — never
   committed).
4. Set `VITE_CLOUDINARY_CLOUD_NAME` (same cloud name) in `apps/web`'s environment (local
   `.env.local`, or Vercel's environment config for staging).
5. Restart the API dev server (env is read once at startup) — no code change needed.

## Folder / public_id convention

```
soluciones-opticas/<APP_ENV>/products/<productId>/<variantId>/<uuid>
```

`<APP_ENV>` is `development` / `staging` / `production` (`apps/api/src/lib/env.ts`) — staging and
production assets never share a namespace. Fully server-generated; no client filename or
user-supplied text is ever part of a public_id.

## Validation limits (centralized)

- Formats: JPEG, PNG, WebP (`apps/api/src/lib/image-validation.ts`'s `ALLOWED_IMAGE_FORMATS`,
  mirrored client-side in `apps/web/src/lib/image-validation.ts`). Enforced **server-side** by
  Cloudinary itself via the signed `allowed_formats` parameter — a client can't bypass this by
  editing the request, only by uploading a genuinely different format.
- Max size: 8 MB (`MAX_IMAGE_BYTES`, both copies). **Client-side only** — no Cloudinary parameter
  enforces this server-side on a signed upload (confirmed against Cloudinary's own API reference;
  see the ADR). A named V1 limitation, not an oversight.
- AVIF was evaluated and deliberately excluded from allowed _upload_ formats (browser AVIF-encoder
  support is inconsistent); Cloudinary still _delivers_ AVIF automatically via `f_auto` regardless
  of the uploaded source format, so this costs nothing on the delivery side.

## Delivery / CDN

`apps/web/src/lib/cloudinary.ts` builds `https://res.cloudinary.com/<cloud>/image/upload/f_auto,
q_auto,w_<n>/<publicId>` — automatic format (WebP/AVIF where supported) and automatic quality on
every single delivery URL, no opt-out. Per-context width presets (`CLOUDINARY_WIDTHS`): catalog
card, product-detail main image + thumbnails, admin thumbnail. No Cloudinary SDK dependency on the
frontend — the delivery URL format is a stable public contract, not something that needs a client
library to construct.

Public pages (`GET /api/products`, `/api/products/:slug`, `/api/recommendations`) never call any
Cloudinary management API — they return the stored `publicId` only; the delivery URL is built
locally, client-side, at render time. No provider network call happens on a public catalog
request.

## Delete / orphan behavior

- Deleting a `ProductImage` deletes the remote Cloudinary asset **first**, then the DB row. A
  remote failure leaves the DB row untouched (safe to retry). A DB failure after a successful
  remote delete is logged as a `CRITICAL` inconsistency (no automatic reconciliation in V1).
- Remote delete is idempotent — deleting an already-gone asset is treated as success, not an error.
- If persisting metadata fails _after_ a successful upload (e.g. the variant was deleted
  concurrently), the API best-effort deletes the now-orphaned Cloudinary asset before returning the
  original error.
- Soft-deleting a `Product` (or `Brand`/`Category`) never destroys any Cloudinary asset — soft
  delete stays reversible. Remote destruction only ever happens via an explicit image delete.

## Testing without real credentials

Every ordinary API test suite (`npm run test:api`) mocks the whole provider boundary
(`services/image-provider.service.js`) — no real network call, no credentials needed. Dedicated
unit tests (`test/lib/cloudinary.test.ts`, `test/services/image-provider.service.test.ts`) mock the
`cloudinary` SDK itself one layer deeper. Frontend tests (`test/admin-image-upload.test.tsx`) mock
`fetch` for all three steps of the upload flow (sign, direct Cloudinary upload, confirm).

## Real smoke test (once credentials exist)

1. Log in as an Admin, open a test product's variant, upload a real (clearly test-marked) image.
2. Confirm the `ProductImage` row exists (`cloudinaryPublicId` matches a real asset in the
   Cloudinary Media Library, under the expected folder path).
3. Confirm the image renders on the public catalog card, product detail gallery, and a
   recommendation card.
4. Delete the image from the Admin UI; confirm the asset is gone from the Cloudinary Media Library
   (search by the exact public_id) and the `ProductImage` row is gone.
5. Clean up: remove the test product entirely afterward — never leave test assets in a real
   Cloudinary account indefinitely.

## Known limitations (V1)

- No server-enforced max file size (client-side check only).
- No automatic reconciliation for an upload abandoned before its confirm call ever arrives (a true
  orphan with nothing pointing to it).
- No image editing/cropping in the Admin UI — the uploaded file is used as-is.
- No drag-and-drop reordering — `sortOrder` exists and is respected, but is only ever set at
  creation time; reordering existing images isn't exposed in the Admin UI (no concrete UX need
  identified yet — see ADR-0021's "avoid unnecessary complexity" precedent).
