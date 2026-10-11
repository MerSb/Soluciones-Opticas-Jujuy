import type { Prisma } from "@prisma/client";

// Every read of a variant's images uses this order. sortOrder alone is
// not unique (images created before ordering existed all have 0), so
// createdAt and then id break ties — the same images always come back in
// the same order, in the admin and in the public catalog alike.
export const IMAGE_ORDER: Prisma.ProductImageOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
];
