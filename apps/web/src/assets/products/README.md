# Product photography

Not the active delivery path yet — see `../README.md`. Documented here so the convention exists
before the Cloudinary integration step needs it.

## Source spec

- **Angle:** consistent across the whole catalog — front view at minimum; 3/4 and side views where
  available give `ProductGallery` something real to show beyond a single image.
- **Background:** consistent (plain, neutral) across every product — a catalog grid with mixed
  backgrounds reads as unfinished.
- **Resolution:** high enough to stay sharp in `ProductDetailPage`'s gallery, not just the smaller
  `ProductCard` thumbnail size.
- **Format:** WebP/AVIF preferred once this becomes the real delivery path (Cloudinary can also
  handle format negotiation automatically — this spec may become moot once that integration
  happens, per ADR-0010).
