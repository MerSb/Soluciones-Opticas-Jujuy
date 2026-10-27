import { env } from "./env.js";

// Which Cloudinary files a variant may point to — and so which ones our API
// may ever delete. Every upload is signed under this folder
// (image-provider.service.ts), so a photo of a variant is always
//   soluciones-opticas/<APP_ENV>/products/<productId>/<variantId>/<uuid>
// (APP_ENV is "staging" on the current production deploy: that is the
// folder its photos live in). Anything else — another variant's file,
// another environment's, or a made-up id — is refused on create and never
// destroyed. Pure functions: deliberately outside the provider module that
// API tests mock, so the real rule is what every test exercises.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function imageFolder(productId: string, variantId: string): string {
  return `soluciones-opticas/${env.APP_ENV}/products/${productId}/${variantId}/`;
}

/** The public_id is exactly a file of this product's variant, in this environment. */
export function isOwnedPublicId(publicId: string, productId: string, variantId: string): boolean {
  const folder = imageFolder(productId, variantId);
  return publicId.startsWith(folder) && UUID.test(publicId.slice(folder.length));
}
