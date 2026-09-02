import { v2 as cloudinary } from "cloudinary";
import { env } from "./env.js";
import { ALLOWED_IMAGE_FORMATS } from "./image-validation.js";

// The only module that touches the Cloudinary SDK directly — everything
// else (services/image-provider.service.ts, controllers) goes through
// that service boundary, never this file, so provider details never
// leak past one place and normal API tests can mock the service without
// ever loading the real SDK. See
// docs/adr/0022-cloudinary-image-pipeline.md.

export function isCloudinaryConfigured(): boolean {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

// Configured lazily, once, on first real use rather than at import time
// — importing this module must never throw just because Cloudinary
// isn't configured in this environment (local dev without credentials
// still needs the rest of the app to run).
let configured = false;
function ensureConfigured(): void {
  if (configured) return;
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary is not configured — call isCloudinaryConfigured() first.");
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  allowedFormats: string;
}

// Signs exactly the parameters the browser must send back to Cloudinary
// (public_id, timestamp, allowed_formats) — nothing else, and never the
// API secret itself. `publicId` is expected to already be the *full*
// desired path (e.g. "soluciones-opticas/staging/products/<id>/<id>/
// <uuid>") — deliberately not split into a separate `folder` param:
// Cloudinary's folder+public_id concatenation behavior differs between
// "Fixed" and "Dynamic" folder modes on an account, which this project
// has no way to confirm without real credentials, so a single
// unambiguous `public_id` sidesteps that entirely. `allowed_formats` is
// a real, documented, signable Cloudinary upload parameter (confirmed
// against Cloudinary's own API reference before implementing) —
// enforced by Cloudinary itself on the upload it signs, not just
// advisory, and a client can't strip it without invalidating the
// signature.
export function generateSignedUploadParams(publicId: string): UploadSignature {
  ensureConfigured();
  const timestamp = Math.round(Date.now() / 1000);
  const allowedFormats = ALLOWED_IMAGE_FORMATS.join(",");
  const paramsToSign = { public_id: publicId, timestamp, allowed_formats: allowedFormats };
  const signature = cloudinary.utils.api_sign_request(paramsToSign, env.CLOUDINARY_API_SECRET!);
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
    apiKey: env.CLOUDINARY_API_KEY!,
    timestamp,
    signature,
    publicId,
    allowedFormats,
  };
}

export type DestroyResult = "ok" | "not_found";

// Cloudinary's Node SDK resolves (never rejects) with `{ result: "ok" }`
// or `{ result: "not found" }` for a destroy call against a real vs.
// already-gone public_id — both are 200-level, successful API calls;
// only a genuine network/auth/provider failure rejects the promise.
// Treating "not found" as success too is what makes deletion idempotent
// (see admin-products.service.ts's deleteImage and the orphan-cleanup
// path in createImage — both may call this against an asset that's
// already gone).
export async function destroyRemoteAsset(publicId: string): Promise<DestroyResult> {
  ensureConfigured();
  const response = await cloudinary.uploader.destroy(publicId, { invalidate: true });
  return response.result === "ok" ? "ok" : "not_found";
}
