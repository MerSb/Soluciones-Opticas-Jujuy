import { useState } from "react";
import { ProductImageLightbox } from "./ProductImageLightbox";

export interface GalleryPhoto {
  /** What the enlarged view shows: a Cloudinary URL already in use
   * elsewhere (buildCloudinaryZoomUrl), or a local object URL. */
  src: string;
  /** Something already loaded on the page, shown until `src` arrives. */
  placeholderSrc?: string | null;
  alt: string;
  caption?: string;
}

/**
 * The enlarged view walking through several photos (‹ ›, ← →, "Imagen X de
 * N"). Only the photo on screen is requested: moving to another one asks
 * for that one alone, nothing is preloaded.
 */
export function ImageGalleryLightbox({
  photos,
  startIndex,
  onClose,
  closeOnBackdrop = false,
}: {
  photos: readonly GalleryPhoto[];
  startIndex: number;
  onClose: () => void;
  closeOnBackdrop?: boolean;
}) {
  const last = photos.length - 1;
  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), Math.max(last, 0)));
  const photo = photos[index];
  if (!photo) return null;
  return (
    <ProductImageLightbox
      src={photo.src}
      placeholderSrc={photo.placeholderSrc ?? null}
      alt={photo.alt}
      caption={photo.caption}
      position={{ index, total: photos.length }}
      onPrevious={index > 0 ? () => setIndex(index - 1) : undefined}
      onNext={index < last ? () => setIndex(index + 1) : undefined}
      onClose={onClose}
      closeOnBackdrop={closeOnBackdrop}
    />
  );
}
