# Brand logos

**Only if legally supplied by the client.** Never scrape or download brand logos from the internet
— see §17 of the Premium Visual Experience step, and `CLIENT_CONTENT_CHECKLIST.md`.

## Source spec

- **Format:** SVG preferred (scales cleanly at any size, works in both the light and dark theme if
  supplied as a single dark-on-transparent or light-on-transparent mark — ask which). Transparent
  PNG acceptable if SVG isn't available.

## Wiring it in

`BrandCard.tsx` (`/brands`) currently falls back to a monogram when `brand.logoPublicId` is null —
that's the one place that needs to branch once real logos exist. `BrandRail.tsx` (Home) shows the
confirmed brand names typographically by design (§17: "until official assets are provided, use
high-quality TYPOGRAPHIC brand presentation") — swapping in real logos there, if ever wanted, is a
separate decision, not an automatic consequence of logos existing.
