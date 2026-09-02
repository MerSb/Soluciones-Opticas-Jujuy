import type {
  ColorFamily,
  FrameMaterial,
  FrameShape,
  StylePreference,
} from "@soluciones-opticas/shared";

// Canonical machine values paired with their Spanish UI label — the
// pairing has to live here (not in @soluciones-opticas/shared, which is
// type-only; see that package's optical-profile.ts) since a label map
// is real runtime data. `satisfies` catches this list drifting out of
// sync with the shared union type at compile time.
export const FRAME_SHAPE_OPTIONS = [
  { value: "AVIATOR", label: "Aviador" },
  { value: "RECTANGULAR", label: "Rectangular" },
  { value: "ROUND", label: "Redondo" },
  { value: "SQUARE", label: "Cuadrado" },
  { value: "CAT_EYE", label: "Cat-eye" },
  { value: "OVAL", label: "Ovalado" },
  { value: "WRAP", label: "Envolvente" },
] as const satisfies readonly { value: FrameShape; label: string }[];

export const FRAME_MATERIAL_OPTIONS = [
  { value: "METAL", label: "Metal" },
  { value: "ACETATE", label: "Acetato" },
  { value: "TR90", label: "TR90" },
  { value: "MIXED", label: "Mixto" },
  { value: "INJECTED", label: "Inyectado" },
  { value: "NYLON", label: "Nylon" },
] as const satisfies readonly { value: FrameMaterial; label: string }[];

export const COLOR_FAMILY_OPTIONS = [
  { value: "NEGRO", label: "Negro" },
  { value: "CAREY", label: "Carey" },
  { value: "DORADO", label: "Dorado" },
  { value: "PLATEADO", label: "Plateado" },
  { value: "AZUL", label: "Azul" },
  { value: "ROJO", label: "Rojo" },
  { value: "VERDE", label: "Verde" },
  { value: "TRANSPARENTE", label: "Transparente" },
  { value: "ROSA", label: "Rosa" },
  { value: "HABANO", label: "Habano" },
  { value: "MULTICOLOR", label: "Multicolor" },
] as const satisfies readonly { value: ColorFamily; label: string }[];

export const STYLE_PREFERENCE_OPTIONS = [
  { value: "CLASSIC", label: "Clásico" },
  { value: "MODERN", label: "Moderno" },
  { value: "MINIMALIST", label: "Minimalista" },
  { value: "ELEGANT", label: "Elegante" },
  { value: "URBAN", label: "Urbano" },
  { value: "BOLD", label: "Audaz" },
] as const satisfies readonly { value: StylePreference; label: string }[];
