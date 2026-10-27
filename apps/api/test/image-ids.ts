import { randomUUID } from "node:crypto";
import { imageFolder } from "../src/lib/image-ownership.js";

/** A new public_id the API accepts for this variant (lib/image-ownership.ts). */
export function ownedPublicId(productId: string, variantId: string): string {
  return `${imageFolder(productId, variantId)}${randomUUID()}`;
}
