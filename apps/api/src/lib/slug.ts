// Slug generation for the Admin catalog write paths — the only place
// slugs are ever produced. Per ADR-0013, immutability is enforced by
// admin update schemas simply never accepting a `slug` field after
// creation; this module is the create-time counterpart, generating one
// once from `name` and never touching it again.

// Same NFD-decompose-then-strip-combining-marks approach as
// recommendation/normalize.ts's normalizeText, applied to slug output
// instead of a comparison key.
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

// Appends `-2`, `-3`, ... until `isTaken` reports the candidate free.
// Brand/Category/Product slugs are globally unique even across
// soft-deleted rows (the `@unique` column has no `deletedAt` filter),
// which is deliberate: a deleted brand's slug was already public once
// and must never be handed to a different entity later.
export async function generateUniqueSlug(
  name: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(name) || "item";
  let candidate = base;
  let suffix = 2;
  while (await isTaken(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
