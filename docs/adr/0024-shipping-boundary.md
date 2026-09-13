# ADR-0024: Shipping boundary and free-shipping policy (Shipping V1 — Phase A)

**Status:** Approved.

## Context

The client confirmed two delivery methods — pickup at the store (Alvear 732, San Salvador de Jujuy)
and home delivery — and **free shipping to the whole country** (Jujuy included). Free for the
customer does not mean free for the business: every delivery has a real carrier cost that Soluciones
Ópticas absorbs and needs to know, to later decide pricing with real numbers.

The carrier is not chosen yet (Correo Argentino, OCA, Andreani and others were audited; none is
contracted), and the real package weight/dimensions and the store's postal code are not confirmed.
Checkout, Orders and Mercado Pago are a later milestone.

## Decisions

### Delivery methods and geography

`DeliveryMethod = "PICKUP" | "DELIVERY"` is a shared type only — no DB enum until `Order` needs one.
Destinations are Argentine only: the 24 ISO 3166-2:AR one-letter jurisdiction codes (also the codes
Correo Argentino uses), declared as typed runtime lists, not a table. Postal codes accept the 4-digit
form and the alphanumeric CPA, normalized (trim + uppercase); the province is never inferred from the
postal code and no external service validates it.

### Separate the three amounts

Policy `FREE_NATIONAL_V1` is a pure function (`applyShippingPolicy`), rules as code like ADR-0007:

| Case                           | providerShippingCost | customerShippingPrice | absorbedShippingCost |
| ------------------------------ | -------------------- | --------------------- | -------------------- |
| PICKUP                         | 0                    | 0                     | 0                    |
| DELIVERY, carrier cost known   | cost                 | **0**                 | cost                 |
| DELIVERY, carrier cost unknown | `null`               | **0**                 | `null`               |

Money is `Prisma.Decimal`. Unknown is `null`, never an invented number. Shipping never modifies any
product or lens price; the amount the customer pays for shipping (today always 0) is the only
shipping amount that will ever reach a customer total or Mercado Pago.

### Provider boundary

`services/shipping-provider.service.ts` is the only way to reach a carrier (same seam pattern as
`image-provider.service.ts`, `vi.mock()`'d in tests). A `ShippingProvider` exposes `code`,
`isConfigured()` and `quote(input)`; input is origin/destination postal codes, destination province,
package (grams/cm) and an optional declared value — enough for both audited carriers. Phase A
registers **no adapter**: the service returns a provider that is never configured, so quoting
resolves to `NOT_CONFIGURED`. No credentials, no environment variables, no network.

### Quote log vs. order cost status

Every attempt that reaches the provider stage is logged in `shipping_quotes` with a synchronous
outcome: `QUOTED`, `FAILED`, `NOT_COVERED` or `NOT_CONFIGURED`. `PENDING` is deliberately **not** a
quote status: it is reserved for the future `Order.shippingCostStatus` (an order placed while its
real carrier cost is still unknown). Logs store the package snapshot, the policy code, latency and a
sanitized error code — never tokens, headers or raw provider responses.

When the origin postal code or the default package profile is missing, no attempt is possible (there
is no valid snapshot): nothing is logged and the result lists the missing configuration.

### Origin and package

The origin is the store's `Branch` (earliest non-deleted one), which gains a nullable `postalCode`
— part of the physical address, not a separate setting. The package comes from admin-managed
`ShippingPackageProfile` rows; at most one active profile is the default, enforced in a transaction
serialized with a Postgres advisory lock (a partial unique index would be unmanaged by
`schema.prisma` and resurface as drift, like the pg_trgm index of ADR-0014). No values are seeded.

### No public endpoint yet

Phase A has no public consumer, so no public shipping endpoint is exposed; the admin simulator is
the only entry point. Checkout (Phase C) will add one that returns availability and
`customerShippingPrice` — never the carrier cost.

## Consequences

- Migration: `shipping_package_profiles`, `shipping_quotes`, nullable `branches.postal_code`, with
  manual `CHECK`s; the spurious `DROP INDEX "products_name_trgm_idx"` is removed by hand.
- Integrating a carrier (Phase B) is one adapter plus its environment variables; policy, log and
  admin stay unchanged.
- If the provider fails at checkout time, the customer price is unaffected (still 0); the order
  keeps an unknown cost to reconcile later.
