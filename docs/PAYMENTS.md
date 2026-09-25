# Payments V1

Estado: **Fase A y Fase B implementadas** — dominio de órdenes + backend HTTP de checkout y consulta
de pedidos. **Sin proveedor de pagos**: Mercado Pago, preferencias, webhook y frontend **todavía no
existen**. Decisión de arquitectura: [ADR-0025](adr/0025-order-domain-and-stock-reservation.md).
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

## Pendiente (fases siguientes)

- Fase C: carrito (estado del frontend), página de checkout, páginas de pedido.
- Fase D: `PaymentProvider` + adaptador de Mercado Pago (preferencia, `idempotencyKey`,
  `externalReference`), error `ORDER_EXPIRED` al intentar pagar una orden vencida.
- Webhook con `PaymentEvent` como registro idempotente, llamando a `markOrderPaid()`.
- Scheduler persistente del barrido de expiración (antes de producción).
- Flujo humano para `PAID_NEEDS_REVIEW`; cancelación.
