# Payments V1

Estado: **Fases A, B, C y D1 implementadas** — dominio de órdenes, checkout, frontend e **inicio
del pago con Mercado Pago (Checkout Pro vía Orders API, modo TEST)**. La **confirmación del pago
(webhook) todavía no existe** (D2): ningún pedido pasa a pagado todavía. Decisión:
[ADR-0026](adr/0026-mercado-pago-checkout-pro-orders-api.md). Decisión de arquitectura: [ADR-0025](adr/0025-order-domain-and-stock-reservation.md).
Contrato HTTP: [`API.md` → Checkout & orders](API.md#checkout--orders--payments-v1-phase-b).

## Fase A — qué hay

| Pieza                       | Dónde                                                                    |
| --------------------------- | ------------------------------------------------------------------------ |
| Modelos + enums             | `prisma/schema.prisma` (`Order`, `OrderItem`, `Payment`, `PaymentEvent`) |
| Migración (SQL manual)      | `prisma/migrations/20260923231319_add_orders_payments`                   |
| Política (30 min, número)   | `apps/api/src/lib/order-policy.ts`                                       |
| Token de acceso de invitado | `apps/api/src/lib/order-access-token.ts`                                 |
| Servicio de dominio         | `apps/api/src/services/order.service.ts`                                 |
| Tests                       | `apps/api/test/services/order.service.test.ts`                           |

### Primitivas (`order.service.ts`)

- `createOrder(input)` — revalida cada línea con `resolveEyewearConfigurationDetails()`, congela
  snapshots, reserva stock de forma atómica y crea la orden `PENDING_PAYMENT`. Devuelve el token de
  acceso en claro **una sola vez**.
- `findOrderIdForAccessToken(orderNumber, token)` — acceso de invitado (comparación en tiempo
  constante).
- `expireOrderReservation(orderId)` / `releaseExpiredReservations()` — liberación idempotente de
  reservas vencidas. Sin cron todavía: se invoca manualmente o desde tests.
- `markOrderPaid(orderId)` — pago aprobado, incluido el caso tardío (`PAID` o `PAID_NEEDS_REVIEW`).

### Reglas

- **Sin carrito en DB**: la orden nace al confirmar el checkout.
- **Reserva = descuento inmediato** con `UPDATE … WHERE stock >= cantidad`; si falla cualquier línea
  → `409 OUT_OF_STOCK` y rollback total.
- **Stock de cristal**: `null` = no controlado (no se descuenta); controlado → mismo patrón atómico,
  una unidad de cristal por armazón.
- **Orden de locks**: orden → variantes (por id) → variedades de cristal (por id), para evitar
  deadlocks.
- **Reserva**: `PAYMENT_STOCK_RESERVATION_MINUTES = 30`, definido en un solo lugar.
- **Dinero**: `Decimal(12,2)` y `Prisma.Decimal` en el dominio; nunca floats.
- **Envío**: retiro = montos 0 conocidos (`KNOWN`); domicilio sin cotización = costo del proveedor
  `NULL`, precio al cliente 0, `PENDING` (ADR-0024).
- **Token de invitado**: solo el hash SHA-256 en DB; el endpoint futuro lo recibirá en el header
  `X-Order-Access-Token`, nunca en la query string (el logger registra la URL).
- **Sin datos clínicos** y **sin datos fiscales inventados** (ni condición frente al IVA, ni tipo de
  factura, ni CAE).

## Fase B — backend HTTP

| Ruta                                     | Acceso                                                         |
| ---------------------------------------- | -------------------------------------------------------------- |
| `POST /api/checkout/orders`              | Invitado o cuenta (`optionalAuthenticate`), 20 / 15 min por IP |
| `GET /api/orders/:orderNumber`           | Invitado con header `X-Order-Access-Token`, 60 / 15 min por IP |
| `GET /api/account/orders[/:orderNumber]` | Cuenta (`authenticate`), solo órdenes propias                  |

Código: `routes/checkout.routes.ts`, `routes/orders.routes.ts`, `routes/account.routes.ts`,
`controllers/checkout.controller.ts`, `controllers/orders.controller.ts`,
`schemas/checkout.schema.ts`, `middleware/order-rate-limit.ts`, `services/order-view.service.ts`.
Tests: `apps/api/test/checkout.test.ts`.

### Flujo de creación

1. Zod valida el body (los precios/totales/nombres enviados se descartan).
2. Barrido oportunista acotado de reservas vencidas (ver abajo).
3. Resolución preliminar de cada línea (sin transacción) → valor declarado del envío.
4. Cotización con `quoteShipping()` (`source = CHECKOUT`) — **sin transacción abierta**, porque el
   proveedor futuro hace I/O de red.
5. Transacción corta: `FOR SHARE` sobre productos y tipos de cristal (en orden de id), **re-resolución**
   de cada línea con el mismo resolver (si un producto/cristal dejó de ser vendible entre 3 y 5, no
   se crea la orden; los precios que se congelan son los de este instante), reserva atómica de stock,
   inserción de la orden.

`FOR SHARE` solo sobre filas que el checkout nunca actualiza (productos, tipos de cristal): un soft
delete concurrente espera al commit y dos checkouts no pueden trabarse mutuamente. Variantes y
variedades con stock se protegen con sus `UPDATE` condicionales.

### Sesión opcional

Sin cookie de acceso → invitado. Cookie válida → la orden queda en la cuenta y **no** se devuelve
token de invitado (el acceso es el historial de la cuenta). Cookie presente pero inválida/vencida →
`401` (el cliente refresca la sesión y reintenta); nunca se convierte en orden de invitado ni de otra
cuenta. Reutiliza la verificación de `authenticate` (sin lógica criptográfica duplicada).

### Envío

| Caso                                   | `providerShippingCost`                         | `customerShippingPrice` | `absorbedShippingCost` | `shippingCostStatus` |
| -------------------------------------- | ---------------------------------------------- | ----------------------- | ---------------------- | -------------------- |
| Retiro en local                        | 0                                              | 0                       | 0                      | `KNOWN`              |
| Domicilio, cotizado (`QUOTED`)         | costo real                                     | 0                       | costo real             | `KNOWN`              |
| Domicilio, `NOT_CONFIGURED` / `FAILED` | `NULL`                                         | 0                       | `NULL`                 | `PENDING`            |
| Domicilio, `NOT_COVERED`               | — orden rechazada (`422 SHIPPING_NOT_COVERED`) |                         |                        |                      |

Hoy no hay transportista configurado, así que todo envío a domicilio queda `PENDING`: el cliente
paga $0 y el costo real se desconoce (nunca se muestra como $0). `shippingQuoteLogId` guarda el
intento cuando hubo log. Las respuestas públicas **nunca** incluyen el costo del proveedor, el
absorbido ni el estado interno del costo.

### Estado de pago en los DTO

- `OrderStatus` (en la orden): `PENDING_PAYMENT`, `PAID`, `PAID_NEEDS_REVIEW`, `CANCELLED`, `EXPIRED`.
- `PaymentStatus` (por intento, fila `Payment`): `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`,
  `REFUNDED`.
- `paymentStatus` del DTO (`OrderPaymentStatus`): el estado del último `Payment`, o **`NOT_STARTED`**
  si la orden no tiene ninguno. `NOT_STARTED` es solo un valor de DTO: **no se crea una fila
  `Payment` ficticia**. El estado de la UI de checkout/pago (Fase C) se deriva de estos dos, no se
  persiste.

### Acceso de invitado

Token solo en el header `X-Order-Access-Token` (CORS lo permite en el preflight). Token ausente,
malformado o incorrecto y número inexistente → el mismo `404`: no se puede enumerar pedidos, y no es
`401` para que el cliente web no intente refrescar una sesión que no tiene nada que ver. Comparación
en tiempo constante, también contra un hash ficticio cuando la orden no existe. El token no se loguea
(el logger solo registra método + URL). Respuestas con `Cache-Control: no-store`.

### Expiración oportunista (sin scheduler)

- Cada checkout ejecuta antes de reservar `releaseExpiredReservations()` con un lote de
  `OPPORTUNISTIC_SWEEP_BATCH_SIZE = 25`; si falla, se loguea y el checkout sigue.
- Leer una orden (invitado o cuenta) expira esa orden si su reserva venció, así nunca se ve un
  `PENDING_PAYMENT` viejo.
- Todo pasa por la misma liberación idempotente de Fase A: varias instancias o requests simultáneos
  nunca devuelven stock dos veces. Sin `setInterval` ni cron.
- ⚠️ **Antes de producción hace falta un scheduler persistente** (cron de Railway u otro): sin
  tráfico, una reserva vencida sigue reteniendo stock hasta el próximo checkout o consulta.

### Validación y límites

Máximo 10 líneas y 10 unidades por línea; strings recortados con largo máximo; email válido;
teléfono obligatorio (6–15 dígitos, `+` inicial opcional, se guarda `+`? + dígitos); provincia ISO
3166-2:AR; CP de 4 dígitos o CPA; ids UUID; `graduationMode` `NONE`/`CUSTOM`; campos de entrega
condicionales por método. Factura: si `invoiceRequested = false` no se pide ni guarda dato fiscal; si
`true`, nombre + DNI/CUIT/CUIL (7–11 dígitos, solo formato — sin condición frente al IVA ni ARCA).
Body > 16 kb → `413 PAYLOAD_TOO_LARGE`; JSON malformado → `400`.

## Fase C — frontend: carrito, checkout y pedidos

Detalle técnico en [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md#cart-checkout-and-orders-payments-v1--phase-c).

- **Carrito solo en el frontend** (no hay tabla `Cart`): `localStorage` `soj:cart`. Cada línea
  guarda ids + snapshots de presentación (nombre, imagen, SKU, color/material, cristal, variedad,
  graduación, precio mostrado). **El precio es informativo**: al confirmar, el backend re-resuelve
  todo. Agregar o cambiar cantidades **no reserva stock**; solo un `201` del checkout reserva.
- **Identidad de línea**: producto + variante + tipo de cristal + variedad + modo de graduación. Si
  coinciden, se suman cantidades (máximo 10 por línea, 10 líneas — los mismos límites de la API); si
  cambia el cristal o la graduación, es otra línea. El nombre y el precio no son parte de la
  identidad.
- **Checkout** (`/checkout`): contacto (teléfono obligatorio), retiro (sucursal real desde
  `GET /api/branches`, que ahora expone `id`) o envío a domicilio, facturación opcional (nombre +
  DNI/CUIT/CUIL, sin condición frente al IVA ni tipo de factura), resumen con "Envío: GRATIS" y
  "Los precios y la disponibilidad se verifican al confirmar el pedido.". Sin login obligatorio; con
  sesión se precompletan nombre, apellido, email y teléfono de la cuenta (nunca el perfil óptico).
  Envío doble bloqueado mientras el pedido se crea (esto no reemplaza la idempotencia del pago).
- **Después del `201`**: invitado → token en `sessionStorage` (`soj:order-access:<orderNumber>`),
  nunca en la URL, `localStorage`, logs ni analytics; se vacía el carrito y se navega a
  `/order/:orderNumber`. Ante cualquier error, carrito y formulario quedan intactos.
- **Recuperar el pedido**: el token desaparece al cerrar la sesión del navegador. Mientras tanto, un
  invitado sin token ve un mensaje neutro con WhatsApp; una futura notificación por email/WhatsApp
  permitirá reabrir el pedido sin depender de `sessionStorage`.
- **Estados en pantalla**: `PENDING_PAYMENT` "Pago pendiente" (+ "Pedido creado" y hora límite de la
  reserva), `PAID` "Pago confirmado", `PAID_NEEDS_REVIEW` "Pago recibido — estamos verificando tu
  pedido", `EXPIRED` "Pedido vencido" (con "Volver al catálogo" y WhatsApp), `CANCELLED` "Pedido
  cancelado". Nunca "Pago aprobado" ni "Compra completada" antes de Mercado Pago.
- **"Mis pedidos"** (`/account/orders`): solo las órdenes de la cuenta; detalle en
  `/account/orders/:orderNumber`.

## Fase D1 — inicio del pago con Mercado Pago

- **Checkout Pro vía Orders API** (`POST /v1/orders` → `checkout_url`), **no** Preferences API
  (`/checkout/preferences`): es una integración nueva. SDK oficial `mercadopago` (versión fijada),
  solo en el backend, detrás de `PaymentProvider`. Timeout 10 s, sin reintentos automáticos del SDK.
- **Endpoint**: `POST /api/orders/:orderNumber/payment` — invitado con `X-Order-Access-Token` (la
  misma verificación de Fase B) o la cuenta dueña. Body vacío (cualquier campo → 400). Responde
  solo `{ checkoutUrl }`.
- **Validación previa**: la orden debe estar `PENDING_PAYMENT` con la reserva vigente. Vencida →
  `409 ORDER_EXPIRED` (se expira en el momento, sin llamar a Mercado Pago, sin extender la reserva).
  `PAID`/`PAID_NEEDS_REVIEW` → `ORDER_ALREADY_PAID`; `CANCELLED` → `ORDER_CANCELLED`.
- **Monto**: `Order.grandTotal`, congelado en el checkout; ítems desde los snapshots de
  `OrderItem`. Nunca del frontend.
- **Intentos (`Payment`)**: la `idempotencyKey` se guarda **antes** de llamar a Mercado Pago y se
  manda tal cual como `X-Idempotency-Key`. Timeout, error de red o respuesta inválida → el intento
  queda abierto y el reintento usa **la misma key** (misma order remota, nunca duplicada). Un
  segundo click reutiliza el `checkout_url` guardado. Mercado Pago rechaza el pedido → se cierra
  el intento y el próximo click abre uno nuevo con key nueva.
- **Retorno**: `/order/:orderNumber/payment/{success|pending|failure}`. **El redirect no confirma
  el pago**: la página ignora los parámetros de Mercado Pago (`status=approved`, etc.) y muestra el
  estado de nuestro pedido — "Estamos verificando tu pago" mientras siga `PENDING_PAYMENT`.
- **Sin credenciales** (`MERCADOPAGO_ACCESS_TOKEN` / `PUBLIC_WEB_URL` sin definir): la app funciona
  y "Pagar" responde `503 PAYMENT_PROVIDER_NOT_CONFIGURED`; el pedido sigue reservado.
- **Logs**: ids internos, id de la order remota, resultado normalizado y duración. Nunca tokens,
  headers, payloads ni datos del comprador.

### Smoke test manual con credenciales TEST (opcional, nunca en la suite)

1. En `.env` (local, nunca commiteado): `MERCADOPAGO_ACCESS_TOKEN=<token TEST de tu panel>` y
   `PUBLIC_WEB_URL=http://localhost:5173`.
2. `npm run dev:api` y `npm run dev:web`; crear un pedido con datos ficticios.
3. En el pedido, "Pagar con Mercado Pago" → debe abrir el Checkout Pro de prueba.
4. Pagar con un usuario/tarjeta de prueba de Mercado Pago y volver: la página debe decir "Estamos
   verificando tu pago" (el pedido sigue `PENDING_PAYMENT` hasta D2).
5. Con `http://localhost` no hay retorno automático (Mercado Pago lo exige `https`): volver con el
   botón del checkout.

## Pendiente (fases siguientes)

- Fase D2: webhook (`x-signature`, `PaymentEvent`, lectura server-side del estado real,
  verificación de monto, `markOrderPaid()`, duplicados, aprobación tardía).
- Notificación del pedido por email/WhatsApp (recuperar acceso sin `sessionStorage`).
- Scheduler persistente del barrido de expiración (antes de producción).
- Flujo humano para `PAID_NEEDS_REVIEW`; cancelación.
