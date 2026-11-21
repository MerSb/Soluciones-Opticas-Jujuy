import { useRef, useState } from "react";
import type { AdminImageDto } from "@soluciones-opticas/shared";
import { ProductImage } from "../../components/products/ProductImage";
import { ImageGalleryLightbox } from "../../components/products/ImageGalleryLightbox";
import { MagnifierIcon } from "../../components/products/ProductImageZoom";
import {
  CLOUDINARY_WIDTHS,
  buildCloudinaryUrl,
  buildCloudinaryZoomUrl,
} from "../../lib/cloudinary";
import { useAdminModelSuggestionsQuery } from "../../services/queries/admin";
import { variantCaption } from "./AdminSkuSearchResults";

/** The suggested model code of each of this product's SKUs, read from the
 * «Posibles variantes del mismo modelo» query the page already makes (same
 * cache, no extra request). A suggestion only — never a confirmed group. */
export function useSuggestedModelCodes(productId: string): ReadonlyMap<string, string> {
  const { data } = useAdminModelSuggestionsQuery(productId);
  const codes = new Map<string, string>();
  if (data && Array.isArray(data.groups)) {
    for (const group of data.groups) {
      for (const sku of Array.isArray(group.ownSkus) ? group.ownSkus : [])
        codes.set(sku, group.code);
    }
  }
  return codes;
}

/**
 * The variant's main photo next to its SKU, color and stock, so the right
 * variant is recognized before changing its stock. «Ver grande» opens the
 * variant's photos in the enlarged view — read only: it saves nothing and
 * leaves whatever is typed in the card (e.g. an unsaved stock) as it is.
 */
export function VariantPhotoPreview({
  images,
  sku,
  color,
  alt,
  modelCode,
}: {
  images: AdminImageDto[];
  sku: string;
  color: string | null;
  alt: string;
  modelCode: string | null;
}) {
  const [viewing, setViewing] = useState<string | null | false>(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const main = images[0];

  if (!main) {
    return (
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-surface-muted p-1 text-center text-xs text-text-muted">
        Sin fotos
      </div>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-label={`Ver grande la foto de ${sku} (${color ?? "sin color"})`}
        title="Ver grande"
        onClick={(event) =>
          setViewing(event.currentTarget.querySelector("img")?.currentSrc || null)
        }
        className="relative w-20 shrink-0 cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ProductImage
          publicId={main.cloudinaryPublicId}
          alt=""
          widths={CLOUDINARY_WIDTHS.adminThumbnail}
          aspectRatio="1 / 1"
          className="w-20 rounded-md"
        />
        <span
          aria-hidden="true"
          className="absolute bottom-1 right-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface/95 text-text shadow ring-1 ring-border"
        >
          <MagnifierIcon />
        </span>
      </button>

      {viewing !== false && (
        <ImageGalleryLightbox
          startIndex={0}
          closeOnBackdrop
          photos={images.map((image, index) => ({
            src:
              buildCloudinaryZoomUrl(image.cloudinaryPublicId) ??
              buildCloudinaryUrl(image.cloudinaryPublicId, { width: 160 }) ??
              "",
            placeholderSrc: index === 0 ? viewing : null,
            alt,
            caption: variantCaption(sku, color, modelCode),
          }))}
          onClose={() => {
            setViewing(false);
            triggerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}
