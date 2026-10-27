import type { OfficialFrameShape } from "@soluciones-opticas/shared";

// The official frame shapes for the admin and the catalog filter
// (docs/CATALOGO_NORMALIZACION.md). Same list and synonyms as the API's
// apps/api/src/lib/frame-shapes.ts — synonyms are shown as help ("también
// se dice…") and never become options of their own.

export interface FrameShapeHelp {
  shape: OfficialFrameShape;
  description: string;
  alsoCalled: string[];
  /** Approved old values that are not other names of the shape (a model). */
  oldValues?: string[];
}

export const FRAME_SHAPE_HELP = [
  {
    shape: "Cat-eye",
    description: "Las puntas de arriba suben hacia los costados, como los ojos de un gato.",
    alsoCalled: ["gatito", "ojo de gato", "cat eye"],
  },
  {
    shape: "Aviador",
    description:
      "Forma de gota, más ancha arriba; muchas veces con una barrita doble sobre la nariz.",
    alsoCalled: ["aviator", "piloto", "semi-aviador", "aviador cuadrado"],
  },
  {
    shape: "Ovalado",
    description: "Contorno curvo, más ancho que alto, sin esquinas.",
    alsoCalled: ["ovalada", "oval"],
  },
  {
    shape: "Redondo",
    description: "Lente redonda, como un círculo.",
    alsoCalled: ["redonda", "circular"],
  },
  {
    shape: "Cuadrado",
    description: "Alto y ancho parecidos, con esquinas marcadas.",
    alsoCalled: ["cuadrada", "square", "cuadrado redondeado"],
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
  {
    shape: "Hexagonal",
    description: "Seis lados visibles, como una celda de panal. Los modelos Caravan van acá.",
    alsoCalled: ["exagonal", "hexágono"],
    oldValues: ["caravan"],
  },
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

const plain = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The official shape an old value stands for ("Gatito" → Cat-eye,
 * "Caravan" → Hexagonal), to suggest it in the admin; null when unknown. */
export function officialShapeFor(value: string): OfficialFrameShape | null {
  const target = plain(value);
  return (
    FRAME_SHAPE_HELP.find((item) =>
      [...item.alsoCalled, ...("oldValues" in item ? item.oldValues : [])].some(
        (name) => plain(name) === target,
      ),
    )?.shape ?? null
  );
}
