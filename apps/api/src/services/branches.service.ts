import { prisma } from "../lib/prisma.js";
import type { BranchSummary } from "@soluciones-opticas/shared";

export async function listBranches(): Promise<BranchSummary[]> {
  return prisma.branch.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      name: true,
      address: true,
      phone: true,
      whatsapp: true,
      hours: true,
      lat: true,
      lng: true,
      googleMapsUrl: true,
    },
  });
}
