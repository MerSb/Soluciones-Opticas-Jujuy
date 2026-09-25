# ADR-0026: Mercado Pago Checkout Pro via the Orders API (Payments V1 — Phase D1)

**Status:** Approved — D1 (payment initiation) implemented in TEST mode; confirmation (webhook) is D2.

## Context

Orders, stock reservation, checkout and the order pages exist (ADR-0025). The client chose Mercado
Pago with full online payment. This is a new integration. Mercado Pago documents two ways to
integrate Checkout Pro: the classic **Preferences API** (`POST /checkout/preferences`) and
**Checkout Pro via the Orders API** (`POST /v1/orders`, which returns a `checkout_url`).

Official documentation consulted on 2026-09-25 (mercadopago.com.ar/developers):

- Checkout Pro overview — `/developers/en/docs/checkout-pro/overview` (lists both approaches)
- Checkout Pro via Orders API — create and configure the order —
  `/developers/en/docs/checkout-pro-orders/create-order`
- Checkout Pro via Orders API — configure back URLs —
  `/developers/en/docs/checkout-pro-orders/web-integration/configure-back-urls`
- API reference — get order — `/developers/en/reference/online-payments/checkout-api/get-order/get`
- Official Node SDK — github.com/mercadopago/sdk-nodejs, npm `mercadopago` 3.6.1

## Decisions

### Orders API, not Preferences

Checkout Pro is integrated through `POST /v1/orders` (`type: "online"`, `processing_mode:
"manual"`, amounts as decimal strings, `external_reference`, `items`, `payer`,
`config.online.{success,pending,failure}_url`, `auto_return`, `expiration_time`), redirecting the
buyer to the returned `checkout_url`. No preference object exists in this integration, so nothing
is stored as a "preference": `Payment.providerOrderId` holds the remote order id (additive
migration); `providerPreferenceId` stays unused.

### Official SDK, pinned, with our own timeout and retry policy

The official SDK (`mercadopago`, pinned to `3.6.1`, no runtime dependencies) types the Orders API
including `checkout_url` and `config.online`. It is used server-side only, behind the
`PaymentProvider` boundary (`lib/payment-provider.ts` → `lib/mercadopago-payment-provider.ts`,
selected in `services/payment-provider.service.ts`). Two SDK defaults are overridden on purpose:

- timeout 60 s and 3 automatic retries → **10 s, no automatic retries**: a checkout must not hang
  for minutes, and retrying is our decision, always with the same idempotency key;
- `Order.create/get` merge per-call options into the shared config object → **a fresh client per
  call**, so one call's idempotency key can never leak into another.

Errors are normalized to `PaymentProviderError` kinds (`NOT_CONFIGURED`, `AUTHENTICATION_ERROR`,
`INVALID_INPUT`, `IDEMPOTENCY_CONFLICT`, `NOT_FOUND`, `UNAVAILABLE`, `TIMEOUT`,
`INVALID_RESPONSE`); provider messages are never logged or returned. A response is only trusted
with an id, an `https` Mercado Pago `checkout_url`, and — when present — the same amount,
currency and external reference we sent.

### Payment attempts and idempotency

A `Payment` row is one attempt. `initiateOrderPayment()` locks the order row, then:

1. an open attempt with a checkout URL is reused (a quick `getOrder` first: closed without payment
   → close it and open a new attempt; paid or in progress → `409 PAYMENT_ALREADY_SUBMITTED`, never
   a second checkout);
2. an open attempt without a remote order (previous outcome unknown) is sent again **with the
   same `idempotencyKey`** and a byte-identical body (the checkout lifetime is fixed from the
   attempt's creation);
3. otherwise a new attempt is created with a new UUID key, **persisted before** the provider call.

`X-Idempotency-Key` is always exactly `Payment.idempotencyKey`. Timeouts, unavailability, invalid
responses and idempotency conflicts keep the attempt open (retry = same key = same remote order).
Only a request the provider rejects (`INVALID_INPUT`) closes the attempt; the next click is a new
attempt with a new key.

### What is sent

Amount = `Order.grandTotal` (frozen at checkout), items from `OrderItem` snapshots (a CUSTOM
graduation is the commercial note "Graduación personalizada — A coordinar con la óptica", never
prescription data), `external_reference = Order.id`, payer = email + first/last name from the
order. Never the billing tax id as payer identification, never phone/address/optical profile. The
request body from the client is empty (`.strict()`); any field is a 400. The remote checkout
expires with our stock reservation (`expiration_time`).

### Redirect ≠ confirmation

Return URLs are `/order/:orderNumber/payment/{success|pending|failure}`. Those pages ignore the
path result and every query parameter Mercado Pago appends; they only show our order's state from
our API. Nothing in D1 marks an order paid — D2's webhook will verify the payment server-side and
call `markOrderPaid()`.

### Configuration

`MERCADOPAGO_ACCESS_TOKEN` and `PUBLIC_WEB_URL` are optional. Without them the app runs and payment
initiation answers `503 PAYMENT_PROVIDER_NOT_CONFIGURED`. TEST credentials outside production.

## Consequences

- One extra provider read when a buyer clicks "Pagar" again on an attempt that already has a
  checkout (not polling; it prevents paying twice and replaces dead checkouts).
- Remote order status names used to decide reuse (`failed`, `canceled`, `expired` /
  `processing`, `processed`, `refunded`, `charged_back`) must be confirmed against real TEST
  traffic in D2; unknown statuses reuse the stored checkout.
- Until D2 ships, an order paid at Mercado Pago stays `PENDING_PAYMENT` locally (and the attempt
  `PENDING`); the reservation may expire and D2's late-approval path (ADR-0025) takes over.
