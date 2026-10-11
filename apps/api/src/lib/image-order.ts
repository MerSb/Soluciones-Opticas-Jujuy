import type { Prisma } from "@prisma/client";

// Every read of a variant's images uses this order: the primary first
// (also for older rows written before that rule existed, without
// rewriting them), then sortOrder; createdAt and id break ties, since
// images created before ordering existed all have sortOrder 0. The admin,
// the product detail gallery and the catalog card therefore agree.
export const IMAGE_ORDER: Prisma.ProductImageOrderByWithRelationInput[] = [
  { isPrimary: "desc" },
  { sortOrder: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
];
