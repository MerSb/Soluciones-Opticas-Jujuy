# Catálogo normalizado — formas, sinónimos y carga guiada

Rama `feature/catalogo-normalizado`, creada desde la versión publicada (`f24eefd`: A + pestañas). Sin
push, sin migraciones y sin escrituras en producción.

## 1. Diagnóstico (lectura de producción, 26/10/2026 20:44)

Auditoría de solo lectura (`BEGIN TRANSACTION READ ONLY`). El detalle por producto está en
`~/backups-privados/soluciones-opticas/auditoria-catalogo-20261026T2344Z.txt`, fuera del repo.

- 386 productos: 375 armazones (329 activos, 46 eliminados) y 11 accesorios.
- `Product.shape` es **texto libre**:
  - El formulario de alta ofrece 7 sugerencias, pero acepta cualquier texto.
  - El filtro público de forma también es un campo de texto y exige el texto exacto.
- El buscador publicado (A) compara solo similitud con el **nombre completo** (`p.name % q`). Es el
  error que hace que «trebol» no encuentre el producto.

### Formas cargadas (armazones)

| Valor actual                         |   Activos | Eliminados | Observación                                         |
| ------------------------------------ | --------: | ---------: | --------------------------------------------------- |
| Cat-eye                              |        96 |         10 | Oficial                                             |
| Rectangular                          |        79 |          7 | Oficial                                             |
| Cuadrado                             |        54 |         12 | Oficial                                             |
| Redondo                              |        30 |          5 | Oficial                                             |
| _(sin forma)_                        |        18 |          0 | 15 infantiles, 2 de sol, 1 recetado                 |
| Ovalado                              |        13 |          3 | Oficial                                             |
| Aviador                              |        13 |          4 | Oficial                                             |
| Gatito                               |         6 |          0 | Sinónimo de Cat-eye                                 |
| Hexagonal / Exagonal / exagonal      | 4 / 2 / 0 |  0 / 0 / 1 | Misma forma con otra ortografía                     |
| Envolvente                           |         3 |          0 | Oficial (deportivos)                                |
| Aviador cuadrado                     |         3 |          0 | Ambiguo (¿aviador o cuadrado?)                      |
| Cuadrado Redondeado                  |         2 |          1 | Ambiguo                                             |
| Aviador , ovalado · Redondo , Gatito |     1 · 1 |      0 · 1 | **Dos formas mezcladas**                            |
| Semi-Aviador · Semi Aviador          |     1 · 0 |      1 · 1 | Ambiguo                                             |
| Mariposa · Caravan · Rombo           | 1 · 1 · 1 |          0 | Mariposa oficial, Caravan ambiguo, Rombo geométrico |

- **Clip-on no está mezclado en la forma:** es una **categoría** («Anteojos Con Clip On», 10
  activos), y también aparece en 19 nombres. Polarizado aparece en 16 nombres y en la categoría
  «Anteojos de Sol Polarizados UV400» (con doble espacio).
- **Categorías:** Recetados 242 · Sol Polarizados 67 · Sol UV400 11 · Clip On 10 · Accesorios 9 ·
  Promociones 1. El tipo de producto y las características están mezclados en la categoría.
- **Colores** (variantes activas): 83 valores distintos, con diferencias de mayúsculas, tildes y
  ortografía (Negro/negro, Beige/beige/Baige, Marrón/Marron, Gris gun/Gris Gun, Rosa
  transparente/Rosa Transparente…).
- **Materiales:** 15 valores (Metal/metal, Plastico/plastico, «Acetato y metal»/«Acetato Metal»/
  «Metal y acetato», «Cuero Sinteto»/«Cuero sintetico»).
- **Estilos:** 81 armazones activos sin estilo.

### Posibles duplicados (sin modificar)

- **SKU que solo difieren en mayúsculas:**
  - `harry s10` / `Harry s10`: **los dos activos**, «Vulk Harry» cargado dos veces;
  - `ballad c6` (activo) / `Ballad c6` (eliminado);
  - `beating old gold` (activo) / `Beating Old Gold` (eliminado): **nuevo**.
- **30 nombres repetidos.** La mayoría parece el mismo modelo en distintos colores o SKU (7 «Anteojo
  Infantil Acetato OptitechKids», 4 «Gatito Rosa Metálico», 4 «Gatito Negro Metálico»…). Hay que
  revisarlos uno por uno.
- **7 armazones activos cuyo nombre contradice la forma cargada.** Por ejemplo, «Hexagonal Gris
  Metálico» cargado como Redondo, o «Semi aviador cuadrado ranurado» cargado como Rectangular. No se
  cambian: quedan para revisión.

## 2. Diccionario oficial propuesto

Cada producto tiene **una sola forma**, o ninguna («Sin clasificar / Requiere revisión»). Los
sinónimos solo ayudan a buscar y nunca crean opciones nuevas.

| Forma oficial | Sinónimos (búsqueda y normalización)         | Descripción breve                                           |
| ------------- | -------------------------------------------- | ----------------------------------------------------------- |
| Cat-eye       | gatito, gatita, ojo de gato, cat eye, cateye | Puntas superiores elevadas hacia afuera                     |
| Aviador       | aviator, piloto                              | Lente en forma de gota, doble puente frecuente              |
| Ovalado       | ovalada, oval, ovalados                      | Contorno curvo, más ancho que alto, sin esquinas            |
| Redondo       | redonda, redondos, circular, round           | Lente circular                                              |
| Cuadrado      | cuadrada, cuadrados, square                  | Alto y ancho parecidos, esquinas marcadas                   |
| Rectangular   | rectángulo, rectangulares, rectangle         | Más ancho que alto, líneas rectas                           |
| Mariposa      | butterfly                                    | Parte superior ancha que se angosta abajo; suele ser grande |
| Hexagonal     | exagonal, hexagonales, hexágono              | Seis lados visibles                                         |
| Geométrico    | geométrica, geometric, octogonal, rombo      | Otras formas poligonales (octogonal, rombo…)                |
| Envolvente    | wrap, wraparound                             | Curvado alrededor del rostro (deportivos)                   |

- **Hexagonal:** propongo forma propia, porque ya hay 6 activos y es una forma que el público busca.
  Octogonal y rombo entran en Geométrico mientras sean pocos.
- **Oversize no es una forma:** es tamaño, y queda como característica.
- **Semi-aviador, «Aviador cuadrado», Caravan y «Cuadrado redondeado»:** no los convierto en formas
  sin la decisión de Roberto. Hoy van a revisión manual.

**Separación de conceptos** (sin migración en esta etapa):

| Concepto          | Dónde vive hoy                                | Propuesta                                                                                                                                       |
| ----------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipo de producto  | `kind` (anteojo/accesorio) + categoría        | Sin cambio                                                                                                                                      |
| Forma del armazón | `shape` (texto libre)                         | **Solo los valores oficiales**, o vacío = sin clasificar                                                                                        |
| Características   | Categoría («Clip On», «Polarizados») y nombre | Se mantienen en la categoría. Un campo propio (clip-on, 2 en 1, polarizado, oversize) queda alineado con las etiquetas de B: decisión pendiente |
| Color y material  | Variante (texto libre)                        | Diagnóstico listo. La normalización queda para una segunda etapa, con la misma vista previa                                                     |
| Marca y modelo    | `brand` + nombre comercial                    | Ayudas en el formulario; **no se cambian nombres existentes**                                                                                   |

## 3. Normalizables con seguridad (reglas explícitas)

| Regla                                                     | Productos                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| «Gatito» → Cat-eye (sinónimo explícito)                   | 6 activos (VITA, Whynot ×2, Nakyma, Borsalino, Las Oreiro) |
| «Exagonal»/«exagonal» → Hexagonal (ortografía)            | 2 activos + 1 eliminado                                    |
| «Rombo» → Geométrico (sinónimo, si se aprueba Geométrico) | 1 activo (Vulk Villyts)                                    |

En total, **9 activos y 1 eliminado.** Ninguno se aplica sin aprobación explícita.

## 4. Revisión manual

- **18 activos sin forma.** No se infiere la forma por el nombre (15 son infantiles).
- **9 activos ambiguos:**
  - Aviador cuadrado ×3;
  - Cuadrado Redondeado ×2;
  - las combinaciones «Aviador , ovalado» y «Redondo , Gatito»;
  - Semi-Aviador;
  - Caravan.
- **7 activos cuyo nombre contradice la forma**, y los posibles duplicados de §1.

## 5. Arquitectura

- **Diccionario único en código:**
  - `apps/api/src/lib/frame-shapes.ts` y su copia para la interfaz en `apps/web/src/lib/frame-shapes.ts`;
  - el tipo compartido `OfficialFrameShape` (ADR-0015) asegura que las dos coincidan.
  - Normaliza el texto: minúsculas, sin tildes, guiones y espacios unificados.
- **API (sin migración):**
  - **Alta y edición:** aceptan solo formas oficiales o vacío. Un valor viejo que no se toca se
    guarda tal cual, aunque sea un sinónimo («Gatito»). Solo la normalización aprobada o una
    elección explícita lo cambian.
  - **Filtro `?shape=`:** reconoce sinónimos (`gatito` → Cat-eye) y encuentra también los valores
    aún no normalizados. La URL no cambia.
  - **`GET /api/products/shapes`:** formas oficiales con su cantidad de productos públicos.
  - **Buscador:**
    - incorpora el arreglo de B (`e988fc7`): cada palabra en nombre, marca, SKU o color, sin tildes;
    - le suma los sinónimos de forma: «ojo de gato», «gatito», «aviator»…
  - **`GET /api/admin/products/similar`:** posibles duplicados por nombre o por SKU sin distinguir
    mayúsculas. Solo avisa, nunca bloquea.
- **Normalización:** `apps/api/scripts/catalog-shapes.ts`, en dos pasos:
  1. `preview`: genera la vista previa (HTML + CSV) desde una base o desde la auditoría de lectura.
  2. `plan`: genera, desde las decisiones aprobadas, `aplicar.sql` (transaccional, con guardas: solo
     cambia `shape` si sigue teniendo el valor esperado, así que es idempotente), `revertir.sql` (el
     inverso, con la misma guarda) y `registro.json`.

  El SQL se lee antes de ejecutarlo. En la copia aislada se ejecuta con `psql`; en producción, solo
  con autorización.

## 6. Formulario guiado

- **Forma:** selector con las formas oficiales y «Sin clasificar / Requiere revisión». Al elegir,
  muestra la descripción y los sinónimos («También se dice: gatito, ojo de gato»). No hay opciones
  duplicadas.
- **Ayudas** para nombre comercial, marca, SKU, color y características (por ahora en la categoría),
  con ejemplos.
- **Antes de guardar,** avisa de posibles duplicados (mismo nombre o SKU sin distinguir
  mayúsculas), con enlace al producto existente, sin bloquear.
- **Se mantienen:** pestañas, borradores, primer color, fotos y stock. La edición del producto usa el
  mismo selector.

## 7. Vista previa de la normalización

Una tabla (HTML para leer, CSV para decidir) con estas columnas:

- producto e identificador;
- forma actual y forma propuesta;
- motivo;
- confianza (alta / revisión);
- estado (`pendiente`, `aprobado` o `rechazado`).

Todo empieza en `pendiente`. Se aprueba editando el CSV o con la opción explícita
`--aprobar-alta-confianza`. Las filas de revisión pueden aprobarse indicando la forma oficial
elegida.

**Hoja de revisión (`revision-roberto.html`):** la genera también `preview`, para quien decide.

- **Contenido:** una ficha por producto, con foto (`--nube <cloud name>`), lo que dice hoy y un
  consejo en palabras simples. Los casos especiales (Rombo, Caravan, Semi-aviador, Aviador cuadrado,
  Cuadrado redondeado, dos formas) tienen su propio consejo.
- **Secciones:**
  - mismo nombre escrito distinto (Sí / No);
  - formas que no están en la lista;
  - el nombre no coincide con la forma;
  - sin forma cargada.
- **Decisiones:** nada viene marcado. Cada producto se decide por separado; lo que no se marca queda
  `pendiente`. «Descargar decisiones» genera el `decisiones.csv` que lee `plan`.

## 8. Plan de pruebas y despliegue

- Pruebas de API y web: sinónimos, filtros, buscador, alta y edición, pestañas, duplicados, vista
  previa, aplicación, reversión y reejecución. También pruebas en navegador: escritorio, tablet y
  celular.
- **Ensayo** sobre una copia restaurada del respaldo más reciente, comparando antes y después
  (productos, variantes, SKU, precios, stock, fotos, usuarios): solo cambia `shape` en las filas
  aprobadas.
- **Resultado del ensayo (27/10/2026, copia del respaldo `20261027T000029Z`):**
  - `aplicar.sql` cambió 10 filas (las de confianza alta); repetirlo cambió 0.
  - De 3217 filas comparadas por huella, solo difieren esas 10 de `products`, y únicamente en
    `shape`.
  - El buscador, el filtro y `/api/products/shapes` de la rama respondieron bien sobre la copia. En
    el navegador (escritorio, tablet y celular) no hubo desborde horizontal, errores ni escrituras.
  - `revertir.sql` devolvió las 10 filas; las 3217 huellas quedaron idénticas a las originales.
    Repetirlo cambió 0.
- **Despliegue** (con autorización):
  1. Respaldo verificado.
  2. Push del código (sin migraciones).
  3. Control posterior.
  4. Recién después, el SQL de normalización aprobado, también con autorización.

## 9. Riesgos y decisiones pendientes

- **Roberto:**
  - aprobar los nombres oficiales;
  - si Hexagonal y Geométrico son formas propias;
  - qué hacer con Semi-aviador, «Aviador cuadrado», Caravan y «Cuadrado redondeado»;
  - la forma de los 18 sin clasificar.
- **Características como campo propio:** requiere migración; conviene alinearlo con las etiquetas de
  B.
- **Duplicados y SKU con mayúsculas:** decidir uno por uno. No se borra nada.
- **Colores y materiales:** normalizar en una segunda etapa.
- **La categoría «Anteojos de Sol Polarizados UV400» tiene doble espacio:** corregirla cambia un
  nombre visible y requiere aprobación.
- **El filtro de forma pasa de texto a selector:** las URLs viejas siguen funcionando gracias a los
  sinónimos.
