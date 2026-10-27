// A Vercel preview has no VITE_API_BASE_URL (it's production-only) and
// isn't in the API's CORS list, so it calls its own origin, where the
// read-only preview proxy answers /api/* (apps/web/preview-api.ts).
// VITE_VERCEL_ENV is set by Vercel itself; production always has the URL.
const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.VITE_VERCEL_ENV === "preview" ? window.location.origin : undefined);

if (!apiBaseUrl) {
  throw new Error(
    "VITE_API_BASE_URL is not set. Copy apps/web/.env.example to apps/web/.env.local and set it.",
  );
}

// Optional, unlike apiBaseUrl — a real product-image `cloudinaryPublicId`
// simply can't be rendered without a cloud name to build a delivery URL
// against, but that must degrade to the branded placeholder, never a
// thrown startup error (local dev without Cloudinary credentials still
// needs to run). The cloud name is not a secret — it's a public part of
// every Cloudinary delivery URL a browser already sees.
const cloudinaryCloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || null;

export const env = { apiBaseUrl, cloudinaryCloudName };
