import type {
  AdminDashboardAlertProduct,
  AdminDashboardResponse,
} from "@soluciones-opticas/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

// A product counts as "out of stock" the same way computeInStock([])
// does for a product with zero variants: vacuously true, since there's
// no variant with stock > 0 to find. Expressed here as a Prisma filter
// (not the runtime helper itself) because this needs to run as a
// database-side count/sample, never a full row fetch — see
// docs/ADMIN_DASHBOARD_V2.md "Stock" for the equivalence argument.
const OUT_OF_STOCK_WHERE = {
  deletedAt: null,
  variants: { none: { stock: { gt: 0 } } },
} as const;

// A product counts as "without images" when none of its variants carry
// any ProductImage — images belong to ProductVariant, not Product
// directly, so this is necessarily a two-level relation filter. Same
// vacuous-true reasoning for a product with zero variants.
const WITHOUT_IMAGES_WHERE = {
  deletedAt: null,
  variants: { none: { images: { some: {} } } },
} as const;

const ALERT_SELECT = {
  id: true,
  name: true,
  brand: { select: { name: true } },
} as const;

const ALERT_ORDER: Prisma.ProductOrderByWithRelationInput[] = [{ name: "asc" }, { id: "asc" }];
const ALERT_LIMIT = 5;

function toAlertProduct(row: {
  id: string;
  name: string;
  brand: { name: string };
}): AdminDashboardAlertProduct {
  return { id: row.id, name: row.name, brandName: row.brand.name };
}

export async function getAdminDashboard(): Promise<AdminDashboardResponse> {
  const [
    activeProducts,
    outOfStockProducts,
    productsWithoutImages,
    activeBrands,
    activeCategories,
    registeredUsers,
    outOfStockAlerts,
    withoutImagesAlerts,
  ] = await Promise.all([
    prisma.product.count({ where: { deletedAt: null } }),
    prisma.product.count({ where: OUT_OF_STOCK_WHERE }),
    prisma.product.count({ where: WITHOUT_IMAGES_WHERE }),
    prisma.brand.count({ where: { deletedAt: null } }),
    prisma.category.count({ where: { deletedAt: null } }),
    // Every role included — this KPI is "usuarios registrados en el
    // sistema," not a customer-only commercial metric. See
    // docs/ADMIN_DASHBOARD_V2.md.
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.product.findMany({
      where: OUT_OF_STOCK_WHERE,
      select: ALERT_SELECT,
      orderBy: ALERT_ORDER,
      take: ALERT_LIMIT,
    }),
    prisma.product.findMany({
      where: WITHOUT_IMAGES_WHERE,
      select: ALERT_SELECT,
      orderBy: ALERT_ORDER,
      take: ALERT_LIMIT,
    }),
  ]);

  return {
    metrics: {
      activeProducts,
      outOfStockProducts,
      productsWithoutImages,
      activeBrands,
      activeCategories,
      registeredUsers,
    },
    alerts: {
      outOfStock: outOfStockAlerts.map(toAlertProduct),
      withoutImages: withoutImagesAlerts.map(toAlertProduct),
    },
  };
}
