import { useEffect, useState } from "react";
import type { ProductImageDto } from "@soluciones-opticas/shared";
import { ProductImage } from "./ProductImage";
import { CLOUDINARY_WIDTHS } from "../../lib/cloudinary";

// Real thumbnail switching (keyboard-accessible, aria-selected tabs)
// over real Cloudinary-delivered images — each thumbnail is its own
// `ProductImage`, so a demo/broken publicId on one thumbnail falls back
// to the placeholder independently, never breaking the whole gallery.
export function ProductGallery({ images }: { images: ProductImageDto[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [images]);

  const selected = images[selectedIndex];

  return (
    <div>
      <ProductImage
        publicId={selected?.publicId ?? null}
        alt={selected?.alt ?? ""}
        widths={CLOUDINARY_WIDTHS.detailMain}
        sizes="(min-width: 1024px) 50vw, 100vw"
        aspectRatio="1 / 1"
        className="w-full rounded-lg"
        eager
      />

      {images.length > 1 && (
        <div role="tablist" aria-label="Imágenes del producto" className="mt-3 flex gap-2">
          {images.map((image, index) => (
            <button
              key={image.publicId}
              type="button"
              role="tab"
              aria-selected={index === selectedIndex}
              onClick={() => setSelectedIndex(index)}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border ${
                index === selectedIndex ? "border-primary" : "border-border"
              }`}
            >
              <ProductImage
                publicId={image.publicId}
                alt={image.alt}
                widths={CLOUDINARY_WIDTHS.detailThumbnail}
                aspectRatio="1 / 1"
                className="h-full w-full"
              />
              <span className="sr-only">{image.alt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
