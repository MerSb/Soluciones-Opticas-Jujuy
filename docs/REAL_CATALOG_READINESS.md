# Real Catalog Readiness

What changed so the real Soluciones Ópticas admin can start loading their catalog — products,
variants, stock, images, brands, categories — without publishing incomplete products, losing data
on an accidental click, or hitting cryptic error messages. Built directly on top of Admin Catalog
Management (ADR-0021), Admin Dashboard V2, and the Cloudinary pipeline (ADR-0022). No schema
changes were needed for any of it.

## Product completeness — a new, additive concept

**A product is complete when it has at least one variant, and that variant (or any other) has at
least one image.** Nothing else — not stock, not measurements, not shape/style.

```ts
// apps/api/src/lib/product-completeness.ts
export const COMPLETE_PRODUCT_WHERE = {
  variants: { some: { images: { some: {} } } },
} satisfies Prisma.ProductWhereInput;

export function computeIsComplete(variants: { images: unknown[] }[]): boolean {
  return variants.some((variant) => variant.images.length > 0);
}
```

| Variantes | Imagen en alguna variante | Completo | Visible públicamente       |
| --------- | ------------------------- | -------- | -------------------------- |
| Ninguna   | —                         | No       | No                         |
| ≥ 1       | Ninguna                   | No       | No                         |
| ≥ 1       | ≥ 1, stock 0 en todas     | **Sí**   | **Sí** (marcado sin stock) |
| ≥ 1       | ≥ 1, alguna con stock     | **Sí**   | **Sí** (marcado con stock) |

### Completitud ≠ disponibilidad

Antes de este cambio no existía ningún filtro además de `deletedAt: null` — un producto recién
creado, con cero variantes, aparecía de inmediato en el catálogo público. Eso quedó resuelto, pero
deliberadamente **sin** atar la visibilidad al stock: un producto real puede estar perfectamente
cargado (variante + foto) y quedarse temporalmente sin stock — debe seguir siendo visible, solo
marcado como no disponible por la lógica ya existente (`computeInStock()`,
`apps/api/src/lib/product-availability.ts`, sin modificar). Mezclar ambos conceptos habría hecho
que reponer stock a cero borrara productos del catálogo, algo que el negocio explícitamente no
quiere.

No se creó ningún campo `draft`/`published` nuevo — la completitud se calcula al vuelo desde las
relaciones que ya existen (`variants`, `images`), nunca se persiste como un flag propio.

### Stock — confirmado por el negocio: se administra por variante

Decisión de negocio confirmada formalmente: **el stock real se controla por variante, no por
producto.**

```
Producto: ELEVE Roma
  Variante Negro         stock: 3
  Variante Habano        stock: 2
  Variante Transparente  stock: 0
```

- Cada variante representa un color/presentación concreto del producto (`ProductVariant.color`),
  y tiene su propio `stock` independiente de las demás variantes del mismo producto.
- `stock: 0` en una variante es un valor **válido**, no un error ni un estado transitorio — solo
  significa que esa variante puntual no tiene disponibilidad en este momento.
- `stock: 0` en **todas** las variantes de un producto **no** lo vuelve incompleto. Completitud
  (variante + imagen) y disponibilidad (`computeInStock()`) son dimensiones independientes — ver
  "Completitud ≠ disponibilidad" arriba. Un producto completo con stock 0 en todas sus variantes
  permanece visible en el catálogo público, solo marcado sin disponibilidad.
- No existe ni se necesita un campo de stock a nivel `Product` — el modelo actual
  (`ProductVariant.stock`, con su propio `CHECK (stock >= 0)`) ya representa exactamente esta
  decisión. **No requiere ningún cambio de schema ni migración.**

## Comportamiento público

Aplicado consistentemente a los cuatro puntos de entrada del catálogo público:

- **`GET /api/products`** (listado, `filterProducts`) y su variante con búsqueda
  (`searchProducts`, raw SQL/pg_trgm) — un producto incompleto nunca aparece, ni siquiera
  buscando su nombre exacto. La condición de completitud se agregó como un `EXISTS` estático (sin
  input de usuario, sin riesgo de inyección) al lado de la condición de typo-tolerance existente
  (`p.name % ${q}`), sin tocar la lógica de similitud ni el índice `pg_trgm`.
- **`GET /api/products/:slug`** (detalle) — un producto incompleto devuelve **404**, exactamente
  igual que uno que no existe. Nunca revela que existe como borrador.
- **`GET /api/products/:slug/related`** — si el producto solicitado es incompleto, 404 (no se
  puede pedir "relacionados de" algo que no es público). Los candidatos incompletos nunca
  aparecen como sugerencia de otro producto.
- **`GET /api/recommendations`** y **`GET /api/recommendations/:slug`** — mismo filtro aplicado al
  conjunto de candidatos del motor de recomendaciones; el endpoint individual 404s para un
  producto incompleto, igual que el detalle público.

El ADMIN sigue viendo y editando productos incompletos sin ninguna restricción nueva —
`/api/admin/products*` nunca aplicó este filtro.

## Comportamiento admin

- **`AdminProductsPage`**: la columna "Estado" ahora distingue tres casos, no dos: **Eliminado**
  (soft-deleted, sin cambios), **Activo** (no eliminado y completo) e **Incompleto** (no eliminado,
  pero sin variante o sin imagen — antes se mostraba como "Activo" igual, lo cual inducía a
  pensar que ya estaba listo).
- **`AdminProductDetailPage`**: la misma etiqueta "Incompleto" junto al nombre, más un texto de
  ayuda específico según qué falte exactamente:
  - Sin variante y sin imagen: _"Agregá una variante y al menos una imagen para publicar el
    producto."_
  - Sin variante (con imagen, caso raro pero posible si se borran todas las variantes con
    imagen): _"Agregá al menos una variante para que el producto pueda mostrarse."_
  - Con variante, sin imagen: _"Agregá al menos una imagen para que el producto pueda
    mostrarse."_

El DTO (`AdminProductListItem`/`AdminProductDetail`) gana un campo `isComplete: boolean`,
calculado en el backend con la misma función/filtro que el catálogo público — nunca recalculado
de forma distinta en el frontend.

## Confirmaciones destructivas

Antes, **ningún** delete del panel admin pedía confirmación — un solo click bastaba para borrar
un producto, una marca, una categoría, una variante o una imagen. Se agregó `window.confirm()`
antes de los cinco:

- **Producto** / **Marca** / **Categoría**: soft-delete, reversible — el mensaje lo aclara ("Vas a
  poder restaurarlo/a después.").
- **Variante**: hard delete, irreversible. El mensaje distingue si tiene imágenes cargadas o no:
  - Con imágenes: _"Esta variante tiene N imagen(es) cargada(s). Al eliminarla también se
    eliminarán sus imágenes y stock. Esta acción no se puede deshacer."_
  - Sin imágenes: _"Al eliminar esta variante también se eliminará su información de stock. Esta
    acción no se puede deshacer."_
  - Nunca menciona Cloudinary ni ningún detalle técnico del proveedor.
- **Imagen**: hard delete, irreversible — _"¿Eliminar esta imagen? Esta acción no se puede
  deshacer."_

No se construyó ningún sistema de modales — `window.confirm()` alcanza para este alcance, tal
como se pidió explícitamente no sobre-construir acá.

## deleteVariant + limpieza de Cloudinary

**Bug real corregido**: borrar una variante eliminaba la fila en Postgres (y sus `ProductImage`
por cascade), pero nunca avisaba a Cloudinary — las fotos quedaban huérfanas en el proveedor para
siempre.

### Estrategia final

```ts
export async function deleteVariant(productId: string, variantId: string): Promise<void> {
  const variant = await requireVariantOfProduct(productId, variantId);

  for (const image of variant.images) {
    await imageProvider.deleteRemoteAsset(image.cloudinaryPublicId);
  }

  await prisma.productVariant.delete({ where: { id: variantId } });
}
```

Reutiliza `imageProvider.deleteRemoteAsset()` (el mismo usado por el delete de imagen individual)
— nunca se llama a Cloudinary directamente desde el service. Cada imagen se borra **en
secuencia**, no en paralelo (`Promise.all`): la primera falla detiene el loop inmediatamente, sin
intentar las siguientes.

### Semántica ante fallo (documentada explícitamente, no oculta)

No existe una transacción distribuida real entre Cloudinary y Postgres, y esta implementación no
inventa una. La regla elegida:

- **Si el primer (o único) borrado remoto falla**: la variante y todas sus imágenes quedan
  **intactas** en la base. Respuesta de error (502, desde `deleteRemoteAsset`). Reintentable sin
  riesgo — `deleteRemoteAsset` es idempotente (un asset ya borrado responde "not found", tratado
  como éxito).
- **Fallo parcial (2+ imágenes, la primera se borra remotamente, la segunda falla)**: el loop se
  detiene ahí mismo. La variante y **ambas** imágenes siguen en la base — la primera ya no existe
  en Cloudinary pero su fila persiste hasta el reintento. Este es el único hueco real, y queda
  documentado explícitamente (no oculto): es preferible a la alternativa de borrar la variante
  igual y perder la referencia a lo que falta limpiar. Un reintento retoma exactamente donde
  quedó, gracias a la idempotencia.
- **Si el delete de la variante en DB falla después de que Cloudinary ya confirmó todo**: se
  loguea como `CRITICAL` (mismo patrón ya usado por el delete de imagen individual) — nunca se
  oculta silenciosamente.

Cubierto por 5 tests nuevos (`apps/api/test/admin/products.test.ts`, describe "variant delete —
cloudinary cleanup"): sin imágenes, una imagen, múltiples imágenes, fallo del proveedor, y fallo
parcial con verificación explícita de que ninguna fila se pierde de la base.

## Errores de validación

**Antes**: cualquier fallo de validación (Zod) devolvía el mismo string fijo — `"Invalid request
body."` (o `"Invalid query parameters."`/`"Invalid route parameters."`) — técnico, en inglés,
inútil para saber qué corregir.

**Ahora** (`apps/api/src/lib/validation-messages.ts`): se traduce el primer error de Zod a una
frase corta y específica en español, usando solo la estructura del error (código, campo, límites)
— nunca el texto interno de Zod. Ejemplos reales, verificados por test:

- `"El precio debe ser mayor que 0."`
- `"El stock no puede ser negativo."`
- `"La medida debe ser mayor que 0."` / `"La medida debe ser menor o igual a 500."`
- `"El nombre no puede estar vacío."`

Un diccionario de ~25 nombres de campo conocidos (precio, stock, SKU, marca, categoría, medida,
color, material, etc.) traduce cuál es el campo; lo no reconocido cae a un mensaje genérico seguro
("Revisá los datos ingresados e intentá de nuevo."), nunca al texto crudo de Zod. El detalle
completo (`result.error.flatten()`) se sigue adjuntando como `details` en la respuesta — sin
cambiar la forma del error, solo el contenido de `message`. Esto mejora **todos** los endpoints
que usan `validateBody`/`validateQuery`/`validateParams` (toda la API), no solo el catálogo admin.

## Cambios UX menores

- **Precio**: el input ya no sugiere que 0 es válido (`min="0"` → `min="0.01"`, ambos formularios
  de producto) — el backend siempre exigió `> 0`.
- **Medidas**: cada label ahora dice la unidad explícitamente (`"Ancho del lente (mm)"`, etc., en
  vez de solo mencionar "mm" una vez en el título de la sección) + un texto de ayuda: _"Estas
  medidas suelen estar impresas en la parte interna de la patilla del armazón."_
- **Stock silencioso**: `VariantCard` nunca mostraba el error de `updateVariant` — un fallo al
  guardar stock (ej. un valor negativo que el backend rechaza) pasaba completamente inadvertido.
  Ahora se muestra un `role="alert"` visible cerca del botón, el valor tipeado nunca se borra, y
  el botón "Guardar stock" queda habilitado de nuevo automáticamente (mismo mecanismo que ya
  existía) — reintentar es simplemente volver a hacer click.

## Color / shape / material — normalización de filtros públicos (deuda documentada, no implementada)

Auditado y **deliberadamente no implementado en este milestone**, tal como se autorizó. Los tres
campos siguen siendo texto libre, sin enum, sin cambio de schema — "Negro"/"negro"/"NEGRO" pueden
seguir quedando almacenados de forma distinta, y el filtro público (`?color=`/`?material=`) sigue
haciendo coincidencia exacta de string, tanto en el camino sin búsqueda (Prisma) como en el
raw-SQL de `pg_trgm`.

Se descartó normalizar el filtro en este milestone porque el camino más seguro (una comparación
insensible a mayúsculas, `mode: "insensitive"` en Prisma / `ILIKE` en el SQL crudo) igual
requeriría tocar **dos** mecanismos de query distintos a la vez (el query builder y el raw SQL de
`pg_trgm`) con el riesgo explícitamente señalado de afectar el índice de trigram/typo-tolerance —
más alcance del que este milestone debía cubrir. El motor de recomendaciones ya no sufre este
problema (`normalizeColor`/`normalizeShape`/`normalizeMaterial` ya normalizan con tolerancia a
mayúsculas/acentos/sinónimos para el scoring, sin tocar los valores almacenados) — el hueco real
es específicamente el filtro del catálogo público.

**Recomendación para un milestone futuro**: aplicar `mode: "insensitive"` al filtro Prisma y
`LOWER(v.color) = LOWER(${query.color})` (o `ILIKE`) al raw SQL, verificado con un test que
confirme que el plan de consulta sigue usando el índice `pg_trgm` para la búsqueda por nombre. No
se toca "Negro mate" vs. "Negro brillante" (son productos genuinamente distintos) — solo
mayúsculas/acentos del mismo valor.

## Datos demo

Sin cambios en este milestone — no se ejecutó ningún seed, no se tocó la base de staging, no se
creó ningún script de limpieza. Se reconfirma lo ya documentado:

- `prisma/seed.ts` (solo desarrollo local): cada marca lleva `"Marca de desarrollo — datos
ficticios para pruebas locales."` en su `description`.
- `prisma/seed-staging.ts`: todo lo ficticio (marcas, productos, texto alternativo de imágenes)
  lleva el prefijo literal `"[DEMO] "` en el nombre — visible en la UI real, no solo en
  comentarios. Es el marcador deliberado para reconocer datos ficticios de staging.
- **Categorías confirmadas por el negocio**: "Promociones", "Anteojos de Sol", "Anteojos
  Recetados" y "Deportivos" son las cuatro categorías del catálogo real, confirmadas
  formalmente por el cliente. Ya no son una duda ni un pendiente de negocio. Existen en
  `seed-staging.ts` sin el prefijo `[DEMO]` precisamente porque no son ficticias — son
  categorías reales, a diferencia de las marcas/productos de esa misma semilla. No se insertó
  nada nuevo ni se ejecutó ningún seed para confirmar esto — es una actualización de
  documentación únicamente.

## Admin del cliente

Sin cambios. `scripts/promote-to-admin.mjs` no se ejecutó, no se creó ningún usuario, no se tocó
`auth`. Ese paso queda para después de aprobar este milestone, tal como se indicó.

## Tests agregados

**Backend** (231 tests en total tras este milestone):

- `apps/api/test/product-completeness.test.ts` (13 tests, nuevo): la matriz completa (sin
  variantes / variante sin imagen / completo sin stock / completo con stock) contra detalle por
  slug, más verificación de que la misma regla aplica a listado, búsqueda (`?q=`), relacionados, y
  recomendaciones (lista e individual) — sin duplicar la matriz completa en cada endpoint,
  siguiendo la instrucción de probar la regla a fondo una vez y confirmar la integración en cada
  uno.
- `apps/api/test/admin/products.test.ts`, describe "variant delete — cloudinary cleanup" (5 tests
  nuevos): sin imágenes, una imagen, múltiples imágenes, fallo del proveedor, fallo parcial.
- `apps/api/test/validation-messages.test.ts` (5 tests, nuevo): mensajes específicos para
  precio/stock/medida/nombre inválidos, verificación de que no aparece ningún texto interno
  (Zod/Prisma/stack), y que el detalle programático sigue disponible en `details`.
- Dos regresiones existentes (`admin/products.test.ts`) ajustadas: creaban productos sin imagen
  para probar el re-ranking del motor de recomendaciones — ahora, correctamente, esos productos
  necesitan ser completos para aparecer, así que se les agregó una imagen mínima.

**Frontend** (184 tests en total tras este milestone):

- `apps/web/test/admin-products-page.test.tsx` (3 tests, nuevo): Activo / Incompleto / Eliminado.
- `apps/web/test/admin-product-detail-page.test.tsx` (7 tests, nuevo): badge, los tres textos de
  ayuda, atributo `min` del precio, labels de medidas con "(mm)", confirmación de delete
  (cancelar y confirmar).
- `apps/web/test/admin-variants-editor.test.tsx` (7 tests, nuevo): confirmación de delete de
  variante (cancelar/confirmar), mensaje exacto según cantidad de imágenes, confirmación de
  delete de imagen, error de stock visible con el valor tipeado preservado, botón de reintento
  habilitado.
- `apps/web/test/admin-brands-page.test.tsx` / `admin-categories-page.test.tsx`: un test de
  confirmación de delete agregado a cada uno.

## Deuda preexistente — no tocada en este milestone

Sin cambios respecto a lo ya documentado en `docs/ADMIN_DASHBOARD_V2.md`: limpieza de fixtures
admin por nombre mutable (`brands/categories/products.test.ts`), y el flake preexistente de
concurrencia entre archivos de test (`related-products.test.ts`/`recommendations.test.ts` vs.
`admin/products.test.ts`). Tampoco se tocó: historial de precio, reordenamiento de imágenes,
límite de tamaño de archivo enforced en Cloudinary, nuevos roles, ni un sistema draft/published
persistente — todo explícitamente fuera de alcance. La confirmación definitiva de categorías
(Promociones, Anteojos de Sol, Anteojos Recetados, Deportivos) ya **no** es una duda de negocio
pendiente — ver "Datos demo" arriba.
