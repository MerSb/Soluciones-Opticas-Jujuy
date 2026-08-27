# Brand assets

Two distinct things live here — Soluciones Ópticas' own logo (the site's identity) and third-party
product brand logos (ELEVE, Pierre Cardin, etc. — what the store sells, not who runs it). Don't
confuse one for the other when adding files.

## Soluciones Ópticas' own logo — `logo.webp` / `logo-2x.webp`

**Live already**, used in the Header (`Header.tsx`). Supplied directly as a real file
(`apps/api/assets/soluciones-opticas-logo.jpg`, 1500×1500 JPEG — a round teal/white badge: a
line-art glasses/scooter mark, the "SOLUCIONES OPTICAS" wordmark, and the address/phone baked into
the badge itself), resized to 80px/160px WebP (1x/2x display at the Header's ~36–40px size) with a
one-off local `sharp` script — not re-cropped or edited beyond simple downsizing.

If a cleaner source (an SVG, or a version without the baked-in address/phone) becomes available
later, replacing `logo.webp`/`logo-2x.webp` and updating the `width`/`height` props on the `<img>`
in `Header.tsx` if the aspect ratio changes is the whole change needed.

## Third-party brand logos — still pending

**Only if legally supplied by the client.** Never scrape or download brand logos from the internet
— see §17 of the Premium Visual Experience step, and `CLIENT_CONTENT_CHECKLIST.md`.

- **Format:** SVG preferred (scales cleanly at any size, works in both the light and dark theme if
  supplied as a single dark-on-transparent or light-on-transparent mark — ask which). Transparent
  PNG acceptable if SVG isn't available.

`BrandCard.tsx` (`/brands`) currently falls back to a monogram when `brand.logoPublicId` is null —
that's the one place that needs to branch once real logos exist. `BrandRail.tsx` (Home) shows the
confirmed brand names typographically by design (§17: "until official assets are provided, use
high-quality TYPOGRAPHIC brand presentation") — swapping in real logos there, if ever wanted, is a
separate decision, not an automatic consequence of logos existing.
