# ADR-0010: Store Cloudinary `public_id`, not the full delivery URL

**Status:** Approved

## Context

A Cloudinary delivery URL encodes the provider's domain and transform parameters. Storing full
URLs in `product_image.url` / `brand.logo_url` couples every image row to Cloudinary's URL
format; a future storage-provider migration would mean rewriting every row instead of one
function.

## Decision

`product_image` and `brand` store the Cloudinary `public_id`. The delivery URL (with the
appropriate transform) is constructed at render/request time by a single URL-builder function.

## Alternatives considered

Store the full URL — simpler to read directly from the DB, rejected: the coupling cost shows up
exactly when it's most expensive to pay it (mid-migration, across every row).

## Consequences

Any code that needs to display an image calls the URL-builder rather than reading a `url` column
directly. Changing image transforms (e.g., adding AVIF) is a function change, not a data
migration.
