import { previewApiTargetProblem } from "./api-target";

// A Vercel preview has no VITE_API_BASE_URL (it's production-only) and
// isn't in the API's CORS list, so it calls its own origin, where the
// read-only preview proxy answers /api/* (apps/web/preview-api.ts).
// VITE_VERCEL_ENV is set by Vercel itself; production always has the URL.
// A Preview pointed at the production API refuses to start (api-target.ts).
const previewProblem = previewApiTargetProblem(
  import.meta.env.VITE_VERCEL_ENV,
  import.meta.env.VITE_API_BASE_URL,
);
if (previewProblem) throw new Error(previewProblem);

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

// Lenses are not sold online until the shop decides so (ADR-0036); must
// match the API's ONLINE_LENS_SALES. Off unless explicitly "on".
const onlineLensSales = import.meta.env.VITE_ONLINE_LENS_SALES === "on";

export const env = { apiBaseUrl, cloudinaryCloudName, onlineLensSales };
