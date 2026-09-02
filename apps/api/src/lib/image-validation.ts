// Centralized product-image upload limits — the single place these
// numbers are ever written server-side. Mirrored (not imported; see
// @soluciones-opticas/shared's own type-only constraint, ADR-0015) in
// apps/web/src/lib/image-validation.ts for client-side pre-validation —
// that copy is UX only, never trusted as the real gate.
//
// Formats: JPEG/PNG/WebP cover real eyewear product photography and
// every common export path a client or their photographer would use.
// AVIF was evaluated (§12 of the brief) and deliberately left out of
// V1: browser *encoder* support for taking/exporting AVIF photos is
// still inconsistent enough that requiring it from a non-technical
// client is more friction than benefit, and Cloudinary already
// transcodes *delivery* to AVIF automatically via f_auto regardless of
// the uploaded source format — so declining AVIF as an upload input
// costs nothing on the delivery side. Revisit if a real client photo
// arrives in that format and gets rejected.
export const ALLOWED_IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp"] as const;

// 8 MB: generous for a real product photo (even a high-resolution
// smartphone JPEG rarely exceeds a few MB) while still bounding the
// direct browser-to-Cloudinary transfer to something that fails fast on
// a bad connection rather than hanging. Enforced client-side before the
// browser ever starts the upload (see apps/web's mirror) — Cloudinary
// has no documented signed-request parameter that enforces a max byte
// size server-side (verified against Cloudinary's own upload API
// reference before implementing; only `allowed_formats` is a real,
// signable, server-enforced parameter). This is a deliberate, named V1
// limitation: a determined client bypassing the browser check entirely
// could still upload a larger file directly to Cloudinary. Revisit via
// an unsigned upload preset's own dashboard-configured size cap, or a
// Cloudinary "eager"/webhook-based post-upload rejection, if this
// proves to matter in practice.
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
