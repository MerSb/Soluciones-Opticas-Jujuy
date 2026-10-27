-- One row per Cloudinary file: registering a photo becomes idempotent and
-- two rows can never share (and later delete) the same file.
--
-- Fails with "could not create unique index … is duplicated" if any
-- public_id is repeated; nothing is changed then. Read-only check before
-- deploying:
--   SELECT cloudinary_public_id, count(*) FROM product_images
--   GROUP BY 1 HAVING count(*) > 1;
-- (0 rows on production, 2026-10-27.) Reversible: DROP INDEX
-- "product_images_cloudinary_public_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "product_images_cloudinary_public_id_key" ON "product_images"("cloudinary_public_id");
