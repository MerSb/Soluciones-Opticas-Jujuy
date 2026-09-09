import type { Prisma } from "@prisma/client";

// Single source of truth for "is this product complete enough to show
// publicly" — Real Catalog Readiness. Deliberately independent of
// stock: a fully-loaded product (variant + photo) that's temporarily
// out of stock must stay visible, just marked unavailable via the
// existing computeInStock() (see product-availability.ts) — completeness
// and availability are two separate dimensions, never conflated.
//
// A product is complete once it has at least one variant that itself
// has at least one image. Expressed as one Prisma relation filter so
// every query that needs it — public listing/detail/related/
// recommendations, and the raw-SQL search path — applies exactly the
// same condition, never a slightly different one re-derived per call
// site.
// `satisfies`, not `:` — an explicit `Prisma.ProductWhereInput`
// annotation here widens `variants`'s inferred type just enough that
// spreading this into a `findUnique`'s `where` breaks Prisma's own
// `select`-based return-type narrowing at every call site (a known
// Prisma+TS quirk — see ALERT_ORDER in admin-dashboard.service.ts for
// the same fix applied to an `orderBy`). `satisfies` keeps the literal,
// narrow type while still checking it's a valid ProductWhereInput.
export const COMPLETE_PRODUCT_WHERE = {
  variants: { some: { images: { some: {} } } },
} satisfies Prisma.ProductWhereInput;

// JS-side equivalent, for the admin surface: data already fetched
// there includes full (unfiltered) variant/image rows, so recomputing
// via a second DB round-trip would be wasteful. Must stay logically
// identical to COMPLETE_PRODUCT_WHERE above — an empty `variants` array
// (no variant at all) correctly falls out of `.some()` as `false`, same
// as a product whose variants all lack images.
export function computeIsComplete(variants: { images: unknown[] }[]): boolean {
  return variants.some((variant) => variant.images.length > 0);
}
