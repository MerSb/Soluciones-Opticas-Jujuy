// Customer optical/style profile contracts — see
// docs/adr/0019-optical-profile-taxonomy.md for the full reasoning
// behind these vocabularies and why they're separate from the catalog's
// own free-text `Product.shape`/`ProductVariant.material`/`.color`.
//
// Type-only, deliberately — same constraint as the rest of this package
// (ADR-0015): `packages/shared`'s `main` points directly at this raw
// .ts source with no build step, which only works because nothing here
// is ever imported as real runtime code by the compiled API (every
// import in apps/api is `import type`). A `FRAME_SHAPES` runtime array
// living here would need Zod (`z.enum(FRAME_SHAPES)`) to import it as
// a genuine value, not a type — and `node dist/server.js` on Railway
// has no TypeScript loader to resolve a `.ts` file at that point. Each
// canonical value list is instead declared once in apps/api (for Zod)
// and once in apps/web (paired with its Spanish label, which the type
// union alone could never carry) — both cross-reference this file as
// the source of truth for the union.

export type FrameShape =
  "AVIATOR" | "RECTANGULAR" | "ROUND" | "SQUARE" | "CAT_EYE" | "OVAL" | "WRAP";

export type FrameMaterial = "METAL" | "ACETATE" | "TR90" | "MIXED" | "INJECTED" | "NYLON";

export type ColorFamily =
  | "NEGRO"
  | "CAREY"
  | "DORADO"
  | "PLATEADO"
  | "AZUL"
  | "ROJO"
  | "VERDE"
  | "TRANSPARENTE"
  | "ROSA"
  | "HABANO"
  | "MULTICOLOR";

export type StylePreference = "CLASSIC" | "MODERN" | "MINIMALIST" | "ELEGANT" | "URBAN" | "BOLD";

export interface OpticalProfileDto {
  currentFrameLensWidth: number | null;
  currentFrameBridgeWidth: number | null;
  currentFrameTempleLength: number | null;
  currentFrameLensHeight: number | null;
  preferredShapes: FrameShape[];
  preferredMaterials: FrameMaterial[];
  preferredColors: ColorFamily[];
  preferredStyles: StylePreference[];
}

// All optional — a PATCH may touch just the measurements, just one
// preference category, or everything at once (§8/§19 of the
// optical-profile brief).
export interface UpdateOpticalProfileRequest {
  currentFrameLensWidth?: number | null;
  currentFrameBridgeWidth?: number | null;
  currentFrameTempleLength?: number | null;
  currentFrameLensHeight?: number | null;
  preferredShapes?: FrameShape[];
  preferredMaterials?: FrameMaterial[];
  preferredColors?: ColorFamily[];
  preferredStyles?: StylePreference[];
}
