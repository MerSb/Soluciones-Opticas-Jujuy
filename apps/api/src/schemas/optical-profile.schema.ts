import { z } from "zod";
import type {
  ColorFamily,
  FrameMaterial,
  FrameShape,
  StylePreference,
} from "@soluciones-opticas/shared";

// Runtime value lists, declared here rather than imported — Zod needs
// the actual array, and @soluciones-opticas/shared is deliberately
// type-only (see that package's optical-profile.ts for why: a runtime
// import here would break the compiled API on Railway, which has no
// TypeScript loader to resolve shared's raw .ts source). Keep in sync
// with the union types imported above by hand; `satisfies` below
// catches a value list that drifts out of sync with the type at
// compile time.
const FRAME_SHAPES = [
  "AVIATOR",
  "RECTANGULAR",
  "ROUND",
  "SQUARE",
  "CAT_EYE",
  "OVAL",
  "WRAP",
] as const satisfies readonly FrameShape[];

const FRAME_MATERIALS = [
  "METAL",
  "ACETATE",
  "TR90",
  "MIXED",
  "INJECTED",
  "NYLON",
] as const satisfies readonly FrameMaterial[];

const COLOR_FAMILIES = [
  "NEGRO",
  "CAREY",
  "DORADO",
  "PLATEADO",
  "AZUL",
  "ROJO",
  "VERDE",
  "TRANSPARENTE",
  "ROSA",
  "HABANO",
  "MULTICOLOR",
] as const satisfies readonly ColorFamily[];

const STYLE_PREFERENCES = [
  "CLASSIC",
  "MODERN",
  "MINIMALIST",
  "ELEGANT",
  "URBAN",
  "BOLD",
] as const satisfies readonly StylePreference[];

// Plausibility bounds to catch typos (0, 9999, negative values) — not
// medical or manufacturing tolerances. Reviewed against real eyewear
// sizing conventions; see docs/adr/0019-optical-profile-taxonomy.md for
// the exact reasoning per field.
const LENS_WIDTH_RANGE = { min: 30, max: 80 } as const;
const BRIDGE_WIDTH_RANGE = { min: 10, max: 35 } as const;
const TEMPLE_LENGTH_RANGE = { min: 100, max: 170 } as const;
const LENS_HEIGHT_RANGE = { min: 20, max: 60 } as const;

// Absent (undefined) means "don't touch this field" on a PATCH; `null`
// means "clear it to unknown" (§9/§37 of the brief) — never `0`.
function measurementField(range: { min: number; max: number }, label: string) {
  return z
    .number()
    .min(range.min, `${label} debe estar entre ${range.min} y ${range.max} mm.`)
    .max(range.max, `${label} debe estar entre ${range.min} y ${range.max} mm.`)
    .nullable()
    .optional();
}

// Deduplicated, not rejected, on a repeated value — a double-toggled
// chip in the UI is redundant input, not a validation error. Capped
// well above any vocabulary's real size purely to bound payload size.
function preferenceList<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .array(z.enum(values))
    .max(20)
    .optional()
    .transform((list) => (list ? Array.from(new Set(list)) : undefined));
}

export const updateOpticalProfileBodySchema = z.object({
  currentFrameLensWidth: measurementField(LENS_WIDTH_RANGE, "El ancho del lente"),
  currentFrameBridgeWidth: measurementField(BRIDGE_WIDTH_RANGE, "El ancho del puente"),
  currentFrameTempleLength: measurementField(TEMPLE_LENGTH_RANGE, "El largo de patilla"),
  currentFrameLensHeight: measurementField(LENS_HEIGHT_RANGE, "La altura del lente"),
  preferredShapes: preferenceList(FRAME_SHAPES),
  preferredMaterials: preferenceList(FRAME_MATERIALS),
  preferredColors: preferenceList(COLOR_FAMILIES),
  preferredStyles: preferenceList(STYLE_PREFERENCES),
});
export type UpdateOpticalProfileBody = z.infer<typeof updateOpticalProfileBodySchema>;
