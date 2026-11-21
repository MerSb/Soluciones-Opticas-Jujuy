# Posibles variantes del mismo modelo (por SKU)

Pedido de Roberto (2026-11-21): reconocer los lentes del mismo modelo sin perder la unicidad de cada
SKU. **Fase 2a, implementada:** solo lectura y sugerencias. **Fase 2b (`model_code` confirmado):
pendiente** hasta que Roberto revise las sugerencias. Sin migraciones, sin cambios de esquema.

## Qué se encontró en el catálogo

Lectura del catálogo **público** (2026-11-21, 1187 productos y 1962 variantes; los productos sin fotos
no son públicos y no están incluidos):

- El diseño es «un producto = un modelo, una variante = un color con SKU único» (ADR-0004), pero en
  la práctica muchos modelos se cargaron como productos separados: 93 familias de código repartidas
  en 212 productos.
- 74 % de los SKU siguen «modelo + color» (`TJ8604 c3`, `95761-C1`, `H3533C616`, `H2772 Col605`),
  escritos de muchas formas.
- En 51 familias los precios difieren, y hay códigos compartidos por modelos distintos (p. ej.
  `TR86001` «Redondos» y «cuadrado»): **una regla por sufijo no alcanza para agrupar**.
- 27 posibles cargas duplicadas (mismo modelo y número de color en dos productos) y 15 productos con
  SKU de modelos distintos (errores de tipeo o modelos realmente distintos): para revisión manual.

## La regla (`apps/api/src/lib/model-code.ts`)

Código de modelo sugerido = lo que está antes del sufijo de color `c`/`col` + 1–3 dígitos, en
mayúsculas, sin espacios ni signos. Debe contener un dígito y tener 3+ caracteres. Un SKU fuera de ese
patrón no tiene código (no se adivina). Ejemplos: `H3533-COL616`, `H3533C616` y `h3533 c616` → `H3533`;
`H35331 C1` → `H35331` (otro código: **no** se mezcla con `H3533`).

## Qué hace el sistema (solo lectura)

- **Ficha del producto (admin), «Posibles variantes del mismo modelo»:** variantes de **otros**
  productos con el mismo código sugerido, con foto, SKU, nombre, color, precio, stock, si el producto
  está eliminado y qué difiere (otro nombre, otro precio, otra forma, otra marca). Marcado
  «Sugerencia sin confirmar». `GET /api/admin/products/:id/model-suggestions`.
- **Lista de productos (admin), «Buscar por SKU o código de modelo»:** por SKU completo (sin importar
  mayúsculas, espacios ni guiones), por código de modelo, y todavía por los números del SKU como antes.
  Orden: SKU exacto, mismo modelo (sugerido), mismos números, parcial.
  `GET /api/admin/products/sku-lookup` (el anterior `sku-search` sigue igual).

Nunca se cambia un SKU, precio, stock, foto ni producto; nada se agrupa ni se fusiona.

## Fase 2b (pendiente, requiere autorización)

Campo opcional `model_code` por variante (migración aditiva), confirmado por Roberto con un clic sobre
la sugerencia; sección pública «Otros colores de este modelo». Antes: revisión de los candidatos y
backup de producción.
