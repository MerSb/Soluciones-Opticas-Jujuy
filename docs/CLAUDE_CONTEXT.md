# Contexto compacto — Soluciones Ópticas Jujuy

Punto de entrada para nuevas sesiones. Corto a propósito: para el detalle de cada tema, abrí solo el
documento enlazado. Última actualización: Payments V1 — Fase D2 (2026-09-26).

## Stack

- **Web** (`apps/web`): React + TypeScript + Vite + Tailwind + TanStack Query. SPA estática.
- **API** (`apps/api`): Node + Express + TypeScript. Zod para validación.
- **DB**: PostgreSQL + Prisma (`prisma/schema.prisma`, migrations en `prisma/migrations`).
- **Shared** (`packages/shared`): contratos **solo de tipos** (ADR-0015) — sin valores runtime;
  cada app declara sus propios arrays runtime (`satisfies` contra el tipo compartido).
- **Infra**: Vercel (web), Railway (API + PostgreSQL de staging), Cloudinary (imágenes).
- Monorepo npm workspaces. Node ≥ 20.

## Arquitectura

- **API**: `routes → controllers → services → Prisma`. Sin capa repository.
  - Validación en `routes` con `validateBody/Query/Params` (Zod) → datos en `res.locals`.
  - Errores: `ApiError` (`lib/api-error.ts`) → `{ error: { code, message, details? } }`.
  - Mensajes de validación en español no técnico: `lib/validation-messages.ts` (agregar la
    etiqueta de cada campo nuevo a `FIELD_LABELS`).
  - Todo `POST` exige `Content-Type: application/json` (defensa CSRF, `middleware/require-json.ts`).
  - DTOs: `Decimal` → `number` con `.toNumber()` recién al serializar.
- **Web**: `services/api-client.ts` (`apiGet/Post/Patch/Put/Delete`), hooks en
  `services/queries/*`, rutas lazy en `app/routes.tsx`, admin bajo `/admin/*`.
- **Admin API**: `/api/admin/*`, `authenticate` + `authorize("ADMIN")` una sola vez en
  `routes/admin/index.ts`. Endpoints por recurso (no PATCH con arrays anidados), soft delete +
  `/restore`.
- ADRs en `docs/adr/` (0001–0027). Leer el ADR del tema antes de cambiar una decisión.

## Ramas

- `main`: producción futura — **no tocar**.
- `dev`: **no tocar** salvo indicación explícita.
- `feature/cloudinary-staging-readiness`: rama de integración/staging actual.
- Features: rama nueva desde la de integración (p. ej. `feature/lens-configurator-v1`); nunca
  trabajar directo sobre la de integración. Push/merge/deploy solo con aprobación explícita.
- ⚠️ `docs/DEPLOYMENT.md` describe staging desplegado desde `dev`; en la práctica la integración
  vive en `feature/cloudinary-staging-readiness`. Pendiente alinear el documento.

## Reglas de dominio confirmadas

**Catálogo**

- Categorías oficiales: Promociones, Anteojos de Sol, Anteojos Recetados, Deportivos.
- `Product` = modelo de armazón (precio base, forma, medidas, estilos). `ProductVariant` =
  presentación física (color, material, SKU único, stock propio, imágenes, `priceOverride?`).
- **Stock por `ProductVariant`**. `stock = 0` es válido. CHECK `stock >= 0` (SQL manual).
- **Producto público completo** = `deletedAt == null` ∧ ≥ 1 variante ∧ ≥ 1 imagen en alguna
  variante (`lib/product-completeness.ts`). El stock **no** participa: completo + stock 0 → sigue
  público con `inStock = false`. No cambiar esta regla.
- Slugs inmutables (ADR-0013). Soft delete (`deletedAt`) en Brand/Category/Product y en el
  catálogo de cristales. `ProductVariant` es hard delete (ADR-0021).
- Promociones = productos en la categoría "Promociones". Sin ofertas ni descuentos inventados.

**Cloudinary** (ADR-0010, ADR-0022, `docs/IMAGE_PIPELINE.md`)

- Imágenes pertenecen a `ProductVariant`. Se guarda `public_id`, nunca la URL.
- Upload directo firmado, imagen primaria, borrado remoto, limpieza al borrar variante. **No
  reimplementar. No exponer secrets.**

**Auth** (ADR-0005/0006/0018)

- JWT de acceso + refresh opaco rotativo (hash SHA-256 en DB), ambos en cookies HttpOnly.
- `authenticate` / `authorize` separados. Roles `CUSTOMER` / `ADMIN`. El registro público nunca
  crea ADMIN (promoción: `npm run admin:promote`, solo local).
- No modificar CORS, cookies ni JWT sin un milestone dedicado.

**Perfil óptico y recomendaciones** (ADR-0008/0019/0020, `docs/CUSTOMER_EXPERIENCE_V2.md`)

- `CustomerOpticalProfile`: medidas del armazón actual (`current_frame_*`) + preferencias. **Sin
  datos clínicos ni receta**, sin datos faciales.
- Motor de recomendaciones con reglas como código (V1/V2): puntúa solo productos completos.
  Related products: score ponderado determinístico.

**Cristales & Configurador V1** (ADR-0023, [`LENS_CONFIGURATOR.md`](LENS_CONFIGURATOR.md))

- `LensType` (línea) → `LensOption` (variedades 0..N) + `LensTreatment` (informativos) +
  `ProductLensType` (compatibilidad explícita por producto, decidida por el admin).
- Precio cristal = `option.priceOverride ?? type.basePrice`; configuración = armazón + cristal
  (Decimal). La graduación personalizada (`CUSTOM`) **no suma precio** en V1 y no guarda datos
  clínicos: "a coordinar con la óptica".
- "Sin cristales" siempre válido (obliga `NONE`). Stock de variedad opcional (`null` = no se
  controla), independiente del stock del armazón.
- Fuente única de validación/precio: `resolveEyewearConfiguration()` (`GET
/api/products/:slug/quote`). El frontend nunca envía precios.
- Sin datos de cristales inventados: los carga el admin con datos reales del cliente.
- **El antirreflejo se comercializa como característica estándar/incluida, no como adicional
  seleccionable** (confirmado por el cliente). Se modela como `LensTreatment` incluido en cada
  `LensType` que corresponda; sin precio, sin selección. Lo carga el admin (no hay seed).

**Envíos — Shipping V1** (ADR-0024, [`SHIPPING.md`](SHIPPING.md))

- Métodos: `PICKUP` (Alvear 732, San Salvador de Jujuy — la `Branch` real) y `DELIVERY` solo en
  Argentina (24 códigos ISO 3166-2:AR). Sin internacional.
- Política `FREE_NATIONAL_V1`: **el cliente paga $0 de envío en todo el país; eso NO significa que
  el envío no le cueste a la óptica.** Tres montos separados (Decimal): costo del proveedor, precio
  al cliente (0) y costo absorbido. Costo desconocido = `null`, nunca inventado ni mostrado como $0.
- El envío nunca modifica precios de producto ni de cristal.
- Un solo acceso al transportista: `shipping-provider.service.ts`. Fase A: **sin proveedor**
  (resultado `NOT_CONFIGURED`), sin credenciales ni variables de entorno.
- Log `shipping_quotes`: `QUOTED` / `FAILED` / `NOT_COVERED` / `NOT_CONFIGURED`. `PENDING` queda
  reservado para el futuro `Order.shippingCostStatus`.
- Origen = `Branch.postalCode` (nullable; el CP real todavía no confirmado). Paquete = perfil
  predeterminado (`/admin/shipping`, un solo default). Sin endpoint público hasta checkout.

**Órdenes — Payments V1 Fases A+B+C** (ADR-0025, [`PAYMENTS.md`](PAYMENTS.md))

- Sin carrito en DB: la `Order` nace al confirmar checkout; cada línea se revalida con
  `resolveEyewearConfigurationDetails()`. El cliente nunca envía precios, nombres ni stock.
- `OrderItem` guarda snapshots (nombres, SKU, precios Decimal, cristal, tratamientos); FKs de
  catálogo nullable + `SetNull` (resuelve la deuda del hard delete de `ProductVariant`).
- Reserva = descuento atómico (`stock >= qty`) al crear `PENDING_PAYMENT`; rollback total con
  `409 OUT_OF_STOCK`. Locks en orden: orden → variantes → variedades (por id).
- `PAYMENT_STOCK_RESERVATION_MINUTES = 30` (`lib/order-policy.ts`). Expiración idempotente; pago
  tardío → `PAID` o `PAID_NEEDS_REVIEW` (sin refund automático).
- Token de invitado: solo hash SHA-256; futuro header `X-Order-Access-Token`, nunca query string.
- `orderNumber` desde la secuencia `order_number_seq` (SQL manual).
- HTTP (Fase B): `POST /api/checkout/orders` (invitado o cuenta; cookie inválida → 401),
  `GET /api/orders/:orderNumber` (header de token; todo fallo = mismo 404),
  `GET /api/account/orders[/:n]`. Teléfono obligatorio. Envío vía `quoteShipping()` fuera de la
  transacción; re-resolución + `FOR SHARE` dentro. `paymentStatus` DTO = último `Payment` o
  `NOT_STARTED` (sin filas ficticias). Expiración oportunista en checkout/lectura; falta scheduler
  antes de producción.
- Frontend (Fase C): carrito solo en `localStorage` (`lib/cart/*`, `useSyncExternalStore`, sin
  provider); `/cart`, `/checkout`, `/order/:orderNumber`, `/account/orders[/:n]`. Precio del carrito
  informativo; vaciar solo tras 201. Token de invitado en `sessionStorage`, solo por header.
  `GET /api/branches` expone `id`.
- **Mercado Pago (D1, ADR-0026)**: Checkout Pro vía **Orders API** (`POST /v1/orders`), no
  Preferences. SDK oficial `mercadopago` fijado, detrás de `PaymentProvider`; timeout 10 s, sin
  reintentos del SDK, cliente nuevo por llamada. `POST /api/orders/:n/payment` (token de invitado o
  dueño, body vacío) → `{ checkoutUrl }`. `idempotencyKey` guardada antes de llamar y reutilizada en
  reintentos. El redirect NO confirma el pago. Sin credenciales → 503.
- **Webhook (D2, ADR-0027)**: `POST /api/payments/mercadopago/webhook`, evento "Order", firma con el
  validador oficial del SDK (`MERCADOPAGO_WEBHOOK_SECRET`), `PaymentEvent` idempotente con lease,
  `getOrder()` server-side, verificación de referencia/moneda/monto (Decimal), un único mapper de
  estados (`lib/mercadopago-status.ts`), aprobación vía `markOrderPaid()`.

## Estado de milestones

| Milestone                                                                 | Estado                                                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Etapa 1 — sitio + catálogo                                                | Hecho                                                                                            |
| Etapa 2 — auth, favoritos, perfil óptico                                  | Hecho                                                                                            |
| Recomendaciones V1/V2, Customer Experience V2                             | Hecho                                                                                            |
| Admin catálogo + Admin Dashboard V2                                       | Hecho                                                                                            |
| Cloudinary staging readiness                                              | Hecho, en staging                                                                                |
| Real Catalog Readiness                                                    | Hecho, integrado (merge `2491f8a`), probado en staging                                           |
| Cristales & Configurador V1                                               | Integrado en staging (merge `6a92a66`); pendiente deploy y QA manual                             |
| Shipping V1 — Fase A (sin proveedor)                                      | Implementado en `feature/shipping-v1`; pendiente QA manual; sin push                             |
| Shipping V1 — Fase B (proveedor real)                                     | Bloqueado: el cliente debe elegir operador y conseguir credenciales                              |
| Payments V1 — Fases A–D2 (órdenes, checkout, frontend, pago y webhook MP) | Implementado en `feature/payments-v1`; smoke TEST real pendiente de credenciales/HTTPS; sin push |
| Payments V1 — pre-producción (scheduler, admin de revisión, smoke real)   | No iniciado                                                                                      |
| Facturación (CUIT / ARCA)                                                 | No iniciado — milestone separado                                                                 |

## Infraestructura

- Staging: Vercel (web) + Railway (API + Postgres). Ver `docs/DEPLOYMENT.md`, `docs/ENVIRONMENT.md`.
- Local: Postgres en Docker (`localhost:5437`, `soluciones_opticas_dev`), `.env` en la raíz.
- Retiro en local: Alvear 732, San Salvador de Jujuy, Jujuy, Argentina.

## Migrations (ADR-0014, `docs/DATABASE_DESIGN.md` §Migration policy)

1. `npm run db:migrate:new -- --name <nombre>` (create-only). **Nunca** `prisma migrate dev` a secas.
2. Revisar el SQL a mano: **eliminar** siempre el `DROP INDEX "products_name_trgm_idx"` que Prisma
   propone (índice pg_trgm no gestionado por el schema). Agregar a mano los `CHECK` necesarios.
3. Aplicar local: `npm run db:migrate:deploy`. Staging: `db:migrate:deploy` **antes** de desplegar
   la API. Nunca resetear bases compartidas, nunca borrar/reescribir migrations.

- Seeds: `db:seed` (local), `db:seed:staging` (idempotente, upserts). No ejecutar sin pedido.

## Quality gates

```bash
npm run format        # prettier --check (format:write para corregir)
npm run lint
npm run typecheck:api
npm run typecheck:web
npm run test:api      # Vitest + supertest contra la DB local real (sin mocks de Prisma)
npm run test:web      # Vitest + Testing Library, fetch stubbeado por ruta
npm run build:api
npm run build:web
npm run db:validate
```

Tests API: fixtures creados con Prisma bajo un prefijo `RUN_ID` y limpiados en `afterAll`. Todo
`POST` de test necesita `.send({})` (require-json).

## Decisiones pendientes del cliente

- **Cristales**: nombres/colores/precios reales (incluida la línea espectro, ~10 variedades),
  qué líneas son compatibles con qué productos, stock o a pedido, si la graduación personalizada
  tendrá costo.
- **Envíos** (política de envío gratis ya confirmada): operador logístico + credenciales, CP/CPA
  de Alvear 732, peso/medidas/embalaje del paquete, valor declarado, aceptar pedidos con costo
  pendiente, domicilio vs. sucursal del correo. Detalle en `docs/SHIPPING.md`.
- **Pagos**: Mercado Pago, pago completo online, tarjetas, checkout invitado (cuenta no
  obligatoria), retiro en local y envío a domicilio.
- **Facturación**: CUIT cuando corresponda; ARCA fuera de alcance hasta su milestone.

## Deuda técnica relevante

- Órdenes: el barrido de expiración es solo oportunista (sin scheduler persistente — requerido antes
  de producción); sin vista de admin para `PAID_NEEDS_REVIEW` / eventos `FAILED_FINAL`; eventos
  `FAILED_RETRYABLE` dependen de los reintentos de Mercado Pago o de `reprocessPaymentEvent()`
  manual; rate limits en memoria.
- Índice pg_trgm fuera del schema: toda migration requiere revisión manual (ver arriba).
- Filtros públicos de color/forma/material sin normalización (`docs/REAL_CATALOG_READINESS.md`).
- Limpieza de fixtures admin por nombre mutable; flake conocido de concurrencia entre archivos de
  test de API (`related-products`/`recommendations` vs `admin/products`).
- `package.json#prisma` deprecado para Prisma 7 (migrar a `prisma.config.ts` en algún momento).
- `LensOption` sin imagen propia (solo `swatchHex`); listado público no indica si un producto
  admite cristales.
- `docs/DEPLOYMENT.md` desalineado con el flujo real de ramas (ver Ramas).
- Shipping: origen = la `Branch` más antigua, desempate por menor id (sin flag explícito: con varias sucursales reales hará falta decidir cuál es el origen logístico) y sin UI para cargar su CP; el
  rate limit del simulador vive en memoria por proceso (como el de auth).
