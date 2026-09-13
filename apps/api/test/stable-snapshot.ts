// API integration suites share one database and Vitest runs test files in
// parallel. A few assertions are about *global* state — a dashboard count
// over every user, the recommendation engine's full candidate set — that
// other files legitimately mutate at any moment (fixtures created in
// beforeAll, deleted in afterAll). Measuring such state with a
// before/after delta, or twice in a row, races against those files.
//
// observeWhileStable() makes the precondition explicit instead of assuming
// it: it runs `observe` only inside a window where an exact fingerprint of
// the relevant global state is identical right before and right after the
// observation, and returns that fingerprint so the caller can assert the
// observed value against it exactly. It never relaxes an assertion — it
// only retries the *observation* when the precondition provably didn't
// hold, and fails loudly if the state never settles.

import { prisma } from "../src/lib/prisma.js";
import { COMPLETE_PRODUCT_WHERE } from "../src/lib/product-completeness.js";

const DEFAULT_ATTEMPTS = 20;

// Everything the public candidate queries (recommendations, related
// products) can see — the same `where` as production — with the
// timestamps/ids that change whenever another file creates, edits,
// completes, soft-deletes or re-images a product.
export function completeCatalogFingerprint() {
  return prisma.product.findMany({
    where: { deletedAt: null, ...COMPLETE_PRODUCT_WHERE },
    orderBy: { id: "asc" },
    select: {
      id: true,
      updatedAt: true,
      brand: { select: { updatedAt: true } },
      category: { select: { updatedAt: true } },
      variants: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          updatedAt: true,
          images: {
            orderBy: { id: "asc" },
            select: {
              id: true,
              cloudinaryPublicId: true,
              alt: true,
              isPrimary: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });
}

export async function observeWhileStable<F, T>(
  fingerprint: () => Promise<F>,
  observe: () => Promise<T>,
  attempts = DEFAULT_ATTEMPTS,
): Promise<{ result: T; fingerprint: F }> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const before = await fingerprint();
    const result = await observe();
    const after = await fingerprint();
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return { result, fingerprint: before };
    }
    await new Promise((resolve) => setTimeout(resolve, 25 * attempt));
  }
  throw new Error(
    `Global state kept changing across ${attempts} observations — could not take a stable snapshot.`,
  );
}
