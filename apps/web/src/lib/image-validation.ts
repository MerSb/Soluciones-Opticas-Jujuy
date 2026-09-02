// Client-side mirror of apps/api/src/lib/image-validation.ts — UX only
// (fast feedback before ever starting an upload), never the real gate;
// the server signs `allowed_formats` into the Cloudinary upload request
// itself, which is what actually enforces format server-side. Kept as
// its own runtime copy rather than imported from
// @soluciones-opticas/shared, same reasoning as every other canonical
// value list in this project (ADR-0015 — that package is type-only).

export const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    return "Formato de imagen no admitido. Usá JPEG, PNG o WebP.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `El archivo supera el tamaño permitido (máximo ${MAX_IMAGE_BYTES / (1024 * 1024)} MB).`;
  }
  return null;
}
