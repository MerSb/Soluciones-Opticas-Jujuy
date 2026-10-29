# Cristales & Configurador V1

Dominio de cristales (lentes) que complementan la compra de un armazón. Decisión de arquitectura:
[ADR-0023](adr/0023-lens-catalog-domain.md). Este documento es la referencia operativa.

> **Ficha pública (2026-10-29):** Roberto registra tipos de cristal **compatibles** con cada
> armazón; no se venden cristales graduados desde la tienda. La ficha muestra «Cristales
> compatibles» con los nombres de los tipos asociados (sin precios ni cotización) o «Compatibilidad
> por consultar» si no hay ninguno — nunca «incompatible». El configurador (`LensConfigurator`) y
> `GET …/quote` con cristal siguen en el código pero la ficha ya no los usa. Los precios siguen siendo
> obligatorios en `lens_types.base_price`: hacerlos opcionales requiere la migración propuesta en el
> informe (pendiente de autorización).

## Modelo

```
Product ──< ProductLensType >── LensType ──< LensOption          (variedades / tintes)
                                   └──< LensTypeTreatment >── LensTreatment
ProductVariant (armazón: color, SKU, stock, imágenes) — NO se usa para el cristal
```

| Entidad             | Qué es                                                | Campos clave                                                                    |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| `LensType`          | Línea de cristal (p. ej. HD, fotocromático, espectro) | `basePrice`, `supportsCustomGraduation`, `isFeatured`, `sortOrder`, `deletedAt` |
| `LensOption`        | Variedad/tinte de una línea (0..N)                    | `priceOverride?`, `stock?`, `swatchHex?`, `sortOrder`, `deletedAt`              |
| `LensTreatment`     | Tratamiento incluido (informativo)                    | `name`, `description`, `deletedAt`                                              |
| `LensTypeTreatment` | Qué tratamientos incluye cada línea                   | PK compuesta                                                                    |
| `ProductLensType`   | Compatibilidad explícita armazón ↔ línea              | PK compuesta                                                                    |

Slugs inmutables (ADR-0013). Todo el catálogo de cristales usa soft delete.

## Reglas de negocio

- **Precio del cristal** = `LensOption.priceOverride ?? LensType.basePrice`.
- **Precio de la configuración** = precio del armazón (`variant.priceOverride ?? product.basePrice`)
  \+ precio del cristal. Se suma con `Prisma.Decimal`; se serializa a `number` recién en el DTO.
- **Graduación personalizada** (`graduationMode: "CUSTOM"`): solo si el tipo tiene
  `supportsCustomGraduation`, requiere cristal, deriva `requiresOpticalConsultation = true`.
  **No modifica el precio en V1** y no guarda datos clínicos (sin esfera/cilindro/eje/prisma/DP,
  sin receta). La UI dice "a coordinar con la óptica"; nunca muestra `$0` ni "gratis".
- **Sin cristales** (`lens = null`) siempre es válido y obliga `graduationMode = "NONE"`.
- **Variedad obligatoria** si el tipo tiene variedades activas; prohibida si no tiene.
- **Stock de variedad**: `null` = no se controla (disponible), `0` = sin stock, `> 0` = disponible.
  Independiente de `ProductVariant.stock`. No se descuenta nada hasta Orders/Payments.
- **Compatibilidad**: la decide el admin por producto. No se infiere por categoría ni por variedad.
- **Tratamientos**: informativos e incluidos en la línea. No se compran ni se activan por separado.
- **Antirreflejo estándar** (confirmado por el cliente): el antirreflejo se comercializa como
  característica estándar/incluida, no como adicional seleccionable. Se representa como un
  `LensTreatment` "Antirreflejo" asociado a cada `LensType` que lo incluya; se muestra en "Incluye",
  sin precio propio, sin `priceDelta`, sin stock y sin efecto en el quote. No hay seed: el admin
  crea el tratamiento y lo asocia con los datos reales. No requirió cambios de modelo ni de código.
- **Promoción**: `isFeatured` resalta la línea. "N variedades disponibles" = cantidad real de
  variedades activas y disponibles (`availableOptionCount`), nunca un número fijo. Sin
  comparaciones con competidores.
- **Completitud y recomendaciones no cambian**: el cristal no participa en ninguna de las dos.

## API

| Método                | Ruta                                                                         | Uso                                                                        |
| --------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| GET                   | `/api/products/:slug`                                                        | Ahora incluye `lensTypes: PublicLensTypeDto[]` (vacío en productos legacy) |
| GET                   | `/api/products/:slug/quote?variantId&lensTypeId&lensOptionId&graduationMode` | Valida y cotiza. Público, idempotente, sin efectos                         |
| GET/POST              | `/api/admin/lens-types`                                                      | Listar / crear línea                                                       |
| GET/PATCH/DELETE      | `/api/admin/lens-types/:id`                                                  | Detalle / editar (incl. `treatmentIds`, reemplazo total) / soft delete     |
| POST                  | `/api/admin/lens-types/:id/restore`                                          | Restaurar                                                                  |
| POST                  | `/api/admin/lens-types/:id/options`                                          | Crear variedad                                                             |
| PATCH/DELETE          | `/api/admin/lens-types/:id/options/:optionId`                                | Editar / soft delete                                                       |
| POST                  | `/api/admin/lens-types/:id/options/:optionId/restore`                        | Restaurar variedad                                                         |
| GET/POST/PATCH/DELETE | `/api/admin/lens-treatments[/:id]`                                           | CRUD de tratamientos (+ `/:id/restore`)                                    |
| PUT                   | `/api/admin/products/:id/lens-types`                                         | Reemplaza el set de líneas compatibles (`{ lensTypeIds }`)                 |

El DTO público nunca expone `stock` crudo, `priceOverride`, `deletedAt` ni `sortOrder`.

### Quote — orden de validación (`resolveEyewearConfiguration`)

1. Producto público y completo → si no, 404.
2. La variante pertenece al producto → 400.
3. `lens = null` ⇒ `CUSTOM` rechazado (400).
4. Línea compatible con el producto y no eliminada → 400.
5. Variedad requerida/prohibida según la línea; debe pertenecer a ella y estar activa → 400.
6. Variedad sin stock → 409.
7. `CUSTOM` en línea que no lo admite → 400.

El stock del armazón no bloquea: se informa como `frame.inStock` (un producto completo con stock 0
sigue siendo público). Es el mismo servicio que deberá usar el futuro checkout: el precio que
llegue a Mercado Pago sale del backend, nunca del frontend.

## UX pública (Product Detail)

El configurador aparece solo si `lensTypes.length > 0`:
armazón (selector de variante existente) → cristales ("Sin cristales" o una línea) → variedad (si
corresponde) → graduación (si la línea la admite) → desglose Armazón / Cristales / [Graduación
personalizada — a coordinar con la óptica] / Total. El desglose sale del quote. El CTA sigue siendo
WhatsApp; el mensaje incluye producto, color, cristal, variedad y graduación personalizada.

## Admin

- **Cristales** (`/admin/lens-types`): alta, listado, detalle con datos, precio base, graduación
  personalizada, destacado, tratamientos incluidos y variedades (precio propio y stock opcionales).
- **Tratamientos** (`/admin/lens-treatments`): CRUD simple.
- **Producto → Cristales compatibles**: checkboxes con las líneas activas.

Un tipo/tratamiento eliminado puede quedar asociado donde ya estaba (se oculta en público), pero no
se puede asociar de nuevo.

## Migration

`20260913031740_add_lens_catalog`: 5 tablas nuevas, ninguna tabla existente alterada. Se quitó a
mano el `DROP INDEX "products_name_trgm_idx"` que Prisma propone siempre (ADR-0014) y se agregó a
mano `CHECK ("stock" IS NULL OR "stock" >= 0)` en `lens_options`. En staging/prod: `npm run
db:migrate:deploy` **antes** de desplegar la API; la web después (el campo `lensTypes` es aditivo y
la web tolera su ausencia).

## Datos

No hay seed de cristales: nombres, colores, precios y disponibilidad los carga el admin con datos
reales del cliente. Los tests usan nombres obviamente ficticios.

## Pendiente (fuera de V1)

- Decisiones comerciales: precios, líneas compatibles por producto, nombres/colores de la línea
  espectro, si hay stock o es a pedido, si la graduación personalizada tendrá costo.
- Carrito, Order/OrderItem (snapshot de nombres y precios, FKs `SetNull`), descuento de stock,
  Mercado Pago, envío, facturación.
- Tratamientos como adicionales pagos (`priceDelta` en `LensTypeTreatment`, cambio aditivo).
- Imagen por variedad (hoy solo `swatchHex`).

## Migración pendiente: precio opcional en los tipos de cristal (NO ejecutada)

Estado al 2026-10-29: **documentada, sin autorizar.** No se ejecutó y no se modificaron los tres
precios de $0,01 cargados en producción (Monofocal, Bifocales, Multifocales).

### Por qué

`lens_types.base_price` es `NOT NULL`: para registrar un tipo solo como compatibilidad hay que poner
un precio, y se cargó $0,01. La ficha pública ya no muestra precios de cristal (sección «Cristales
compatibles»), pero el dato ficticio sigue en la base y en la API.

### Migración (aditiva, sin cambiar datos)

```sql
-- prisma/migrations/<fecha>_lens_type_price_optional/migration.sql
ALTER TABLE "lens_types" ALTER COLUMN "base_price" DROP NOT NULL;
```

- Esquema: `basePrice Decimal? @map("base_price") @db.Decimal(10, 2)`.
- Las filas existentes conservan su valor; ningún `UPDATE`.
- Reversión: `ALTER TABLE "lens_types" ALTER COLUMN "base_price" SET NOT NULL;` (solo si no quedó
  ninguna fila en `NULL`).

### Código que depende de la columna (revisar todo en el mismo cambio)

| Lugar                                                        | Hoy                                                      | Con precio opcional                                                                                |
| ------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/api/src/schemas/admin-lens.schema.ts`                  | `basePrice` obligatorio al crear                         | Opcional / `null`                                                                                  |
| `apps/api/src/lib/lens-pricing.ts` (`effectiveLensPrice`)    | Siempre devuelve un precio                               | `Decimal \| null`                                                                                  |
| `apps/api/src/services/admin-lens-types.service.ts`          | DTO admin con `basePrice: number`                        | `number \| null`                                                                                   |
| `apps/api/src/services/lens-configuration.service.ts`        | `PublicLensTypeDto.price: number`; quote suma el cristal | `price: number \| null`; quote con un cristal sin precio responde «precio a consultar» (sin total) |
| `packages/shared/src/lens.ts`                                | `price: number`                                          | `number \| null` (contrato público: cambio compatible solo si la web lo tolera antes)              |
| `apps/web` admin de cristales                                | Precio requerido                                         | Campo opcional «Sin precio (solo compatibilidad)»                                                  |
| `apps/web/src/lib/lens-configuration.ts`, `LensConfigurator` | Suman el precio                                          | Hoy sin uso en la ficha; adaptar o eliminar                                                        |

### Orden de publicación sugerido

1. Web que tolera `price: null` (la ficha actual ya no muestra precios).
2. API + migración (Railway la aplica en `prisma migrate deploy`).
3. Pasar los tres $0,01 a `NULL`: **modificación de datos comerciales**, con respaldo cifrado
   previo y autorización explícita.
