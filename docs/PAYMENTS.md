# Payments V1

Estado: **Fase A implementada** (dominio de órdenes, sin proveedor de pagos). Mercado Pago, checkout,
webhook y endpoints HTTP **todavía no existen**. Decisión de arquitectura: [ADR-0025](adr/0025-order-domain-and-stock-reservation.md).

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

## Pendiente (fases siguientes)

- Fase B: `PaymentProvider` + adaptador de Mercado Pago (preferencia, `idempotencyKey`,
  `externalReference`), programar el barrido de expiración.
- Fase C: carrito (estado del frontend) y endpoint de checkout; cotización real de envío en la orden.
- Webhook con `PaymentEvent` como registro idempotente.
- Endpoint de consulta de la orden para invitados (`X-Order-Access-Token`).
- Flujo humano para `PAID_NEEDS_REVIEW`; cancelación.
