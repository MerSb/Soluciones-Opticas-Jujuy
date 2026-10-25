# ADR-0036: ARCA electronic invoicing of online purchases (WSAA + WSFEv1, CAE)

**Status:** Proposed — local implementation with simulated ARCA and email. No real fiscal data, no
homologation run, not integrated with the checkout.

## Context

Roberto is Responsable Inscripto and invoices in-store sales from ARCA's portal; that procedure does
not change. The module covers **only purchases made on the website**: when an online order's payment
is confirmed, issue the electronic voucher and email the PDF to the buyer.

Audit (2026-10-25):

- Production (`e051a7e`) has **no checkout**: no cart, orders, payments or emails. Purchases are
  WhatsApp enquiries ("Consultar por WhatsApp").
- An unpublished local branch, `feature/payments-v1` (ADR-0025/0026/0027), has a guest checkout,
  `Order`/`OrderItem`/`Payment`/`PaymentEvent`, Mercado Pago Checkout Pro (Orders API) and a signed
  webhook reconciled server-side (`getOrder`), ending in `markOrderPaid()` → `PAID` |
  `PAID_NEEDS_REVIEW`. It collects the buyer's email and, optionally, a billing name and
  DNI/CUIT/CUIL — but **not** the buyer's IVA condition. It was never run against Mercado Pago TEST,
  sends no email, is 14 commits behind production and is not authorized for release.

Official sources (downloaded 2026-10-25): WSFEv1 manual RG 4291 – Proyecto FE v4.8 (revision dated
2026-12-01), WSAA technical specification 1.2.2 and developer manual, QR specification (RG 4892/2020).

## Decisions

### Scope

- A voucher exists only for an online order handed over by the checkout **after** its payment was
  reconciled with the provider: order `PAID`, payment `APPROVED`, paid amount = order total, ARS.
  `PAID_NEEDS_REVIEW`, pending or abandoned orders and WhatsApp enquiries are never invoiced. There is
  no endpoint or screen that creates a voucher by hand.
- CAE modality, concept 1 (products), `PES`, one voucher per request. Credit notes, CAEA, foreign
  currency and shipping charges are out of scope until defined.
- Nothing touches stock, prices, products or users. The paid order is stored as it was
  (`orderSnapshot`) and the voucher total is exactly what was paid.

### Components

| Component                              | Where                                                       | Notes                                                             |
| -------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| Online purchase + payment confirmation | `feature/payments-v1` (not here)                            | Calls `processPaidOrder()` after `markOrderPaid()` returns `PAID` |
| Contract checkout → invoicing          | `lib/online-order-invoice.ts`                               | `PaidOnlineOrder`, `refuseUnverifiedOrder`, `planVoucher`         |
| Invoicing service                      | `services/invoicing.service.ts`                             | Requests, vouchers, numbering, verification, recovery             |
| ARCA integration                       | `lib/arca/*`, `services/invoicing-provider.service.ts`      | WSAA + WSFEv1 (homologation) or mock                              |
| PDF + QR                               | `services/invoice-pdf.service.ts`, `lib/arca/qr.ts`         |                                                                   |
| Email                                  | `lib/invoice-email.ts`, `services/invoice-email.service.ts` | Own state; mock only                                              |
| Orchestration and recovery             | `services/online-invoicing.service.ts`                      | `processPaidOrder`, `runOnlineInvoicing`                          |
| Buyer download                         | `routes/invoices.routes.ts`, web `/factura/:id`             | HMAC token in the URL fragment                                    |

### No fiscal rule is invented

Blocked (the order waits in `WAITING_DATA` with the reason) until an admin records what the
accountant confirmed: the issuer's IVA condition, the online point of sale and its enabled voucher
types, the VAT rate of frames, lenses and accessories, and the amount from which a final consumer
must be identified. Encoded only where official:

- Receptor IVA condition × voucher class (annex of manual v4.8). The voucher type is the **only**
  enabled type of the online point of sale allowed for that receptor; zero or two → waits.
- A 7–8 digit document is a DNI (final consumer); an 11 digit CUIT/CUIL waits for the buyer's IVA
  condition (the checkout does not ask it), completed by an admin.
- Amounts: `ImpTotal = ImpTotConc + ImpOpEx + ImpNeto + ImpIVA + ImpTrib`; class C without VAT;
  for A/B, prices as paid are split per rate into base = paid / (1 + rate) and VAT = paid − base.
- `CondicionIVAReceptorId` always sent (mandatory from RG 5616 per v4.8). `MonCotiz = 1`.

### Numbering, concurrency, idempotency, uncertain answers

- One request per order (`orderId` unique) and one voucher per request (`idempotencyKey =
order:<orderId>`): redeliveries and concurrent confirmations never duplicate.
- Number = `FECompUltimoAutorizado + 1`, saved before `FECAESolicitar`. One voucher in flight per
  (point of sale, type) through `FiscalSequence.inFlightDocumentId` (conditional UPDATE).
- `A` → `AUTHORIZED` (+ email queued). `R` → `REJECTED` (number released; left to a person). Timeout,
  dropped connection, 5xx, internal ARCA error (500–502) or unreadable answer → `UNCERTAIN`, sequence
  kept locked, settled only with `FECompConsultar`: found and equal → `AUTHORIZED`; 602 and last <
  number → `DRAFT` and sent again; anything else → `NEEDS_REVIEW`.
- `FECAESolicitar` is never retried blindly; reads and WSAA login are retried with backoff.
- `runOnlineInvoicing()` moves everything one safe step (prepare, verify, emit, email) and can run
  as often as needed (admin button now; a scheduler later).

### Email and buyer access

- `InvoiceEmailDelivery` keeps the email state apart from the voucher: `PENDING → SENDING → SENT |
FAILED`, backoff 5 min → 6 h, 8 attempts, then a person resends. Resending never touches ARCA.
- No provider is chosen: only `mock` (`INVOICE_EMAIL_MODE=off|mock`).
- The email carries the PDF and a link `PUBLIC_WEB_URL/factura/<id>#<token>`; token = HMAC-SHA256
  of the voucher id with a key derived from `JWT_SECRET`. The fragment never reaches a server; the
  page sends it in `X-Invoice-Access-Token`. Wrong token / not authorized → the same 404.

### Credentials and environments

`ARCA_MODE=off|mock|homologacion` (default `off`); production is not an accepted value and its URLs
are not in the code. Certificate and key are files outside the repo (`ARCA_CERT_PATH`,
`ARCA_KEY_PATH`), never in the DB, logs or responses; `*.key/*.pem/*.crt` are git-ignored. The TA
(12 h) is cached in memory and reused (`coe.alreadyAuthenticated`). Mock and homologation PDFs say
«SIN VALIDEZ FISCAL».

## Consequences

- Integration needs the checkout branch merged and an adapter that reads `Order` + `OrderItem` +
  `Payment` (+ `Product.kind`) and calls `processPaidOrder()`; the checkout should then ask the
  buyer's IVA condition when they enter a CUIT.
- Homologation needs a WSASS certificate associated with `wsfe` and a test point of sale; production
  needs a separate ADR update, a production certificate and explicit authorization.
- With more than one API instance, the in-memory TA must be shared.
