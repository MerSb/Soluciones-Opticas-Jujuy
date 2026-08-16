# ADR-0004: `product_variants` from Etapa 1, even at 1:1 cardinality

**Status:** Approved

## Context

Real optical retail commonly sells the same frame model in multiple colors, each independently
stocked. Retrofitting a variant model onto a flat `products` table after catalog UI, filters,
and favorites are already built against `productId` is a materially more expensive migration
than starting with the join.

## Decision

`product_variants` (color, material, SKU, stock, optional price override) exists from Etapa 1,
even for products that currently have exactly one variant.

## Alternatives considered

Flat `products` table with color/material as scalar columns, add variants later if needed —
rejected: cheap now, expensive later is exactly the wrong direction for a table that everything
downstream (favorites, cart, orders) will eventually reference by variant, not product.

## Consequences

Product detail and catalog queries join through `product_variant` from the start. Contingent on
confirming with the client whether stock is genuinely tracked per color — if not, variants still
ship, just with a single row per product until that changes.
