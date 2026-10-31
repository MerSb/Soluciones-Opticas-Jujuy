# Colores de la paleta

## Modelo

- `ProductVariant.color` (texto) sigue siendo el nombre que lee el cliente («Negro mate»,
  «Rosa añejo»). No se renombra ni se normaliza.
- `ProductVariant.colorTones` (`color_tones text[]`, migración `20261029001653`, aditiva): los
  tonos de la paleta de **esa pieza física**, el principal primero.
  - `["ROJO"]`: armazón rojo.
  - `["PLATEADO", "AZUL"]`: **una** pieza combinada (una variante, un SKU, un stock), con sus tonos
    reales en orden, el principal primero; su nombre es «Plateado y azul». Es el mismo formato que
    las combinaciones históricas («Rojo y negro»): el filtro la encuentra por cada uno de sus tonos,
    después de las piezas lisas, y el producto aparece una sola vez. Desde el 2026-10-31 es lo que
    guarda la opción «Combinado» del formulario (dos tonos o más; hasta 4).
  - `["COMBINADO"]`: lo guardó el formulario entre el 2026-10-30 y el 2026-10-31 (sin tonos; en el
    catálogo público no había ninguna el 2026-10-31). Se conserva y se sigue aceptando; tiene su
    círculo «Combinado» solo si existe alguna. Al «Cambiar» su color se eligen sus tonos reales.
    El formulario ya no lo genera.
  - Varios colores disponibles = varias variantes, una por color.
  - `[]` = todavía sin clasificar: la variante sigue visible en la tienda, con su texto, y no
    aparece en el filtro por círculos.
- Paleta (`apps/api/src/lib/color-tones.ts`), 18 colores más «Combinado»: negro, blanco, gris,
  plateado, dorado, marrón, beige, azul, celeste, verde, rojo, rosa, violeta, amarillo, naranja,
  carey, multicolor, transparente y combinado. La API acepta hasta 4 tonos por pieza, sin repetir;
  multicolor y combinado van solos. Celeste es un color aparte de azul: filtrar «Azul» no lo
  incluye.
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
- Celeste, amarillo y naranja (agregados el 2026-10-30) cuentan **solo** cuando el texto es
  exactamente ese nombre, sin distinguir mayúsculas ni espacios exteriores («Celeste»,
  « NARANJA »); nunca con terminación ni en combinación («Celeste mate», «Negro y naranja»).
  «Combinado» escrito como texto tampoco se reclasifica.
- Lo demás («Celeste mate», «Gris gun», «Animal print», «Baige», «Combinado») queda pendiente:
  sigue visible en el catálogo general, en su ficha y en `?color=`, pero no en los círculos hasta
  clasificarla.
  Estimación sobre el catálogo público del 2026-10-28: 563 de 668 variantes resueltas, 105
  pendientes.
- No hay relleno automático. `npx tsx scripts/catalog-colors.ts preview --salida <dir>`
  (en `apps/api`) solo lee y genera `colores-sugeridos.csv`, con cada decisión «pendiente».
- Estimación sobre el catálogo público del 2026-10-28 (668 variantes): 640 con sugerencia
  completa, 11 para revisar, 17 sin sugerencia («animal print», «sepia», «naranja»: fuera de la
  paleta, decide Roberto).
- Aplicar tonos: desde el admin, variante por variante, o con un script aparte, revisado y
  autorizado, con respaldo previo.

## Formulario de variantes (alta y edición)

Desde el 2026-10-30, crear un producto y agregar una variante en su ficha usan el mismo formulario
simple: **Color, Material, SKU y Stock**.

- **Color:** una sola paleta de puntitos con los 18 colores, «Combinado» y, al final, «Otro
  color…»; se elige **una** opción por variante (botones de opción). Elegir «Combinado» muestra
  una sola fila más, «Tonos de la pieza combinada» (17 tonos: la paleta sin multicolor ni
  combinado), donde se marcan dos o más en orden; con menos de dos no se puede agregar. No hay
  combinaciones fijas ni un color nuevo por cada combinación. «Otro color…» muestra solo el campo
  «Nombre del color»: se
  guarda ese nombre sin tonos (no se crea ningún catálogo ni se inventa una equivalencia; cuenta en
  los círculos solo si encaja en la equivalencia explícita de más arriba).
- **Accesorios:** la misma paleta suma «Rosado», el único nombre de la lista anterior de
  accesorios que no es un color de la paleta; se guarda como antes, por su nombre y sin tonos.
  Las presentaciones («Presentación», «Precio propio») siguen igual, y los colores ya cargados con
  otros nombres se muestran tal cual.
- **Material** (opcional), **SKU** (obligatorio, escrito a mano, nunca generado) y **Stock**
  (obligatorio, entero ≥ 0).
- Otro color = otra variante: se vuelve a usar el mismo formulario.
- Un armazón puede repetir un color (por ejemplo, negro de acetato y negro de metal): son dos
  variantes, cada una con su SKU, material, stock, precio y fotos. Un accesorio no repite colores
  (la API lo rechaza, como antes).

**Nuevo producto** (anteojos y accesorios; ver [ALTA_PRODUCTOS.md](ALTA_PRODUCTOS.md)), sección
«Colores, material, SKU y stock»: «Agregar variante» pasa lo cargado a la lista y vacía el
formulario; las fotos de cada variante se eligen en «Fotografías» (numeradas por clic). En la
lista se puede corregir material, SKU y stock, o quitarla. Un SKU repetido en la lista se rechaza;
mientras haya una variante a medio cargar, «Crear producto» pide agregarla o descartarla, para que
no se pierda. Las variantes se crean en un solo pedido atómico
(`POST …/variants/batch`, que ahora acepta `material`): si una falla, no se crea ninguna. Sin
variantes, el producto se crea solo, como antes. Los borradores anteriores (un color de texto,
piezas combinadas de varios tonos) se abren con sus filas tal cual y el material vacío.

**Ficha del producto:** las variantes cargadas y su «Corregir datos» van primero; «Agregar otro
color o variante» queda plegado (abierto si todavía no hay ninguna) y guarda con
`POST …/variants`. En accesorios suma «Presentación» y «Precio propio» (opcionales); una
presentación puede no tener color. «Cambiar» (color de la paleta de una variante existente) usa la
misma paleta y envía solo `colorTones`; una pieza de varios tonos abre como «Combinado» con sus
tonos marcados, y queda igual si no se cambia.

## Círculos en la tienda

- Tarjeta: cuando alguna variante coloreada no está clasificada, la tarjeta dibuja un círculo por
  nombre de color; un nombre que es exactamente un color de la paleta usa su círculo y los círculos
  idénticos se muestran una sola vez (el título y la etiqueta accesible listan todos los nombres).
- Tarjeta: un solo círculo por color, aunque varias variantes lo repitan.
- Ficha: variantes con el mismo nombre de color se muestran por separado, con una miniatura de su
  foto principal, su material (si lo tiene) y su SKU; ninguna se fusiona ni cambia.
