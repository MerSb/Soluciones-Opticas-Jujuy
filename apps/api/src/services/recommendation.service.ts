import type {
  ProductImageDto,
  ProductRecommendationResponseDto,
  RecommendationDto,
  RecommendationsResponseDto,
  StylePreference,
} from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { computeInStock } from "../lib/product-availability.js";
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
  styles: StylePreference[];
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

// Shared between loadCandidateProducts (the whole catalog, for the list
// endpoint) and loadCandidateProductBySlug (one product, for the
// per-product endpoint) — one place declaring exactly which columns the
// scoring core needs, so the two query paths can never quietly drift
// out of sync with each other.
const CANDIDATE_PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  shape: true,
  styles: true,
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
        orderBy: { sortOrder: "asc" as const },
        select: { cloudinaryPublicId: true, alt: true },
      },
    },
  },
} as const;

function toCandidateProductRow(product: {
  id: string;
  name: string;
  slug: string;
  shape: string | null;
  styles: StylePreference[];
  basePrice: { toNumber(): number };
  lensWidth: number | null;
  bridgeWidth: number | null;
  templeLength: number | null;
  lensHeight: number | null;
  frameWidth: number | null;
  brand: { name: string; slug: string };
  category: { name: string; slug: string };
  variants: {
    id: string;
    color: string | null;
    material: string | null;
    stock: number;
    priceOverride: { toNumber(): number } | null;
    images: { cloudinaryPublicId: string; alt: string }[];
  }[];
}): CandidateProductRow {
  return {
    ...product,
    basePrice: product.basePrice.toNumber(),
    variants: product.variants.map((variant) => ({
      ...variant,
      priceOverride: variant.priceOverride?.toNumber() ?? null,
    })),
  };
}

// Candidate set (§43): every non-deleted product, exactly the same
// `deletedAt: null` filter every other catalog query already uses —
// this schema has no separate "published"/"active" status field, so
// there is nothing else to exclude on. One query for products, with
// Prisma batching the nested variant/image `select`s (verified — see
// docs/adr/0020-recommendation-engine-v1.md "Performance"), not N+1.
async function loadCandidateProducts(): Promise<CandidateProductRow[]> {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: CANDIDATE_PRODUCT_SELECT,
  });
  return products.map(toCandidateProductRow);
}

// Same shape, one row — used by the per-product recommendation endpoint
// so it never has to load the entire catalog just to score one item.
async function loadCandidateProductBySlug(slug: string): Promise<CandidateProductRow | null> {
  const product = await prisma.product.findUnique({
    where: { slug, deletedAt: null },
    select: CANDIDATE_PRODUCT_SELECT,
  });
  return product ? toCandidateProductRow(product) : null;
}

async function loadProfile(userId: string): Promise<CustomerProfileInput> {
  const row = await prisma.customerOpticalProfile.findUnique({ where: { userId } });
  return row ? (row as CustomerProfileInput) : EMPTY_PROFILE;
}

// The one place a scored candidate becomes the public RecommendationDto
// shape — shared by the list endpoint (getRecommendations) and the
// single-product endpoint (getRecommendationForProduct) specifically so
// the two can never diverge on what a "recommendation" looks like (the
// brief's own explicit ask). Every field here reuses the same scoring-
// core concepts (score/tier/matchEvidence/evidenceLevel/reasons) — no
// second interpretation of the engine's output is invented for the
// single-product case.
function toRecommendationDto(
  product: CandidateProductRow,
  result: ScoredProduct,
): RecommendationDto {
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
      styles: product.styles,
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
      inStock: computeInStock(product.variants),
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

  const recommendations: RecommendationDto[] = rankedResults.map((result) =>
    toRecommendationDto(byProductId.get(result.productId)!, result),
  );

  return { recommendations, profileCoverage, confidenceLevel, profileIncomplete: false };
}

// Single-product counterpart to getRecommendations, for Product Detail
// V2's personalized-match section — same profile, same scoring core
// (scoreProduct), same DTO builder (toRecommendationDto), just against
// one candidate instead of the whole catalog. `recommendation: null`
// covers two distinct, equally legitimate cases the caller must
// distinguish via `profileIncomplete`: an empty profile (nothing to
// compare at all) vs. a real profile that simply has nothing
// comparable about this *specific* product (scoreProduct itself
// returned null — zero applicable weight, e.g. a product missing every
// dimension the customer stated and no shape/material/color/style
// overlap either). Returns `null` (not an error) when the product
// itself doesn't exist or is soft-deleted — the controller maps that to
// a 404, the same convention products.service.ts's getProductBySlug
// already uses.
export async function getRecommendationForProduct(
  userId: string,
  slug: string,
): Promise<ProductRecommendationResponseDto | null> {
  const product = await loadCandidateProductBySlug(slug);
  if (!product) return null;

  const profile = await loadProfile(userId);
  const profileCoverage = calculateProfileCoverage(profile);
  const confidenceLevel = coverageToConfidenceLevel(profileCoverage);

  if (profileCoverage === 0) {
    return { recommendation: null, profileCoverage: 0, confidenceLevel, profileIncomplete: true };
  }

  const result = scoreProduct(product, profile);
  if (!result) {
    return { recommendation: null, profileCoverage, confidenceLevel, profileIncomplete: false };
  }

  return {
    recommendation: toRecommendationDto(product, result),
    profileCoverage,
    confidenceLevel,
    profileIncomplete: false,
  };
}
