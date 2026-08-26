# Storefront photo

**A real photo is live here already** (`soluciones-opticas-local.webp`, supplied directly in the
Phase A/B continuation step, optimized from a 16MB/3024×4032 original to ~1000px wide). Used by
`pages/home/StoreShowcaseSection.tsx` — a calmer, institutional counterpart to the Hero's product
photo, not a second product showcase.

## If replacing or adding more storefront/institutional photos later

- **Format:** WebP preferred.
- **Resolution:** ~1000–1400px on the long edge is enough — this section displays the photo at
  roughly half the content width on desktop, stacked full-width on mobile; it isn't the page's LCP
  candidate the way the Hero photo is, so it doesn't need Hero-level resolution or a responsive
  `srcset`.
- Interior storefront photos, if supplied, would fit naturally alongside or instead of the current
  exterior shot in the same section — see `CLIENT_CONTENT_CHECKLIST.md`.
