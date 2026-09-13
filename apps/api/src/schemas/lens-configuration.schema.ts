import { z } from "zod";
import type { GraduationMode } from "@soluciones-opticas/shared";

// Runtime list declared here, not imported — @soluciones-opticas/shared
// is type-only (ADR-0015). `satisfies` catches drift at compile time.
const GRADUATION_MODES = ["NONE", "CUSTOM"] as const satisfies readonly GraduationMode[];

// GET /api/products/:slug/quote — ids only, never a price or a total:
// the backend recomputes everything (ADR-0023). Flat query params so the
// endpoint stays a plain, idempotent, cacheable GET.
export const eyewearQuoteQuerySchema = z.object({
  variantId: z.string().uuid(),
  lensTypeId: z.string().uuid().optional(),
  lensOptionId: z.string().uuid().optional(),
  graduationMode: z.enum(GRADUATION_MODES).optional().default("NONE"),
});
export type EyewearQuoteQuery = z.infer<typeof eyewearQuoteQuerySchema>;
