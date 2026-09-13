# Shipping V1

Envíos: retiro en local y envío a domicilio en Argentina, con envío gratis para el cliente.
Decisión de arquitectura: [ADR-0024](adr/0024-shipping-boundary.md). Este documento es la
referencia operativa. Estado: **Fase A implementada** (sin proveedor logístico real).

## Política vigente: `FREE_NATIONAL_V1`

**El cliente paga $0 de envío dentro de Argentina. Eso NO significa que el envío no tenga costo
para Soluciones Ópticas:** el costo real del transportista se registra por separado y lo absorbe el
negocio. Tres montos que nunca se mezclan (función pura `applyShippingPolicy`, en Decimal):

| Caso                              | Costo del proveedor | Precio al cliente | Costo absorbido |
| --------------------------------- | ------------------- | ----------------- | --------------- |
| `PICKUP` (retiro en local)        | 0                   | 0                 | 0               |
| `DELIVERY` con cotización real    | costo real          | **0**             | costo real      |
| `DELIVERY` sin costo conocido aún | `null`              | **0**             | `null`          |

- Un costo desconocido es `null`, nunca un número inventado. En la UI se muestra "No disponible",
  nunca `$0`.
- El envío **no** modifica ningún precio de producto ni de cristal. Incorporar costos logísticos al
  precio comercial es una decisión futura de pricing, basada en los costos reales registrados.
- El único monto de envío que llegará al total del cliente (y a Mercado Pago) es el precio al cliente
  — hoy siempre 0.

## Métodos de entrega

- **`PICKUP`**: retiro en Soluciones Ópticas, Alvear 732, San Salvador de Jujuy, Jujuy, Argentina
  (la `Branch` real). Sin dirección, sin proveedor, 0/0/0.
- **`DELIVERY`**: solo Argentina (24 jurisdicciones, códigos ISO 3166-2:AR de una letra). Sin envío
  internacional. El costo se cotiza por código postal y paquete, **nunca con una tabla por
  provincia**; la provincia sirve para validación, UI y reportes.

`DeliveryMethod` es un tipo compartido; no hay enum en DB hasta que exista `Order`.

## Datos de entrada

- **Código postal**: 4 dígitos (`4600`) o CPA alfanumérico (`Y4600ABC`). Se normaliza con trim +
  mayúsculas. Solo validación de formato: sin servicios externos y sin inferir la provincia.
- **Dirección** (`ShippingAddressInput`, contrato compartido + Zod): obligatorios `recipientName`,
  `phone`, `streetName`, `streetNumber`, `city`, `provinceCode`, `postalCode`; opcionales `floor`,
  `apartment`, `references`. **No se persiste** en Fase A y nunca depende de `User` (checkout
  invitado): el futuro `Order` la guardará como snapshot.

## Origen y paquete

- **Origen**: la sucursal (la `Branch` no eliminada más antigua) y su `postalCode` (nullable). El
  valor real del CP/CPA de Alvear 732 **todavía no está confirmado y no se inventó**; hasta cargarlo,
  toda cotización informa `ORIGIN_POSTAL_CODE` como configuración faltante. No hay UI de sucursales:
  se carga directamente en la base cuando se confirme (`UPDATE branches SET postal_code = '…'`).
- **Paquete**: `ShippingPackageProfile` (nombre, peso en gramos, largo/ancho/alto en cm; enteros
  mayores que cero, con `CHECK`). Como máximo **un perfil activo predeterminado**: se garantiza en el
  servicio con una transacción serializada por advisory lock. Borrar el predeterminado deja el
  sistema sin predeterminado (no se puede cotizar hasta elegir otro). Sin valores precargados: las
  medidas reales del paquete de anteojos las carga el admin.

## Proveedor logístico (boundary)

`services/shipping-provider.service.ts` es el único acceso a un transportista (mismo patrón que
`image-provider.service.ts`; en tests se reemplaza con `vi.mock`). Un `ShippingProvider` expone
`code`, `isConfigured()` y `quote(input)`, con input CP origen/destino, provincia destino, paquete y
valor declarado opcional. **Fase A no tiene adapter**: el proveedor devuelto nunca está configurado.
Sin credenciales, sin variables de entorno, sin red.

## Cotización (`quoteShipping`)

1. `PICKUP` → 0/0/0, sin proveedor ni log.
2. `DELIVERY`: valida destino (CP y provincia).
3. Resuelve origen (CP de la sucursal) y perfil predeterminado. Si falta alguno → `NOT_CONFIGURED`
   con la lista `missingConfiguration`; **no se registra** (no hay snapshot válido).
4. Proveedor no configurado → `NOT_CONFIGURED` (lista incluye `PROVIDER`), **se registra**.
5. Con proveedor: cotiza con timeout (8 s) → `QUOTED`, `NOT_COVERED` o `FAILED` (timeout, caída,
   costo inválido), **se registra**.

En todo caso distinto de `QUOTED`, el costo queda `null` y el cliente sigue pagando 0.

### Estados del log vs. estado del pedido

`shipping_quotes` guarda el resultado **síncrono** de un intento: `QUOTED`, `FAILED`, `NOT_COVERED`,
`NOT_CONFIGURED`. **`PENDING` no es un estado de cotización**: queda reservado para el futuro
`Order.shippingCostStatus` (pedido real cuyo costo logístico todavía no se conoce).

Cada log guarda: origen (`CHECKOUT` / `ADMIN_SIMULATOR` / `ESTIMATE_MATRIX`), proveedor, servicio,
CPs, provincia, snapshot del paquete, valor declarado, costo, moneda, días estimados, vigencia,
referencia del proveedor, código de error (solo el tipo, nunca el mensaje), latencia y
`policyCode`. **Nunca** tokens, headers ni respuestas crudas.

## Admin — `/admin/shipping`

| Método | Ruta                                               | Uso                                      |
| ------ | -------------------------------------------------- | ---------------------------------------- |
| GET    | `/api/admin/shipping/package-profiles`             | Listar perfiles (el predeterminado 1.º)  |
| POST   | `/api/admin/shipping/package-profiles`             | Crear (`isDefault` opcional)             |
| PATCH  | `/api/admin/shipping/package-profiles/:id`         | Editar nombre/medidas                    |
| DELETE | `/api/admin/shipping/package-profiles/:id`         | Soft delete (deja de ser predeterminado) |
| POST   | `/api/admin/shipping/package-profiles/:id/restore` | Restaurar (no predeterminado)            |
| POST   | `/api/admin/shipping/package-profiles/:id/default` | Marcar como predeterminado               |
| POST   | `/api/admin/shipping/simulations`                  | Simular (30/min por admin)               |

Todo bajo `authenticate` + `authorize("ADMIN")`. El simulador recibe solo CP y provincia de destino;
muestra "Envío al cliente: Gratis" separado de "Costo del transportista" y "Costo absorbido", y hoy
explica qué falta ("Proveedor logístico no configurado", CP de origen, perfil).

**No hay endpoint público de envíos** en Fase A (no hay consumidor). El costo del proveedor nunca
será parte de una respuesta pública.

## Próximas fases

- **Fase B — proveedor real** (bloqueada por decisión del cliente): un adapter para el operador
  elegido + sus variables de entorno (grupo "todas o ninguna", como Cloudinary), pruebas contra su
  ambiente QA, y la matriz estimativa por provincia (CPs representativos elegidos por la óptica,
  resultados fechados con `source = ESTIMATE_MATRIX`, nunca usados para cobrar).
- **Fase C — checkout/Orders/Mercado Pago**: endpoint público de cotización que devuelve
  disponibilidad y `customerShippingPrice` (nunca el costo del proveedor); `Order` con snapshot de
  método, destinatario, dirección, proveedor, servicio, los tres montos, `policyCode`,
  `shippingCostStatus` (`QUOTED` | `PENDING`), referencia al log, tracking. Si el proveedor falla al
  confirmar un pedido, el pedido sigue (el cliente paga 0 igual) con costo `PENDING` a conciliar;
  si el CP no tiene cobertura, no se ofrece `DELIVERY` para ese destino. Total a Mercado Pago =
  armazón + cristal + precio de envío al cliente (0).

## Proveedores auditados (documentación oficial)

- **Correo Argentino — API MiCorreo** (PDF oficial, 2022-08-08): QA y producción, Basic → JWT,
  credenciales por ambiente pedidas al Correo. `POST /rates`: `customerId`, CP origen/destino,
  entrega `D`/`S`, peso en g (1–25000), alto/ancho/largo en cm (≤ 150). Devuelve precio y
  `validTo`, sin plazo de entrega.
- **OCA — e-Pak** (portal oficial): `Tarifar_Envio_Corporativo` con CUIT, operativa, peso en kg,
  volumen en m³, CP origen/destino, bultos y valor declarado; devuelve costo y plazo. Requiere
  cuenta e-Pak.
- **Andreani**: portal oficial no accesible durante el audit (403) — no verificado.

Ningún operador está elegido ni contratado.

## Métricas que habilita

Con `shipping_quotes` (y luego el snapshot del pedido): costo promedio, costo absorbido por
provincia y por pedido, proveedor/servicio más usado, tasa de fallos y latencia — por SQL, sin
dashboard todavía.

## Decisiones pendientes del cliente

- Operador logístico, cuenta/contrato y credenciales (QA y producción).
- CP/CPA exacto de Alvear 732.
- Peso, medidas y embalaje reales del paquete.
- Valor declarado / seguro.
- ¿Se aceptan pedidos con costo de envío todavía desconocido? (recomendado: sí).
- ¿Solo domicilio o también entrega en sucursal del correo?
- Despacho y etiquetas (otro milestone). Cobertura de Tierra del Fuego a confirmar con el operador.
