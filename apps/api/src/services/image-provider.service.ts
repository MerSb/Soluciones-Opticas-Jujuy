import { randomUUID } from "node:crypto";
import { ApiError } from "../lib/api-error.js";
import { imageFolder } from "../lib/image-ownership.js";
import {
  destroyRemoteAsset,
  generateSignedUploadParams,
  isCloudinaryConfigured,
  remoteAssetExists,
  type UploadSignature,
} from "../lib/cloudinary.js";

// The provider service boundary (§26/§71 of the brief): every other
// module that needs an image-provider operation calls through here,
// never through lib/cloudinary.ts directly — this is the one seam
// `vi.mock()`'d in admin API tests, so ordinary test runs never touch
// the network or need real credentials. Pure/provider-mapping functions
// stay in lib/cloudinary.ts and are unit-tested independently (see
// test/lib/cloudinary.test.ts) with the Cloudinary SDK itself mocked.

export function isConfigured(): boolean {
  return isCloudinaryConfigured();
}

// Never trusts a client-supplied filename as part of the identifier
// (§11) — folder path is fully server-determined from real ids,
// suffixed with a fresh server-generated UUID, so there is no
// collision, no path traversal, and no private information (customer
// names, original filenames) ever encoded into a public_id. The folder is
// the one lib/image-ownership.ts accepts on create.
function buildPublicId(productId: string, variantId: string): string {
  return `${imageFolder(productId, variantId)}${randomUUID()}`;
}

export function requireConfigured(): void {
  if (!isConfigured()) {
    throw ApiError.badGateway(
      "El almacenamiento de imágenes no está configurado en este entorno. Contactá a un administrador.",
    );
  }
}

export function generateUploadSignature(productId: string, variantId: string): UploadSignature {
  requireConfigured();
  const publicId = buildPublicId(productId, variantId);
  return generateSignedUploadParams(publicId);
}

// Idempotent by design (see destroyRemoteAsset's own comment) — safe to
// call against a public_id that was already removed, which both of this
// function's callers (admin-products.service.ts's deleteImage and its
// orphan-cleanup path in createImage) may legitimately do.
export async function deleteRemoteAsset(publicId: string): Promise<void> {
  requireConfigured();
  try {
    await destroyRemoteAsset(publicId);
  } catch (error) {
    console.error("Cloudinary destroy failed", { publicId, error });
    throw ApiError.badGateway(
      "No se pudo eliminar la imagen del proveedor. Probá de nuevo en unos minutos.",
    );
  }
}

// Whether Cloudinary really stores this file — asked only when a client
// retries a photo it isn't sure finished uploading (createImage's
// verifyUpload), so a row never points to a file that isn't there. One
// Admin API read; a failure to answer is an error, never a guess.
export async function assetExists(publicId: string): Promise<boolean> {
  requireConfigured();
  try {
    return await remoteAssetExists(publicId);
  } catch (error) {
    console.error("Cloudinary existence check failed", { publicId, error });
    throw ApiError.badGateway(
      "No pudimos comprobar si la foto llegó a subirse. Probá de nuevo en unos minutos.",
    );
  }
}

// Best-effort — used only from admin-products.service.ts's createImage
// error path, to clean up an asset that was already successfully
// uploaded to Cloudinary before the DB write that was supposed to
// record it failed (§25 "orphan prevention"). Never lets a cleanup
// failure mask or replace the original error the caller is already
// about to surface — swallows and logs instead.
export async function tryCleanupOrphanedAsset(publicId: string): Promise<void> {
  if (!isConfigured()) return;
  try {
    await destroyRemoteAsset(publicId);
  } catch (error) {
    console.error("Best-effort orphan cleanup failed — asset may remain in Cloudinary", {
      publicId,
      error,
    });
  }
}
