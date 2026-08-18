import { useEffect, useState } from "react";
import type { ProductImageDto } from "@soluciones-opticas/shared";
import { ProductImagePlaceholder } from "./ProductImagePlaceholder";

// Real thumbnail switching (keyboard-accessible, aria-selected tabs),
// even though every image is currently the same branded placeholder —
// see ProductImagePlaceholder. The interaction is real and ready; only
// the pixels are pending Cloudinary delivery-URL support.
export function ProductGallery({ images }: { images: ProductImageDto[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [images]);

  const selected = images[selectedIndex];

  return (
    <div>
      <ProductImagePlaceholder className="aspect-square w-full rounded-lg" />
      {selected && <p className="sr-only">{selected.alt}</p>}

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
              <ProductImagePlaceholder className="h-full w-full" />
              <span className="sr-only">{image.alt}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
