# ADR-0036: ARCA electronic invoicing boundary (WSAA + WSFEv1, CAE)

**Status:** Proposed — local implementation only. No real fiscal data, no homologation run yet.

## Context

Roberto wants to issue electronic invoices from the admin panel, get the CAE and download a PDF.
The store has no orders, sales or invoicing module (Orders/Payments are not started), so nothing
can be reused beyond the admin shell, auth and the provider-boundary pattern of ADR-0024.

The issuer's fiscal condition (Responsable Inscripto, Monotributo, Exento…) is **not confirmed**,
so the voucher class (A, B, C) and the VAT treatment cannot be decided in code. No certificate,
CUIT or point of sale has been provided, and none may be stored yet.

Official sources (downloaded 2026-10-25):

- WSFEv1 developer manual, RG 4291 – Proyecto FE v4.8 (revision dated 2026-12-01).
- WSAA technical specification 1.2.2 and WSAA developer manual.
- QR specification for electronic vouchers (RG 4892/2020), JSON version 1.

## Decisions

### Scope

CAE modality only (`FECAESolicitar`, one voucher per request), concept 1 (Productos), currency
`PES`. CAEA, credit/debit notes, foreign currency, services and Factura de Crédito MiPyME are out
of scope until confirmed. Nothing here touches the catalog: no stock reservation or deduction, no
change to products, prices or users. A sale item may reference a variant only as a snapshot.

### No fiscal rule is invented

- The issuer has a `taxCondition` that starts as `UNCONFIRMED`. Issuing is refused until an admin
  records the confirmed condition **and** the enabled voucher types (codes from
  `FEParamGetTiposCbte`) for each point of sale, after the accountant confirms them.
- Encoded only where the official manual states it:
  - Receptor IVA condition × voucher class compatibility (manual v4.8, annex «Condición frente al
    IVA del receptor»).
  - Class C amounts: `ImpIVA = 0`, `ImpTotConc = 0`, `ImpOpEx = 0`, no `Iva` array; `ImpTotal =
ImpTotConc + ImpOpEx + ImpNeto + ImpIVA + ImpTrib`.
  - `MonCotiz = 1` for `PES`.
- Each item carries an explicit VAT code (from `FEParamGetTiposIva`) for classes A/B; there is no
  default rate. The minimum amount above which a final consumer must be identified is a
  configured value with no default: until set, a receptor without a document is refused.
- The PDF lists the data ARCA returns plus the issuer data entered by the admin; its legal layout
  (RG 1415) is pending the accountant's review.

### Provider boundary

`InvoicingProvider` (like `ShippingProvider`): `lastAuthorized`, `authorize`, `consult`,
`getParameters`. Implementations:

- `mock` — deterministic, in memory, for tests and local use. Every PDF it produces is marked
  «SIMULADO — SIN VALIDEZ FISCAL».
- `homologacion` — WSAA (`wsaahomo.afip.gov.ar`) + WSFEv1 (`wswhomo.afip.gov.ar`) over SOAP,
  CMS signed with the certificate. PDF marked «HOMOLOGACIÓN — SIN VALIDEZ FISCAL».
- Production is **not wired**: `ARCA_MODE` accepts only `off | mock | homologacion`. Enabling
  production is a separate, explicitly authorized change.

### Credentials

Certificate and private key are read from file paths outside the repo (`ARCA_CERT_PATH`,
`ARCA_KEY_PATH`), never from the database, never logged, never returned by the API. The access
ticket (TA, 12 h) is cached in memory and reused while valid, as the WSAA manual requires
(re-requesting returns `coe.alreadyAuthenticated`).

### Numbering, concurrency and uncertain answers

The number is never chosen locally: it is `FECompUltimoAutorizado + 1`, read right before sending.

1. At most **one in-flight voucher per (issuer, point of sale, type)**, enforced by a partial
   unique index over `status IN ('SENDING','UNCERTAIN')`. A second emission gets 409.
2. The number is written to the row **before** calling `FECAESolicitar`, so a crash leaves enough
   to look it up.
3. Outcomes: `A` → `AUTHORIZED` (CAE, due date). `R` → `REJECTED` (errors/observations stored,
   number released). Timeout, network error, 5xx or an unparseable answer → `UNCERTAIN`.
4. An `UNCERTAIN` voucher is resolved only with `FECompConsultar` for that number:
   - found, with the same document, date and total → `AUTHORIZED` with that CAE;
   - error 602 (no data) and `FECompUltimoAutorizado` below the number → safe to send again;
   - found with different data → `NEEDS_REVIEW` (manual).
5. `authorize` is never retried blindly; only reads (`lastAuthorized`, `consult`, parameters,
   WSAA login) are retried with backoff.
6. Creating a voucher takes an `Idempotency-Key` (unique): repeating the request returns the same
   voucher.

### Audit

`fiscal_audit_events` records every transition (who, when, from → to, ARCA codes/messages,
attempt) without tokens, signatures or certificates. Vouchers are never deleted.

## Consequences

- Invoicing can be built and tested end-to-end locally with the mock and fictitious data.
- Going to homologation needs: CUIT, a WSASS test certificate associated with `wsfe`, and a
  point of sale enabled for web services. Production needs a separate ADR update and authorization.
- When Orders exist, an order can create a `Sale`; the invoicing module does not depend on Orders.
