import { env } from "./env";

// The one place a Cloudinary delivery URL is ever built (ADR-0010: the
// DB/API only ever carry a public_id, never a URL) — every component
// that renders a product image goes through here, never string-
// concatenates one itself. No Cloudinary SDK/dependency needed
// frontend-side; the delivery URL format is a stable, documented public
// contract (https://res.cloudinary.com/<cloud>/image/upload/
// <transformations>/<public_id>), confirmed against Cloudinary's own
// docs before implementing.

export interface CloudinaryUrlOptions {
  /** Target display width in px — becomes `w_<n>` plus f_auto/q_auto. */
  width: number;
}

// Returns null (never a broken/guessed URL) when no cloud name is
// configured — every caller already has a placeholder fallback for
// exactly this case (see ResponsiveImage).
export function buildCloudinaryUrl(
  publicId: string,
  { width }: CloudinaryUrlOptions,
): string | null {
  if (!env.cloudinaryCloudName) return null;
  // f_auto/q_auto: automatic format (WebP/AVIF where the requesting
  // browser supports it) and automatic quality — the two transforms
  // that matter most for real-world transferred size, applied on every
  // single delivery URL this app ever builds, never opted out of.
  const transformations = `f_auto,q_auto,w_${Math.round(width)}`;
  return `https://res.cloudinary.com/${env.cloudinaryCloudName}/image/upload/${transformations}/${publicId}`;
}

// A `srcset` string across a handful of widths so a phone never
// downloads a desktop-sized original (§16/§55) — deliberately a short,
// fixed list per context rather than one-per-integer-pixel; that would
// be overengineering for a catalog at this scale.
export function buildCloudinarySrcSet(publicId: string, widths: readonly number[]): string | null {
  if (!env.cloudinaryCloudName) return null;
  return widths
    .map((width) => `${buildCloudinaryUrl(publicId, { width })} ${Math.round(width)}w`)
    .join(", ");
}

// Named per rendering context (§15) rather than one global size — a
// catalog grid card, a product-detail hero image, and an admin
// thumbnail have genuinely different real display sizes.
export const CLOUDINARY_WIDTHS = {
  card: [320, 480, 640] as const,
  detailMain: [480, 800, 1200] as const,
  detailThumbnail: [64, 128] as const,
  adminThumbnail: [96, 160] as const,
};
