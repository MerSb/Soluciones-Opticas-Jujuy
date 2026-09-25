# ADR-0025: Order domain, snapshots and atomic stock reservation (Payments V1 — Phase A)

**Status:** Approved (Phase A implemented; payment provider pending).

## Context

The client confirmed Mercado Pago, full online payment, guest checkout (no account required), pickup
at the store and home delivery (ADR-0024). Before any provider is integrated, the shop needs a
transactional order domain that cannot oversell, keeps commercial history after the catalog changes
(`ProductVariant` is a hard delete, ADR-0021) and never trusts a price from the client (ADR-0023).

## Decisions

### No cart in the database

There is no `Cart`/`CartItem`. The cart is frontend state (Phase C). An `Order` is born only when the
customer confirms checkout, and the backend re-resolves every line with
`resolveEyewearConfigurationDetails()` — the same function behind the public quote — before creating
it. The caller sends ids, graduation mode and quantity only; names, prices, totals, treatments and
stock are always derived server-side.

### Order, OrderItem, Payment, PaymentEvent

- `Order`: UUID id, readable `orderNumber`, `publicAccessTokenHash`, nullable `userId` (`SetNull`),
  contact / delivery / pickup / billing snapshots, money, shipping amounts and status timestamps.
- `OrderItem`: nullable `SetNull` FKs to product, variant, lens type and lens option, plus snapshots
  of everything bought (names, SKU, color, material, lens names, treatment names, graduation mode,
  frame/lens/unit price, quantity, line total). Editing or deleting catalog rows never changes an
  order.
- `Payment` (0..N per order, a retry is a new row): provider as a plain string, `idempotencyKey`
  unique, `UNIQUE(provider, providerPaymentId)` — Postgres treats NULLs as distinct, so rows without a
  provider id yet coexist.
- `PaymentEvent`: the future webhook ledger, `UNIQUE(provider, providerEventId)`.

`OrderStatus` (`PENDING_PAYMENT`, `PAID`, `PAID_NEEDS_REVIEW`, `CANCELLED`, `EXPIRED`) is separate
from `PaymentStatus`. No logistics states until a fulfilment flow exists.

### Stock reservation = immediate atomic decrement

Creating a `PENDING_PAYMENT` order decrements stock in the same transaction as the order rows, with a
conditional update per resource (`UPDATE … WHERE id = ? AND stock >= qty`, row count must be 1).
Never read → check → update. Any failure (`409 OUT_OF_STOCK`) rolls back the whole transaction: no
order, no item, no partial stock change. Quantities of the same variant/option across lines are summed
first.

Lens options follow ADR-0023: `stock = null` is not tracked and never decremented; tracked options
are decremented by the line quantity (one lens pair per frame). Whether a line took lens stock is
stored (`lensStockReserved`) so a release gives back exactly what was taken.

**Lock order** — every transaction touches rows as: order row (expiry / late payment) → variants by id
→ lens options by id. Transactions over the same resources queue instead of deadlocking.

The reservation lasts `PAYMENT_STOCK_RESERVATION_MINUTES = 30` (`lib/order-policy.ts`, the only place
the number exists).

### Expiry and late approval

`expireOrderReservation()` claims the order with a conditional update (`PENDING_PAYMENT`, reservation
past, `stockReleasedAt IS NULL` → `EXPIRED`, `stockReleasedAt = now`) and returns stock only when it
won that claim — idempotent under repeated and concurrent calls. `releaseExpiredReservations()` is the
sweep entry point; no cron yet.

`markOrderPaid()` is provider-agnostic: pending → `PAID`; expired → `PAID` if every unit can be
re-taken atomically, otherwise `PAID_NEEDS_REVIEW` with stock untouched; never an automatic refund.
Invariant: `stockReleasedAt IS NOT NULL` ⇔ the order holds no stock.

### Order number and guest access

`orderNumber` (`SOJ-000042`) comes from the Postgres sequence `order_number_seq` (manual SQL): unique
under concurrency, never `MAX + 1` or a row count. It is not a secret.

Guest access uses a separate 32-byte random token; only its SHA-256 hash is stored (same scheme as
the refresh token, ADR-0018) and it is compared in constant time. The raw token is returned once at
creation. The future endpoint will read it from the `X-Order-Access-Token` header — never a query
string, because the request logger records `originalUrl`.

### Money

`Decimal(12,2)` everywhere, computed as `Prisma.Decimal` in the domain; `number` only when serializing
a DTO. Manual CHECKs: amounts `>= 0`, `payments.amount > 0`, `quantity > 0`,
`unit_price = frame_price + lens_price`, `line_total = unit_price * quantity`,
`grand_total = items_subtotal + customer_shipping_price`, currency `^[A-Z]{3}$`. Shipping keeps the
three ADR-0024 amounts separate; a delivery order without a carrier quote stores the carrier cost as
`NULL` with `shippingCostStatus = PENDING`.

### Out of scope

No clinical data (a `CUSTOM` graduation is a mode plus a flag), no invented fiscal fields (only
`invoiceRequested` and optional billing name / tax id / address; ARCA is its own milestone), no
PaymentProvider or Mercado Pago integration, no HTTP endpoint, no webhook yet.

## Consequences

- Stock is held for 30 minutes per pending order; abandoned checkouts depend on the expiry sweep
  being scheduled (Phase B/infra).
- A payment approved after expiry can end in `PAID_NEEDS_REVIEW`, which needs a human workflow.
- Every catalog FK on `order_items` may become `NULL`; readers must use the snapshots.
