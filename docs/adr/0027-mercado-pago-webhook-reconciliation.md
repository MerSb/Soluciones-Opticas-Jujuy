# ADR-0027: Signed Mercado Pago webhooks and payment reconciliation (Payments V1 — Phase D2)

**Status:** Approved — implemented and tested with a fake provider; real TEST traffic pending
credentials and a public HTTPS URL.

## Context

D1 (ADR-0026) starts payments with Checkout Pro via the Orders API but never confirms them. A
redirect back from Mercado Pago proves nothing. D2 turns Mercado Pago's notifications into safe,
idempotent changes to our `Payment` and `Order`.

Official documentation consulted on 2026-09-26 (mercadopago.com.ar/developers):

- Checkout Pro via Orders API — Configure notifications —
  `/developers/en/docs/checkout-pro-orders/notifications` (event "Order (Mercado Pago)", `type=order`,
  `data.id` = order id, `x-signature`, `x-request-id`, validation with the SDK's
  `WebhookSignatureValidator`, respond 200/201 within 22 s, retries at 15 min, 30 min, 6 h, then up
  to 96 h)
- Orders — Order status — `/developers/en/docs/checkout-api-orders/payment-management/status/order-status`
- Orders — Transaction status —
  `/developers/en/docs/checkout-api-orders/payment-management/status/transaction-status`
- API reference — Get order — `/developers/en/reference/online-payments/checkout-api/get-order/get`
- Official Node SDK `mercadopago` 3.6.1 (`dist/utils/webhook`)

## Decisions

### Contract and signature

`POST /api/payments/mercadopago/webhook?data.id=<order id>&type=order`, JSON body
`{ id, type: "order", action, data: { id }, … }`. Authenticity is checked first, with the official
`WebhookSignatureValidator` of the pinned SDK: HMAC-SHA256 with the webhook secret over
`id:<data.id>;request-id:<x-request-id>;ts:<ts>;` (absent pairs omitted), constant-time compare.
`data.id` is the query value **exactly as sent** — no lowercasing: the current documentation delegates
to the SDK validator, which does not normalize; older generic webhook pages said alphanumeric ids
were lowercased (discrepancy noted; current docs rule, to be confirmed by real TEST traffic). The
SDK's `toleranceSeconds` is not used: it treats `ts` as seconds while the documented example is in
milliseconds; replays are harmless anyway (event dedupe + state re-read). The signature does not
cover the body, so no raw-body parsing is needed: the normal JSON parser (16 kb) is kept.

Only `type = order` is processed. Other signed topics are acknowledged (200) without touching
anything. Nothing touches the database or the provider before the signature is valid.

### Event ledger and idempotency

`providerEventId` = body `id` (the notification id; redeliveries repeat it), unique per provider.
`PaymentEvent` gained (additive migration) `providerOrderId` (the signed `data.id` — never stored in
`providerPaymentId`), `action`, `requestId`, and a minimal lifecycle: `RECEIVED → PROCESSING →
PROCESSED | FAILED_FINAL`, or `FAILED_RETRYABLE`. A conditional claim (`RECEIVED |
FAILED_RETRYABLE`, or a `PROCESSING` lease older than 2 min) guarantees exactly one worker processes
an event; only the lease holder may close it. `reprocessPaymentEvent(id)` is the same routine,
exported for manual retries and a future scheduler (no public route calls it).

### Reconciliation

The body's status is never used. After claiming, `getOrder(data.id)` is called **outside** any
transaction. The local attempt is found by `(provider, providerOrderId)`; if D1's create timed out
and the id was never stored, the remote `external_reference` (our `Order.id`, read server-side)
identifies the order and its single open unbound attempt is bound. Then:

- `external_reference` must equal `Order.id` → otherwise `REFERENCE_MISMATCH`;
- one pure mapper (`lib/mercadopago-status.ts`) interprets remote states; only `processed` +
  `accredited` approves;
- before approving: `currency` (when present) = the order's (ARS), and the paid amount
  (`total_paid_amount`, or the sum of accredited transactions) **and** `total_amount` equal
  `Order.grandTotal`, compared as Decimal → otherwise `CURRENCY_MISMATCH` / `AMOUNT_MISMATCH`, nothing
  approved, the attempt flagged (`failureCode`);
- approval: `Payment` → `APPROVED` once (`status <> APPROVED` condition; `approvedAt` set once), with
  the accredited transaction's id as `providerPaymentId`, `method` = `type/id` (never card data);
  then `markOrderPaid()` (ADR-0025) owns the order transition and any stock recovery: pending →
  `PAID` (no stock change), expired → `PAID` if stock can be re-taken else `PAID_NEEDS_REVIEW`,
  cancelled → `PAID_NEEDS_REVIEW`, paid → unchanged. A second approved attempt for the same order is
  flagged `APPROVED_DUPLICATE_PAYMENT` — never refunded automatically;
- `failed` → `REJECTED`, `canceled`/`expired` → `CANCELLED` (only from `PENDING`; an approved
  attempt is never downgraded by an older notification); the order stays payable;
- `created`, `action_required/*`, `processing/*` → pending, nothing changes;
- `refunded`, `charged_back/*`, `processed/partially_refunded` → `REVIEW_REVERSED`, nothing
  automatic; unknown states → nothing, never approved.

### Responses (acknowledgement strategy)

| Case                                                                    | HTTP | Event              |
| ----------------------------------------------------------------------- | ---- | ------------------ |
| No webhook secret configured                                            | 503  | not stored         |
| Missing/invalid signature                                               | 401  | not stored         |
| Signed but malformed (no event id, no/invalid `data.id`, body ≠ query)  | 400  | not stored         |
| Signed, other topic                                                     | 200  | not stored         |
| Processed (any applied or informational outcome)                        | 200  | `PROCESSED`        |
| Final failure (mismatch, unmatched order)                               | 200  | `FAILED_FINAL`     |
| Duplicate / being processed by a concurrent delivery                    | 200  | unchanged          |
| Provider unreachable, timeout, remote order not found yet, bad response | 503  | `FAILED_RETRYABLE` |
| Database error                                                          | 500  | `FAILED_RETRYABLE` |

Only failures that another delivery can fix return non-2xx, so Mercado Pago's retry schedule
recovers them without retry storms for permanent problems. The body is `{ "received": true|false }`
or the standard error envelope — never an order, payment, provider payload or internal error.

## Consequences

- The buyer's return page shows "Pago confirmado" only after a verified notification was applied;
  until then "Estamos verificando tu pago" (manual refresh, no polling, no browser-triggered provider
  reads).
- `FAILED_FINAL` events and `PAID_NEEDS_REVIEW` / `APPROVED_DUPLICATE_PAYMENT` / `REVIEW_REVERSED`
  outcomes need an admin view (not built).
- Real TEST notifications must confirm the `data.id` normalization and the state names; the webhook
  needs a public HTTPS URL and the secret configured in Mercado Pago ("Your integrations → Webhooks →
  Order (Mercado Pago)").
