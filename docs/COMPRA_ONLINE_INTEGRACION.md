# Compra online + facturación — integración

**Rama vigente: `integration/checkout-mp-241facf`** (2026-11-20), creada desde `241facf`, el commit
publicado en Railway y en Vercel. Trae la integración original `integration/online-checkout-arca`
(creada el 2026-10-25 desde `e051a7e`), que a su vez integra `feature/payments-v1` y
`feature/arca-invoicing`. Sin push, sin deploy y sin cambios en producción. Reintegración, pruebas y
entorno aislado: [PRUEBAS_MERCADOPAGO_AISLADO.md](PRUEBAS_MERCADOPAGO_AISLADO.md).

Detalle de cada parte: [PAYMENTS.md](PAYMENTS.md) (checkout y Mercado Pago),
[FACTURACION_ARCA.md](FACTURACION_ARCA.md) y [ADR-0036](adr/0036-arca-electronic-invoicing-boundary.md)
(facturación).

## 1. Auditoría de ramas (2026-10-25)

| Rama                           | Base      | Commits propios         | Migraciones propias                                       |
| ------------------------------ | --------- | ----------------------- | --------------------------------------------------------- |
| Producción `e051a7e`           | —         | —                       | 7 (hasta `20261011150000_add_accessory_catalog`)          |
| A `6f61029`                    | `e051a7e` | 22                      | ninguna                                                   |
| B `release/production-upgrade` | `e051a7e` | 48                      | 2 (`20261025024630`, `20261025035154`)                    |
| `feature/payments-v1`          | `33c6fba` | 24 (14 detrás de prod.) | 3, con fechas de **septiembre** (anteriores a accesorios) |
| `feature/arca-invoicing`       | `e051a7e` | 2                       | 1 (`20261025200000`)                                      |

Conflictos resueltos al integrar, conservando los dos lados:

- **Ficha de producto:** ahora tiene el regalo de estuche y cordón, «Agregar al carrito» y
  «Consultar por WhatsApp».
- **Rutas de la web:** accesorios + carrito, checkout y pedido.
- **Exportaciones compartidas.**
- **Validador de cristales:** recibe la transacción del checkout y se aplica solo a armazones,
  según ADR-0028.
- **Dependencias y variables:** `PUBLIC_WEB_URL` es una sola variable y la usan el retorno de
  Mercado Pago y el enlace de la factura.

## 2. Arquitectura final

```
Ficha ─► Carrito (navegador) ─► Checkout invitado ─► Order PENDING_PAYMENT (reserva stock 30 min)
                                                         │
                                  «Pagar con Mercado Pago» (Checkout Pro, Orders API)
                                                         │
Mercado Pago ─► webhook firmado ─► consulta del pedido a Mercado Pago (servidor) ─► Order PAID
                                                         │  (después de responder al webhook)
                                    Facturación online ─► ARCA (simulado/homologación) ─► CAE
                                                         │
                                          PDF + QR ─► correo (simulado) ─► enlace privado
Recuperación: «Procesar pendientes» = pedidos pagados sin factura + ARCA pendiente + correos.
Panel: «Pedidos online» (pago | factura | correo) y «Facturación».
```

- Solo el backend confirma un pago: webhook con firma HMAC, consulta a Mercado Pago, y monto y
  moneda iguales a los del pedido. La página de retorno no confirma nada.
- **Webhooks repetidos:**
  - Cada evento queda registrado una sola vez (`PaymentEvent` único).
  - Un pago se aprueba una sola vez.
  - Hay un solo pedido a facturar por orden y una sola factura por pedido.
  - Probado con el mismo evento ×2, otro evento y entregas simultáneas.
- `PAID_NEEDS_REVIEW`, pagos duplicados y montos distintos no se facturan solos: quedan para
  revisión humana.
- WhatsApp sigue en la ficha, en el pedido y en los mensajes de error.

## 3. Migraciones y compatibilidad

| Orden | Migración                                                       | Contenido                                                                                   |
| ----- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1–9   | Las publicadas (hasta `20261029001653_add_variant_color_tones`) | Sin cambios                                                                                 |
| 10    | `20261120100000_add_arca_invoicing`                             | Tablas de facturación                                                                       |
| 11    | `20261120110000_add_orders_payments`                            | Pedidos, renglones, pagos, eventos                                                          |
| 12    | `20261120110100_add_payment_provider_order`                     | Datos del pedido en Mercado Pago                                                            |
| 13    | `20261120110200_align_payment_events_orders`                    | Eventos del webhook                                                                         |
| 14    | `20261120120000_checkout_billing_condition_and_item_kind`       | Condición frente al IVA y tipo de documento del comprador; tipo de producto de cada renglón |

- **Renombradas el 2026-11-20 sin cambiar su contenido** (mismo SHA-256 del SQL), para que queden
  después de las dos que se publicaron el 28 y 29/10. Historia de nombres: las de pagos nacieron en
  septiembre (`20260923231319`, `20260925232138`, `20260926140327`), pasaron a `20261025…` en la
  primera integración y ahora a `20261120…`. **Nunca estuvieron en un árbol desplegado**, y el deploy
  de Railway no corre migraciones (build `tsc`, postinstall `prisma generate`, sin pre-deploy): no
  pudieron aplicarse en producción.
- **Todas son aditivas:** tablas, tipos e índices nuevos; las columnas nuevas van sobre tablas que
  crean ellas mismas. Ninguna borra, actualiza ni inserta datos, ni toca el índice de búsqueda.
- **Dependencias:** `110000` → `110100` → `110200` → `120000` (cada una altera tablas de la anterior).
  La de facturación (`100000`) es independiente: guarda el id del pedido sin clave foránea. Las
  claves foráneas apuntan a `users`, `branches`, `products`, `product_variants`, `lens_types`,
  `lens_options` y `shipping_quotes`, que las publicadas `20261028`/`20261029` no modifican.
- **Ensayo del 2026-11-20** (Postgres 18 descartable, como Railway): las 9 publicadas con el código de
  `241facf` → seed → huella → las 5 nuevas desde la rama. Resultado: datos del catálogo idénticos,
  los 44 índices previos idénticos (misma huella), `products_name_trgm_idx` presente, y
  `prisma migrate diff` contra `schema.prisma` sin diferencias salvo ese índice, que es SQL manual
  fuera del esquema (ADR-0014) y ya aparece así en la versión publicada.
- El ensayo anterior (2026-10-25) se hizo sobre una copia restaurada de los datos reales, con la
  base `e051a7e`.
- **Con la versión B:** sus 2 migraciones tienen fecha anterior a estas. Si B se publica antes, las
  5 de esta rama se aplican después sin conflicto. El código de B (borradores, `status`, regalos
  con agotados) **todavía no está integrado aquí**: necesita una revisión explícita, como pediste.

## 4. Funcionalidades implementadas

- **Checkout invitado:**
  - Producto, variante y color, cantidad, subtotales y total.
  - Correo, teléfono, retiro o envío.
  - Datos de facturación:
    - Condición frente al IVA: consumidor final, responsable inscripto, monotributista o exento.
    - DNI solo para consumidor final.
    - CUIT/CUIL con dígito verificador.
- **Lo que se vende online:**
  - Armazones **sin cristales**. Los cristales no se cobran online mientras
    `ONLINE_LENS_SALES` y `VITE_ONLINE_LENS_SALES` no estén en `on`: la ficha agrega solo el
    armazón y deriva los cristales a WhatsApp.
  - Accesorios que se venden solos, a su propio precio.
  - Nunca un producto con precio 0 ni un regalo.
- **Mercado Pago:** solo modo de prueba y solo con credenciales que configure el dueño. Sin
  credenciales, «Pagar» responde «todavía no disponible» y ofrece WhatsApp.
- **Facturación:**
  - Factura A o B según la condición del comprador, emitida sola después del pago.
  - Si falta algún dato, el pedido queda en «Faltan datos».
- **Correo:** el PDF con CAE y QR se envía al comprador. Tiene su propio estado, reintentos y
  reenvío, y no se envía ningún correo real.
- **Panel:**
  - «Pedidos online»: el pago, la factura y el correo, cada uno con su estado.
  - «Facturación»: facturas, pedidos que esperan datos, configuración fiscal, procesar pendientes
    y reenviar correo.

## 5. Datos personales

| Dato                                            | Dónde                             | Para qué                         | Quién lo ve                                      |
| ----------------------------------------------- | --------------------------------- | -------------------------------- | ------------------------------------------------ |
| Nombre, apellido, email, teléfono               | `orders`                          | Contactar y entregar el pedido   | El comprador (con su token o cuenta) y los admin |
| Domicilio de entrega                            | `orders` (solo envío)             | Envío                            | Ídem                                             |
| Nombre, DNI/CUIT/CUIL, condición IVA, domicilio | `orders`, `sales`, comprobante    | Factura electrónica (obligación) | Ídem y ARCA                                      |
| Email del comprador                             | `online_invoice_requests`, correo | Enviar la factura                | Admin                                            |
| Datos de tarjeta                                | **Nunca en la tienda**            | —                                | Solo Mercado Pago                                |

- **Sin datos clínicos** ni receta: la graduación personalizada se coordina por WhatsApp.
- **Lo que nunca se guarda ni se registra:**
  - el token de acceso del comprador (solo su hash, como encabezado y nunca en la URL);
  - el token de descarga de la factura (va en el fragmento `#`);
  - los tokens de Mercado Pago y de ARCA;
  - el certificado;
  - las respuestas crudas de los proveedores.
- La auditoría fiscal no guarda secretos (lo prueban los tests).
- **Conservación:** los comprobantes no se borran, por obligación fiscal. El plazo y la política
  de privacidad los define el contador o abogado. **Las páginas legales siguen en borrador.**

## 6. Permisos administrativos

- Todo `/api/admin/*` exige sesión con rol `ADMIN`.
- Un admin puede ver los pedidos online, la configuración fiscal y las facturas, completar datos,
  procesar pendientes y reenviar correos.
- Ningún admin puede crear facturas a mano, cambiar el número de una factura ni borrar
  comprobantes.
- La condición fiscal del emisor se registra con una confirmación explícita y queda auditada (quién
  y cuándo).
- Hoy existe un solo rol de admin. Antes de producción, conviene decidir si todos los admins deben
  ver datos personales y fiscales, o crear un rol separado.
- El comprador ve solo su pedido (token o cuenta) y su factura (enlace privado). Todo lo demás
  responde 404.

## 7. Pruebas (base local aislada `soluciones_opticas_checkout`, datos ficticios)

- **API: 653/653**, tres corridas seguidas. Incluye:
  - checkout;
  - webhooks con firma, repetidos y simultáneos;
  - pago por otro monto;
  - pedido pagado que no llegó a facturación, recuperado;
  - Factura A y B automáticas;
  - ARCA caído, respuesta perdida, rechazo y revisión;
  - PDF y QR;
  - correo fallido y reenvío;
  - descarga del comprador;
  - reglas nuevas del checkout;
  - stock: facturar no lo modifica.
- **Web: 368/368.** Incluye checkout con condición fiscal y CUIT, carrito sin cristales, panel de
  pedidos online y facturación, y descarga del comprador.
- **Navegador real (Playwright) en escritorio 1280×900 y celular 390×844:**
  - ficha → carrito → checkout → CUIT inválido rechazado → pedido creado;
  - «Pagar» sin credenciales muestra el aviso con WhatsApp;
  - sin desplazamiento horizontal ni errores de JavaScript.
  - Capturas en [audits/online-checkout/](audits/online-checkout/).
- **Typecheck, lint, formato, build de API y web, y validación del esquema:** sin errores.

## 8. Requisitos para probar en modo de prueba

**Mercado Pago (TEST)**, cada paso hecho por el dueño:

1. Cuenta de Mercado Pago del comercio → «Tus integraciones» → crear la aplicación (Checkout Pro).
2. Credenciales **de prueba**: `MERCADOPAGO_ACCESS_TOKEN` (TEST) en un entorno que no sea
   producción. Nunca en el repo ni en el chat.
3. Una URL HTTPS pública para la API de prueba, porque el webhook no llega a `localhost`. Hoy **no
   hay un staging aislado**: el «staging» de Railway es la tienda real. Hace falta un entorno de
   prueba separado, con su propia base, para no tocar producción.
4. Webhook «Order (Mercado Pago)» apuntando a `/api/payments/mercadopago/webhook`, y su clave en
   `MERCADOPAGO_WEBHOOK_SECRET`.
5. `PUBLIC_WEB_URL` con la web de prueba, y usuarios y tarjetas de prueba de Mercado Pago.

**ARCA (homologación):**

- Lo mismo que en [FACTURACION_ARCA.md §7](FACTURACION_ARCA.md): certificado de WSASS asociado a
  `wsfe`, `ARCA_MODE=homologacion`, punto de venta de prueba, datos fiscales confirmados por el
  contador y reloj sincronizado.
- Correo: elegir el proveedor y usar una casilla de prueba.

## 9. Riesgos pendientes

- **Ninguna parte se probó todavía con Mercado Pago ni con ARCA reales**, ni siquiera en modo de
  prueba.
- No existe un entorno de prueba separado de la tienda real: es el bloqueo principal.
- **Stock:** el checkout reserva y descuenta stock al crear el pedido, durante 30 minutos. Hoy el
  stock se vende también en el local y por WhatsApp. Sin un programa que libere las reservas
  vencidas automáticamente, una reserva vencida retiene stock hasta el próximo checkout. Hay que
  decidir la política antes de abrir la venta online.
- **Regalos:** la elección de color del estuche y el cordón en la ficha no viaja al pedido (sí viaja
  por WhatsApp). Falta incorporarla.
- **Fiscales:** las alícuotas de armazones y accesorios, el mínimo de identificación, el diseño
  legal del PDF y las notas de crédito por devoluciones quedan pendientes del contador.
- **Legal:** términos de compra, devoluciones y privacidad, que hoy son borradores.
- **WhatsApp Business** (avisos de pedidos y promociones): no incluido. Requiere consentimiento
  explícito y plantillas aprobadas por Meta.
- La integración con B (borradores, `status`, nuevo buscador) requiere una revisión aparte.
- El ticket de acceso de ARCA vive en memoria: con más de una instancia de la API habrá que
  compartirlo.
