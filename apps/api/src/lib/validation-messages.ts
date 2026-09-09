import type { ZodError, ZodIssue } from "zod";

// Real Catalog Readiness §13/§14: every Zod validation failure used to
// surface as the same hardcoded "Invalid request body." — technical,
// in English, and useless to a non-technical admin trying to figure
// out which field they got wrong. This translates the *first* Zod
// issue (matching the existing convention of one message per
// ApiError — see docs/API.md "Error format") into a short, specific
// Spanish sentence, using only what Zod already tells us structurally
// (issue code, path, bounds) — never the field's own English `message`
// text, so nothing Zod-internal ever reaches the client. Unrecognized
// shapes fall back to one safe, generic Spanish sentence rather than
// guessing. `result.error.flatten()` is still attached separately as
// `details` for programmatic/debugging consumers — this only changes
// what's shown to a person.
const FIELD_LABELS: Record<string, string> = {
  name: "el nombre",
  email: "el email",
  password: "la contraseña",
  firstName: "el nombre",
  lastName: "el apellido",
  phone: "el teléfono",
  basePrice: "el precio",
  priceOverride: "el precio",
  stock: "el stock",
  sku: "el SKU",
  color: "el color",
  material: "el material",
  shape: "la forma",
  styles: "el estilo",
  brandId: "la marca",
  categoryId: "la categoría",
  description: "la descripción",
  logoPublicId: "el logo",
  cloudinaryPublicId: "la imagen",
  alt: "el texto alternativo",
  sortOrder: "el orden",
  isPrimary: "la imagen principal",
  lensWidth: "la medida",
  bridgeWidth: "la medida",
  templeLength: "la medida",
  lensHeight: "la medida",
  frameWidth: "la medida",
};

function labelFor(path: (string | number)[]): string {
  const key = path.find((segment): segment is string => typeof segment === "string");
  return (key && FIELD_LABELS[key]) || `el campo "${path.join(".")}"`;
}

const GENERIC_FALLBACK = "Revisá los datos ingresados e intentá de nuevo.";

function messageForIssue(issue: ZodIssue): string {
  const label = labelFor(issue.path);

  switch (issue.code) {
    case "too_small": {
      if (issue.type === "number") {
        if (issue.minimum === 0) {
          return issue.inclusive
            ? `${capitalize(label)} no puede ser negativo.`
            : `${capitalize(label)} debe ser mayor que 0.`;
        }
        return `${capitalize(label)} debe ser ${issue.inclusive ? "mayor o igual a" : "mayor que"} ${issue.minimum}.`;
      }
      if (issue.type === "string") {
        return issue.minimum <= 1
          ? `${capitalize(label)} no puede estar vacío.`
          : `${capitalize(label)} debe tener al menos ${issue.minimum} caracteres.`;
      }
      if (issue.type === "array") {
        return `${capitalize(label)} necesita al menos ${issue.minimum} elemento(s).`;
      }
      return GENERIC_FALLBACK;
    }
    case "too_big": {
      if (issue.type === "number") {
        return `${capitalize(label)} debe ser ${issue.inclusive ? "menor o igual a" : "menor que"} ${issue.maximum}.`;
      }
      if (issue.type === "string") {
        return `${capitalize(label)} es demasiado largo (máximo ${issue.maximum} caracteres).`;
      }
      if (issue.type === "array") {
        return `${capitalize(label)} tiene demasiados elementos (máximo ${issue.maximum}).`;
      }
      return GENERIC_FALLBACK;
    }
    case "invalid_type":
      return issue.received === "undefined"
        ? `Falta completar ${label}.`
        : `${capitalize(label)} tiene un formato inválido.`;
    case "invalid_enum_value":
      return `${capitalize(label)} no es un valor permitido.`;
    case "invalid_string":
      return `${capitalize(label)} no tiene un formato válido.`;
    default:
      return GENERIC_FALLBACK;
  }
}

function capitalize(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function friendlyValidationMessage(error: ZodError): string {
  const [firstIssue] = error.issues;
  return firstIssue ? messageForIssue(firstIssue) : GENERIC_FALLBACK;
}
