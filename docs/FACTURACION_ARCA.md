# Facturación electrónica ARCA — auditoría y diseño técnico

Rama `feature/arca-invoicing`, creada desde `e051a7e` (la versión publicada), independiente de las
versiones A y B. Decisión de arquitectura: [ADR-0036](adr/0036-arca-electronic-invoicing-boundary.md).

**Estado:** implementación local con proveedor simulado. Sin datos fiscales reales, sin
homologación ejecutada, sin push.

## 1. Auditoría de la arquitectura actual

| Capa           | Estado                                                                                       | Para facturación                                                     |
| -------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Web            | React + Vite + TanStack Query; admin bajo `/admin/*` con `AdminLayout`                       | Se agregan páginas `/admin/invoicing/*` con el mismo patrón          |
| API            | Express `routes → controllers → services → Prisma`, Zod, `ApiError`, `authorize("ADMIN")`    | Rutas `/api/admin/invoicing/*`; reutiliza auth, validación y errores |
| Base           | PostgreSQL + Prisma, migraciones revisadas a mano (ADR-0014)                                 | Tablas nuevas, sin tocar las existentes                              |
| Fronteras      | `ShippingProvider` / `image-provider.service.ts`: un único punto mockeable, sin credenciales | Mismo patrón: `InvoicingProvider` con simulado y homologación        |
| Ventas/pedidos | **No existen** (Orders, carrito y Mercado Pago no iniciados)                                 | No hay módulo reutilizable: `Sale` propia, independiente de Orders   |
| Facturación    | **No existe**                                                                                | Módulo nuevo                                                         |
| Stock          | Por `ProductVariant`; nunca se reserva ni descuenta (ADR-0028)                               | La factura **no** toca stock; el ítem guarda una copia (nombre, SKU) |

Dependencias nuevas de la API: `node-forge` (firma CMS del TRA), `fast-xml-parser` (SOAP),
`pdfkit` (PDF) y `qrcode` (QR). No hay ninguna librería fiscal de terceros: el cliente SOAP es
propio, sobre la documentación oficial.

## 2. Documentación oficial consultada (2026-10-25)

| Documento                                                           | Datos usados                                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual WSFEv1, RG 4291 – Proyecto FE v4.8 (revisión del 01/12/2026) | URLs, `FECAESolicitar`, `FECompUltimoAutorizado`, `FECompConsultar`, `FEParamGet*`, error 602, error 10016 (correlatividad), anexo de condición frente al IVA del receptor, `CondicionIVAReceptorId` obligatorio desde la RG 5616 |
| Especificación técnica WSAA 1.2.2 y manual del desarrollador WSAA   | TRA, CMS `SignedData`, `loginCms`, TA de 12 h, `coe.alreadyAuthenticated`, sincronización de reloj, requisitos del certificado                                                                                                    |
| Especificación del QR (RG 4892/2020)                                | `https://www.arca.gob.ar/fe/qr/?p=<JSON en Base64>`, campos de la versión 1                                                                                                                                                       |

URLs de homologación (las únicas configuradas): `https://wsaahomo.afip.gov.ar/ws/services/LoginCms`
y `https://wswhomo.afip.gov.ar/wsfev1/service.asmx`. Las de producción no están en el código.

> El manual v4.8 tiene fecha de revisión 01/12/2026, posterior a hoy: es la versión publicada con
> anticipación por la entrada en vigencia del campo `CondicionIVAReceptorId`. Antes de homologar,
> volver a descargarlo y verificar que no cambió.

## 3. Modelos

| Modelo                               | Contenido                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FiscalIssuer` (emisor)              | CUIT, razón social, domicilio comercial, condición frente al IVA (`UNCONFIRMED` hasta confirmarla), ingresos brutos, inicio de actividades, mínimo para identificar consumidor final (sin valor por defecto), quién y cuándo confirmó |
| `FiscalPointOfSale` (punto de venta) | Número (1–99999), tipos de comprobante habilitados (códigos ARCA), activo                                                                                                                                                             |
| `Sale` (venta)                       | Receptor (tipo y número de documento, nombre, condición frente al IVA, domicilio), fecha, totales; independiente de Orders                                                                                                            |
| `SaleItem` (detalle)                 | Descripción, cantidad, precio unitario, código de IVA (solo A/B), subtotal; referencia opcional a la variante como copia (nombre y SKU), sin tocar el stock                                                                           |
| `FiscalDocument` (comprobante)       | Venta, punto de venta, tipo, número, estado, CAE, vencimiento del CAE, importes enviados, observaciones y errores de ARCA, intentos, clave de idempotencia, ambiente (`mock`/`homologacion`)                                          |
| `FiscalAuditEvent` (auditoría)       | Comprobante, acción, estado anterior → nuevo, usuario, códigos y mensajes de ARCA, sin tokens ni certificados                                                                                                                         |

Estados del comprobante: `DRAFT` → `SENDING` → `AUTHORIZED` | `REJECTED` | `UNCERTAIN` →
(consulta) `AUTHORIZED` | `DRAFT` (reenvío seguro) | `NEEDS_REVIEW`.

## 4. Flujo de emisión

1. El admin carga la venta y elige punto de venta y tipo (solo los habilitados para ese punto).
2. La API valida: emisor confirmado, tipo habilitado, condición del receptor compatible con la
   clase (anexo oficial), importes coherentes, código de IVA presente en A/B.
3. Marca el comprobante `SENDING` (índice único parcial: uno por punto de venta y tipo).
4. Consulta `FECompUltimoAutorizado`, guarda `número = último + 1` y envía `FECAESolicitar`.
5. Respuesta `A` → CAE; `R` → rechazo con los motivos de ARCA; sin respuesta → `UNCERTAIN`.
6. `UNCERTAIN` se resuelve con «Verificar en ARCA» (`FECompConsultar`), nunca reenviando a ciegas.
7. PDF con QR solo para comprobantes `AUTHORIZED`.

## 5. Panel administrativo

- **Facturación** (`/admin/invoicing`): lista de comprobantes con estado, tipo, número, receptor,
  total y CAE; filtro por estado.
- **Nuevo comprobante**: receptor, ítems, punto de venta y tipo habilitado; el botón «Emitir»
  muestra qué falta (por ejemplo «La condición fiscal del emisor no está confirmada»).
- **Detalle**: estado, CAE, vencimiento, observaciones de ARCA, historial; «Verificar en ARCA»
  para los inciertos; «Descargar PDF» para los autorizados.
- **Configuración fiscal**: emisor y puntos de venta, con el aviso de que la condición fiscal y
  los tipos habilitados los confirma el contador.

## 6. Riesgos

| Riesgo                                             | Mitigación                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Emitir con una condición fiscal o clase equivocada | Emisión bloqueada hasta confirmar; tipos habilitados explícitos; compatibilidad del anexo oficial       |
| Número duplicado o salteado                        | Número = último autorizado + 1; un solo comprobante en curso por secuencia; consulta ante incertidumbre |
| Respuesta perdida (timeout) y doble emisión        | Estado `UNCERTAIN` + `FECompConsultar` antes de cualquier reenvío                                       |
| Filtración del certificado o la clave privada      | Archivos fuera del repo, `.gitignore`, nunca en la base, logs ni respuestas                             |
| Emitir comprobantes reales por error               | Producción no configurada en el código; PDF marcado «SIN VALIDEZ FISCAL» en simulado y homologación     |
| Reloj del servidor desfasado (WSAA rechaza el TRA) | TRA con ventana de 10 min; error explicado; verificar NTP en el servidor                                |
| Cambios normativos (v4.8, RG 5616)                 | `CondicionIVAReceptorId` siempre enviado; parámetros consultados a ARCA, no fijos                       |
| Diseño legal del PDF incompleto                    | Pendiente de revisión del contador (RG 1415)                                                            |
| Varias instancias de la API                        | El TA vive en memoria por proceso; con más de una instancia habrá que compartirlo                       |

## 7. Preguntas pendientes (para Roberto y su contador)

1. ¿Cuál es la condición frente al IVA de la óptica (o de Roberto)? ¿Qué clases de comprobante
   corresponde emitir?
2. CUIT, razón social, domicilio comercial, ingresos brutos e inicio de actividades exactos.
3. ¿Hay un punto de venta habilitado para «Factura electrónica – Web Services»? ¿Cuál número?
4. Para A/B: ¿qué alícuota de IVA corresponde a armazones, cristales, accesorios y servicios?
5. ¿Desde qué monto hay que identificar al consumidor final? (lo define la normativa vigente).
6. ¿Se facturan servicios (concepto 2) o solo productos?
7. ¿Hacen falta notas de crédito para devoluciones desde el panel?
8. ¿Quién tramita el certificado de homologación en WSASS y lo asocia a `wsfe`?
9. ¿Qué datos legales y qué diseño debe tener el PDF?
