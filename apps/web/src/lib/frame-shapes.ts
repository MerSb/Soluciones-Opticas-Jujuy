import type { OfficialFrameShape } from "@soluciones-opticas/shared";

// The official frame shapes for the admin and the catalog filter
// (docs/CATALOGO_NORMALIZACION.md). Same list and synonyms as the API's
// apps/api/src/lib/frame-shapes.ts — synonyms are shown as help ("también
// se dice…") and never become options of their own.

export interface FrameShapeHelp {
  shape: OfficialFrameShape;
  description: string;
  alsoCalled: string[];
}

export const FRAME_SHAPE_HELP = [
  {
    shape: "Cat-eye",
    description: "Las puntas superiores se elevan hacia afuera.",
    alsoCalled: ["gatito", "ojo de gato", "cat eye"],
  },
  {
    shape: "Aviador",
    description: "Lente en forma de gota, más ancha arriba; suele tener doble puente.",
    alsoCalled: ["aviator", "piloto"],
  },
  {
    shape: "Ovalado",
    description: "Contorno curvo, más ancho que alto, sin esquinas.",
    alsoCalled: ["ovalada", "oval"],
  },
  { shape: "Redondo", description: "Lente circular.", alsoCalled: ["redonda", "circular"] },
  {
    shape: "Cuadrado",
    description: "Alto y ancho parecidos, con esquinas marcadas.",
    alsoCalled: ["cuadrada", "square"],
  },
  {
    shape: "Rectangular",
    description: "Más ancho que alto, con líneas rectas.",
    alsoCalled: ["rectángulo"],
  },
  {
    shape: "Mariposa",
    description: "Parte superior ancha que se angosta hacia abajo; suele ser grande.",
    alsoCalled: ["butterfly"],
  },
  { shape: "Hexagonal", description: "Seis lados visibles.", alsoCalled: ["exagonal", "hexágono"] },
  {
    shape: "Geométrico",
    description: "Otras formas con lados rectos: octogonal, rombo…",
    alsoCalled: ["octogonal", "rombo"],
  },
  {
    shape: "Envolvente",
    description: "Curvado alrededor del rostro, típico de deportivos.",
    alsoCalled: ["wrap"],
  },
] as const satisfies readonly FrameShapeHelp[];

export const OFFICIAL_SHAPES: readonly OfficialFrameShape[] = FRAME_SHAPE_HELP.map(
  (item) => item.shape,
);

export function isOfficialShape(value: string): value is OfficialFrameShape {
  return (OFFICIAL_SHAPES as readonly string[]).includes(value);
}

export function shapeHelp(shape: string): FrameShapeHelp | null {
  return FRAME_SHAPE_HELP.find((item) => item.shape === shape) ?? null;
}
