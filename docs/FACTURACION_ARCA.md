# Facturación electrónica ARCA — compras online

Rama `feature/arca-invoicing`, creada desde `e051a7e` (la versión publicada), independiente de las
versiones A y B. Decisión: [ADR-0036](adr/0036-arca-electronic-invoicing-boundary.md).

**Alcance:** solo compras hechas en la web con el pago confirmado. Las ventas en el local se siguen
facturando desde el portal de ARCA. Sin facturación manual.

**Estado:** implementado localmente con ARCA y correo simulados. Sin datos fiscales reales, sin
homologación ejecutada, sin integrar con el checkout, sin push.

## 1. Auditoría del checkout (2026-10-25)

| Pregunta                               | Producción (`e051a7e`)  | Rama local `feature/payments-v1` (sin publicar)                                                   |
| -------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| ¿Existe checkout?                      | No                      | Sí: carrito en el navegador, checkout de invitado o con cuenta                                    |
| ¿Pasarela de pago?                     | No                      | Mercado Pago Checkout Pro (Orders API)                                                            |
| ¿Solo deriva a WhatsApp?               | **Sí**                  | Mantiene WhatsApp además del checkout                                                             |
| ¿Modelo de pedidos, pagos y estados?   | No                      | `Order` (PENDING_PAYMENT, PAID, PAID_NEEDS_REVIEW, CANCELLED, EXPIRED), `Payment`, `PaymentEvent` |
| ¿Correo del comprador?                 | Solo de cuentas creadas | `Order.customerEmail` obligatorio; no envía ningún correo                                         |
| ¿Datos de facturación?                 | No                      | Opcionales: nombre y DNI/CUIT/CUIL. **No pide la condición frente al IVA**                        |
| ¿Confirmación de pago confiable?       | No                      | Webhook firmado + consulta a Mercado Pago del lado del servidor + verificación de monto y moneda  |
| ¿Probado con Mercado Pago real (TEST)? | —                       | **No** (faltan credenciales TEST, URL HTTPS y secret del webhook)                                 |
| ¿Stock?                                | —                       | Se reserva (descuenta) al crear el pedido; 30 min; sin scheduler de vencimiento                   |
| Estado de la rama                      | —                       | 24 commits propios, 14 detrás de producción, sin push                                             |

Conclusión: **hoy no existe una confirmación de pago en producción**. La facturación queda lista
para engancharse a la del checkout cuando esa rama se integre; mientras tanto no emite nada real.

## 2. Arquitectura

```
Checkout (payments-v1)            Facturación (esta rama)
──────────────────────            ───────────────────────────────────────────────────────────
webhook firmado ─► getOrder ─►    processPaidOrder(order)
markOrderPaid() = PAID            ├─ refuseUnverifiedOrder  (PAID, APPROVED, monto = total, ARS)
                                  ├─ OnlineInvoiceRequest   (1 por pedido; copia del pedido pagado)
                                  ├─ planVoucher            (comprador, tipo, IVA) ─► WAITING_DATA
                                  ├─ Sale + FiscalDocument  (borrador; idempotencia order:<id>)
                                  ├─ emitInvoice ─► WSAA + WSFEv1 (o simulado) ─► CAE
                                  ├─ InvoiceEmailDelivery   (estado propio) ─► PDF + QR por correo
                                  └─ runOnlineInvoicing     (recuperación: preparar, verificar, emitir, enviar)
Comprador: /factura/:id#token ─► GET /api/invoices/:id/pdf (token en encabezado)
```

## 3. Modelos de datos (migración aditiva `20261025200000_add_arca_invoicing`)

| Tabla                      | Contenido                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `fiscal_issuers`           | CUIT, razón social, domicilio, IIBB, inicio de actividades, condición fiscal confirmada, mínimo para identificar, alícuotas      |
| `fiscal_points_of_sale`    | Número, tipos habilitados, activo, «para la tienda online» (uno solo)                                                            |
| `fiscal_sequences`         | Bloqueo de emisión por punto de venta y tipo                                                                                     |
| `online_invoice_requests`  | Pedido pagado (id, número, pago, correo, copia completa), estado `RECEIVED`/`WAITING_DATA`/`INVOICED`, motivo, datos completados |
| `sales`, `sale_items`      | Comprador y renglones tal como figuran en el comprobante (importe pagado, neto, IVA, SKU)                                        |
| `fiscal_documents`         | Tipo, número, estado, CAE, vencimiento, lo enviado a ARCA, observaciones y errores, intentos                                     |
| `invoice_email_deliveries` | Destinatario, estado `PENDING`/`SENDING`/`SENT`/`FAILED`, intentos, próximo intento, último error                                |
| `fiscal_audit_events`      | Cada transición, sin tokens ni certificados                                                                                      |

## 4. Flujo de emisión y envío

1. El checkout confirma el pago (webhook + consulta al proveedor) y llama a `processPaidOrder`.
2. Se rechaza si el pedido no está `PAID`, el pago no está `APPROVED`, el monto no coincide o no es
   en pesos. Se registra un pedido a facturar por orden, aunque llegue varias veces.
3. Plan del comprobante:
   - Sin datos de factura → Consumidor Final; sin documento (99) solo por debajo del mínimo
     configurado.
   - DNI → Consumidor Final (96).
   - CUIT/CUIL → espera que un admin indique la condición frente al IVA y si es CUIT o CUIL.
   - Tipo: el único tipo habilitado del punto de venta online que admite esa condición (anexo
     oficial). Con Factura A y B habilitadas: Responsable Inscripto/Monotributo → A; Consumidor
     Final/Exento → B.
   - Renglones: armazón (o accesorio) y cristales por separado, cada uno con su alícuota.
4. Emisión con número = último autorizado + 1. Ante respuesta perdida: «Respuesta pendiente», y se
   resuelve consultando a ARCA, nunca reenviando a ciegas.
5. Autorizado → PDF con CAE, vencimiento y QR → correo al comprador con el PDF y un enlace privado.
6. El correo tiene su propio estado: si falla, reintenta con espera creciente; el admin puede
   reenviarlo (también a otra dirección) sin emitir otra factura.
7. «Procesar pendientes» en el panel (o un scheduler, a definir) retoma todo lo que quedó a medias.

## 5. Pruebas realizadas (datos ficticios)

| Suite                                            | Resultado                 | Qué cubre                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/test/lib/arca.test.ts`                 | 19                        | Importes con IVA incluido; QR igual byte a byte al ejemplo oficial; TRA; firma CMS verificada con OpenSSL; TA y su caché; SOAP de FECAESolicitar, FECompUltimoAutorizado y FECompConsultar (602); errores internos como inciertos; sin reintento de la emisión                                          |
| `apps/api/test/lib/online-order-invoice.test.ts` | 8                         | Qué pedidos se facturan; consumidor final, DNI, CUIT; tipo según el anexo; nada se supone (alícuota, mínimo, tipos ambiguos, envío cobrado, totales); token de descarga                                                                                                                                 |
| `apps/api/test/admin/invoicing.test.ts`          | 14                        | Flujo completo con ARCA y correo simulados: configuración que bloquea, Factura B y A, idempotencia ante confirmaciones repetidas y simultáneas, correo fallido y reenvío, respuesta perdida, rechazo, revisión manual, choque de números, descarga del comprador, auditoría sin secretos, stock intacto |
| `apps/web/test/admin-invoicing-page.test.tsx`    | 8                         | Panel sin facturación manual, estados ARCA y correo, procesar pendientes, completar condición del comprador, confirmación fiscal explícita, reenvío sin emitir, incierto solo se verifica, descarga del comprador con el token en encabezado                                                            |
| Suites completas                                 | API 420/420 · Web 304/304 | Más typecheck, lint, formato y build de API y web                                                                                                                                                                                                                                                       |

## 6. Pendiente

**Decisiones del contador o de Roberto:**

- Alícuota de IVA de armazones, cristales y accesorios.
- Mínimo desde el que hay que identificar al consumidor final.
- Diseño legal del PDF (RG 1415; leyenda de IVA contenido en Factura B, Ley 27.743).
- Qué hacer con devoluciones (notas de crédito) y con pedidos `PAID_NEEDS_REVIEW`.
- Si el envío se llega a cobrar, cómo se factura.

**Decisiones comerciales:**

- Integrar y publicar el checkout (`feature/payments-v1`).
- Que el checkout pregunte la condición frente al IVA cuando el comprador deja CUIT.
- Elegir el proveedor de correo y el remitente (dominio, SPF/DKIM).
- Elegir el scheduler para «Procesar pendientes» (por ejemplo, cron de Railway).

**Técnico:**

- Adaptador que lea `Order` + `OrderItem` + `Payment` (+ `Product.kind`) y llame a
  `processPaidOrder()` después de `markOrderPaid()`.
- Adaptador real de correo.
- Probar en homologación.
- Si hay más de una instancia de la API, compartir el ticket de acceso de WSAA.

## 7. Requisitos para homologación y producción

**Homologación (sin certificados de producción):**

1. CUIT del emisor, para el certificado de prueba.
2. Generar la clave privada en el servidor o en la máquina de prueba (nunca en el repo ni en el
   chat) y su CSR con `serialNumber=CUIT …` y `O`/`CN` según la especificación del WSAA.
3. En WSASS (autoservicio de homologación, con clave fiscal): obtener el certificado y asociarlo al
   servicio `wsfe`.
4. Variables (fuera del repo):
   - `ARCA_MODE=homologacion`
   - `ARCA_CERT_PATH` y `ARCA_KEY_PATH` (rutas a los archivos)
   - `INVOICE_EMAIL_MODE=mock`
5. Reloj del servidor sincronizado por NTP.
6. Cargar en el panel el emisor, la condición confirmada, el punto de venta de homologación, las
   alícuotas y el mínimo. Con `FEParamGetTiposCbte`, `FEParamGetTiposIva` y
   `FEParamGetCondicionIvaReceptor`, confirmar que los códigos coinciden con `lib/arca/codes.ts`.
7. Emitir comprobantes de prueba (A y B), forzar caídas y verificar con `FECompConsultar`.
8. Volver a descargar el manual WSFEv1 y confirmar la versión.

**Producción** (cada paso con autorización explícita):

1. Punto de venta nuevo en ARCA para «Factura electrónica – Web Services», distinto del que usa el
   portal.
2. Certificado de producción (Administrador de Certificados Digitales), asociado a `wsfe` en el
   Administrador de Relaciones de Clave Fiscal.
3. Cambio de código revisado que agregue el ambiente de producción. Hoy no existe a propósito.
4. Proveedor de correo real.
5. Checkout integrado y probado con Mercado Pago TEST.
6. Respaldo verificado antes de la migración, que es aditiva.
7. Primer comprobante real controlado en el portal de ARCA.

## Archivos

- **API:**
  - `lib/arca/{codes,amounts,qr,wsaa,wsfe,mock-provider}.ts`
  - `lib/{invoicing-provider,online-order-invoice,invoice-email,invoice-access-token}.ts`
  - `services/{invoicing,invoicing-provider,online-invoicing,invoice-email,invoice-pdf}.service.ts`
  - `controllers/admin-invoicing.controller.ts`
  - `routes/admin/invoicing.routes.ts`, `routes/invoices.routes.ts`
  - `schemas/invoicing.schema.ts`
  - `lib/env.ts` (`ARCA_*`, `INVOICE_EMAIL_MODE`, `PUBLIC_WEB_URL`)
- **Web:**
  - `pages/admin/{AdminInvoicingPage,AdminInvoiceDetailPage,invoice-status}.tsx`
  - `pages/InvoiceDownloadPage.tsx`
  - `services/queries/admin-invoicing.ts`
  - `services/api-client.ts` (encabezados extra y descarga de archivos)
  - Rutas y menú «Facturación».
- **Compartido:** `packages/shared/src/invoicing.ts`.
- **Base de datos:** `prisma/schema.prisma` y la migración.
- **Configuración:** `.gitignore` (certificados y claves), `.env.example`.
- **Dependencias** (versiones fijas): `node-forge`, `fast-xml-parser`, `pdfkit`, `qrcode`.
  - `node-forge` tiene un aviso de seguridad sobre la _verificación_ de firmas RSA; este módulo solo
    firma.
