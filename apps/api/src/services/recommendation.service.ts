import type {
  ProductImageDto,
  RecommendationDto,
  RecommendationsResponseDto,
} from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import {
  calculateProfileCoverage,
  coverageToConfidenceLevel,
  rankScoredProducts,
  scoreProduct,
  scoreToTier,
  type CustomerProfileInput,
  type ScoredProduct,
} from "./recommendation/scoring.js";

const EMPTY_PROFILE: CustomerProfileInput = {
  currentFrameLensWidth: null,
  currentFrameBridgeWidth: null,
  currentFrameTempleLength: null,
  currentFrameLensHeight: null,
  preferredShapes: [],
  preferredMaterials: [],
  preferredColors: [],
  preferredStyles: [],
};

interface CandidateVariantRow {
  id: string;
  color: string | null;
  material: string | null;
  stock: number;
  priceOverride: number | null;
  images: { cloudinaryPublicId: string; alt: string }[];
}

interface CandidateProductRow {
  id: string;
  name: string;
  slug: string;
  shape: string | null;
  basePrice: number;
  lensWidth: number | null;
  bridgeWidth: number | null;
  templeLength: number | null;
  lensHeight: number | null;
  frameWidth: number | null;
  brand: { name: string; slug: string };
  category: { name: string; slug: string };
  variants: CandidateVariantRow[];
}

// Candidate set (§43): every non-deleted product, exactly the same
// `deletedAt: null` filter every other catalog query already uses —
// this schema has no separate "published"/"active" status field, so
// there is nothing else to exclude on. One query for products, with
// Prisma batching the nested variant/image `select`s (verified — see
// docs/adr/0020-recommendation-engine-v1.md "Performance"), not N+1.
// This richer row shape structurally satisfies scoring.ts's leaner
// `CandidateProductInput` (extra fields like `frameWidth`/`name` are
// simply unused by the scoring core) without needing an intersection
// type — deliberately kept as its own plain interface instead, since
// intersecting two object types that both declare `variants: X[]`
// produces a fragile, hard-to-reason-about element type.
async function loadCandidateProducts(): Promise<CandidateProductRow[]> {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      slug: true,
      shape: true,
      basePrice: true,
      lensWidth: true,
      bridgeWidth: true,
      templeLength: true,
      lensHeight: true,
      frameWidth: true,
      brand: { select: { name: true, slug: true } },
      category: { select: { name: true, slug: true } },
      variants: {
        select: {
          id: true,
          color: true,
          material: true,
          stock: true,
          priceOverride: true,
          images: {
            where: { isPrimary: true },
            take: 1,
            orderBy: { sortOrder: "asc" },
            select: { cloudinaryPublicId: true, alt: true },
          },
        },
      },
    },
  });

  return products.map((product) => ({
    ...product,
    basePrice: product.basePrice.toNumber(),
    variants: product.variants.map((variant) => ({
      ...variant,
      priceOverride: variant.priceOverride?.toNumber() ?? null,
    })),
  }));
}

async function loadProfile(userId: string): Promise<CustomerProfileInput> {
  const row = await prisma.customerOpticalProfile.findUnique({ where: { userId } });
  return row ? (row as CustomerProfileInput) : EMPTY_PROFILE;
}

export async function getRecommendations(
  userId: string,
  limit: number,
): Promise<RecommendationsResponseDto> {
  const profile = await loadProfile(userId);
  const profileCoverage = calculateProfileCoverage(profile);
  const confidenceLevel = coverageToConfidenceLevel(profileCoverage);

  // Nothing to compare against — return early rather than scoring
  // every product at a meaningless 0 (§38 of the brief: a deliberate
  // response, never a 500, never a misleading full result set).
  if (profileCoverage === 0) {
    return { recommendations: [], profileCoverage: 0, confidenceLevel, profileIncomplete: true };
  }

  const candidates = await loadCandidateProducts();

  const scoredCandidates: { product: CandidateProductRow; result: ScoredProduct }[] = [];
  for (const product of candidates) {
    const result = scoreProduct(product, profile);
    if (result) scoredCandidates.push({ product, result });
  }

  const rankedResults = rankScoredProducts(scoredCandidates.map((c) => c.result)).slice(0, limit);
  const byProductId = new Map(scoredCandidates.map((c) => [c.result.productId, c.product]));

  const recommendations: RecommendationDto[] = rankedResults.map((result) => {
    const product = byProductId.get(result.productId)!;
    const bestVariantRow = product.variants.find((v) => v.id === result.bestVariant.id)!;

    const colors = Array.from(
      new Set(product.variants.map((v) => v.color).filter((c): c is string => Boolean(c))),
    ).sort();
    const image: ProductImageDto | null = (() => {
      const withImage = product.variants.find((v) => v.images[0]);
      const primary = withImage?.images[0];
      return primary
        ? { publicId: primary.cloudinaryPublicId, alt: primary.alt, isPrimary: true }
        : null;
    })();

    return {
      product: {
        name: product.name,
        slug: product.slug,
        brand: product.brand,
        category: product.category,
        shape: product.shape,
        price: bestVariantRow.priceOverride ?? product.basePrice,
        frameMeasurements: {
          lensWidth: product.lensWidth,
          bridgeWidth: product.bridgeWidth,
          templeLength: product.templeLength,
          lensHeight: product.lensHeight,
          frameWidth: product.frameWidth,
        },
        colors,
        image,
      },
      score: result.score,
      tier: scoreToTier(result.score),
      // Per-recommendation evidence — deliberately distinct from
      // profileCoverage (response-level, customer-only): this accounts
      // for gaps on *this specific* candidate too (see the DTO's own
      // doc comment). Reuses the same LOW/MEDIUM/HIGH thresholds as
      // profile-level confidenceLevel — one centralized bucketing rule
      // for both.
      matchEvidence: result.coverage,
      evidenceLevel: coverageToConfidenceLevel(result.coverage),
      reasons: result.reasons,
      bestVariant: {
        id: bestVariantRow.id,
        color: bestVariantRow.color,
        material: bestVariantRow.material,
        inStock: bestVariantRow.stock > 0,
      },
    };
  });

  return { recommendations, profileCoverage, confidenceLevel, profileIncomplete: false };
}
