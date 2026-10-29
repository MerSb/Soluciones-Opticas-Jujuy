# Colores de la paleta

## Modelo

- `ProductVariant.color` (texto) sigue siendo el nombre que lee el cliente («Negro mate»,
  «Rosa añejo»). No se renombra ni se normaliza.
- `ProductVariant.colorTones` (`color_tones text[]`, migración `20261029001653`, aditiva): los
  tonos de la paleta de **esa pieza física**, el principal primero.
  - `["ROJO"]`: armazón rojo. `["ROJO", "NEGRO"]`: **un** armazón de dos tonos (no dos variantes).
  - Varios colores disponibles = varias variantes, una por color.
  - `[]` = todavía sin clasificar: la variante sigue visible en la tienda, con su texto, y no
    aparece en el filtro por círculos.
- Paleta (`apps/api/src/lib/color-tones.ts`): negro, blanco, gris, plateado, dorado, marrón, beige,
  azul, verde, rojo, rosa, violeta, carey, multicolor y transparente. Hasta 4 tonos por pieza, sin
  repetir; multicolor va solo.
- Transparente junto a otro tono es una terminación: `["ROSA", "TRANSPARENTE"]` cuenta como rosa
  pura. Solo, es un color.

## Filtro del catálogo

`GET /api/products?colors=rojo,negro` (OR entre los colores elegidos):

1. Primero, los productos con alguna variante **pura** de un color elegido.
2. Después, los que solo tienen piezas combinadas que incluyen un color elegido.
3. Nada sin ninguno de los colores. Cada producto aparece una sola vez.
4. Dentro de cada grupo, el orden elegido del catálogo (más nuevos por defecto, o relevancia
   con búsqueda).

`?color=<texto>` (coincidencia exacta del texto) se mantiene por los enlaces ya compartidos.
`GET /api/products/colors` da los tonos con productos públicos y su cantidad.

## Transición de las variantes ya cargadas

- **Equivalencia explícita, sin escribir nada:** una variante sin tonos cuenta en los círculos solo
  si su texto completo es exactamente un color de la paleta («Negro», «café»), un color más una
  terminación de una lista cerrada («Negro mate», «Rosa transparente») o «A y B» con dos colores
  de la paleta («Negro y dorado»). Se calcula en cada consulta (`legacyTones`); nunca se guarda.
  Lo demás («Celeste», «Gris gun», «Animal print», «Baige») queda pendiente: sigue visible en el
  catálogo general, en su ficha y en `?color=`, pero no en los círculos hasta clasificarla.
  Estimación sobre el catálogo público del 2026-10-28: 563 de 668 variantes resueltas, 105
  pendientes.
- No hay relleno automático. `npx tsx scripts/catalog-colors.ts preview --salida <dir>`
  (en `apps/api`) solo lee y genera `colores-sugeridos.csv`, con cada decisión «pendiente».
- Estimación sobre el catálogo público del 2026-10-28 (668 variantes): 640 con sugerencia
  completa, 11 para revisar, 17 sin sugerencia («animal print», «sepia», «naranja»: fuera de la
  paleta, decide Roberto).
- Aplicar tonos: desde el admin, variante por variante, o con un script aparte, revisado y
  autorizado, con respaldo previo.
