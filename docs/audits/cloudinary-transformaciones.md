# Cloudinary: diagnóstico de transformaciones y propuesta de reducción — 2026-11-02

Diagnóstico **de solo lectura** sobre el estado de producción (`241facf`). No se pidió ninguna URL de
imagen a Cloudinary: las mediciones en navegador interceptan cada pedido a `res.cloudinary.com` y lo
responden localmente, y las consultas a Cloudinary fueron de metadatos (Admin API). No se borró,
movió ni sobrescribió nada. **No hay nada implementado:** la propuesta espera autorización.

Complementa [cloudinary-almacenamiento-2026-11-02.md](cloudinary-almacenamiento-2026-11-02.md).

## 1. Causa probable del consumo

- **Cada subida cuenta como una transformación**, además de cada derivado nuevo (documentación
  oficial, "transformation counts"). La carga masiva de octubre subió ~5.500 fotos: **≈ 5.500
  transformaciones solo por subir**.
- **Cada foto genera además 2 o 3 derivados** al verse: la muestra de 60 fotos reales da 3,0 por
  foto principal y 1,9 por foto de galería (149 derivados). El que aparece en casi todas
  (56 de 60) es la **miniatura del administrador** (`w_160`), generada al revisar cada foto
  después de subirla.
- **`f_auto` multiplica por formato:** el mismo ancho se genera aparte en JPEG XL (Safari, el
  formato del 70 % de los derivados de la muestra: es el navegador de quien carga), WebP (Chrome y
  Android) y JPG (clientes que no anuncian formatos modernos, típicamente bots).
- Suma: ~5.500 subidas + ~11.000 derivados ≈ los **16.229** que informa la cuenta (17.893 con el
  resto del período). Las transformaciones por día (1.595 a 2.557 entre el 26 y el 30 de octubre,
  9 el 1 de noviembre) siguen la carga, no el tráfico.

**La variedad de URL pesa poco; pesa la cantidad de fotos.** Con el historial real, consolidar
anchos habría ahorrado **≈ 9 %** de los derivados.

## 2. Período y restricciones del plan Free (documentación oficial)

- 25 créditos; 1 crédito = 1.000 transformaciones = 1 GB de almacenamiento = 1 GB de ancho de banda.
- **Transformaciones y ancho de banda: ventana móvil de 30 días** (no mes calendario).
  **Almacenamiento: foto del momento**, no se acumula por período.
- Al superar el límite: avisos por correo, después pedidos de pasar de plan y, si no se hace nada,
  **la cuenta se desactiva** (subir y **entregar** imágenes). Cloudinary aclara que no lo hace de
  inmediato ni sin aviso, y no detalla el plazo.
- Para esta cuenta: las ~16.000 transformaciones del 22 al 31 de octubre **salen de la ventana entre
  el 21 y el 30 de noviembre**. Hasta entonces sigue por encima del 100 %. Después, el piso fijo es
  el almacenamiento (≈ 7,2 créditos, y crece con cada foto) más el ancho de banda (≈ 0,4).

## 3. Inventario de transformaciones actuales

Todas las URL salen de `apps/web/src/lib/cloudinary.ts` (ningún componente arma URL a mano):

| Contexto                                 | Componente                                 | Anchos (`f_auto,q_auto,w_N`) | `sizes`             |
| ---------------------------------------- | ------------------------------------------ | ---------------------------- | ------------------- |
| Tarjeta de catálogo y relacionados       | `ProductCard` → `ProductImage`             | 320, 480, 640                | 100vw / 50vw / 33vw |
| Foto principal de la ficha               | `ProductGallery` → `ProductImageZoom`      | 480, 800, 1200               | 100vw / 50vw        |
| Miniaturas de la ficha                   | `ProductGallery`                           | 64, 128                      | sin `sizes`         |
| Selector de colores repetidos            | `VariantSelector`                          | 64 (URL única)               | —                   |
| Zoom (lupa y vista ampliada)             | `ProductImageZoom`, `ProductImageLightbox` | `c_limit,w_2000`             | solo al usarlo      |
| Miniaturas del administrador             | `AdminVariantImagesEditor`                 | 96, 160                      | sin `sizes`         |
| `og:image` y datos estructurados JSON-LD | `ProductDetailPage`                        | 1200, **todas las fotos**    | —                   |

Son **10 cadenas distintas** por foto, cada una hasta en 3 formatos. Los parámetros son fijos: no hay
anchos calculados en tiempo de ejecución, ni DPR, ni versiones en la URL, y el orden de parámetros es
siempre el mismo. Una misma imagen con la misma cadena siempre da la misma URL (la caché del CDN y
del navegador se reutiliza).

**Medición en navegador** ([`medir_urls.py`](cloudinary-transformaciones/medir_urls.py), línea base
en [`linea-base-urls.json`](cloudinary-transformaciones/linea-base-urls.json)): catálogo, accesorios,
ficha (cambiando variante y miniatura, y pasando el mouse para el zoom) y ficha del administrador, a
1280 px con densidad 2 y a 360 px con densidad 3. Resultado: **0 imágenes rotas** y solo 5 cadenas
usadas: `w_640` (tarjetas), `w_1200` (foto principal), `w_128` (miniaturas), `w_160` (admin) y el
zoom. **Nunca se pidieron** 64, 96, 320, 480 ni 800 en pantallas actuales; se usan en pantallas de
densidad 1 o por bots.

Detalles:

- Las miniaturas no tienen `sizes`: el navegador asume el ancho de la pantalla y elige siempre la
  mayor (128 en la ficha, 160 en el admin). Por eso 64 y 96 casi no existen. Es más barato dejarlas
  así que agregar `sizes` (habría más variedad).
- El JSON-LD lista **cada foto de cada variante** en `w_1200`. Los buscadores pueden pedirlas todas,
  aunque ninguna persona las vea: hasta ~4.200 fotos de galería en 1200 px por formato, latentes.
- Carga diferida: las tarjetas son `lazy` (salvo la primera, prioritaria) y la foto principal es
  `eager`; las miniaturas, `lazy`. Correcto.

## 4. Qué se puede consolidar (sin crear cadenas nuevas)

Para no regenerar derivados de las 5.543 fotos existentes, la propuesta **solo usa cadenas que ya
existen**: no aparece ningún derivado nuevo por cambiar la URL de una foto vieja, solo deja de haber
variantes.

| Contexto               | Hoy              | Propuesta                                 | Por qué                                                                |
| ---------------------- | ---------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| Miniaturas de la ficha | 64, 128          | **160**                                   | Misma cadena que el admin, que ya existe para ~93 % de fotos           |
| Selector de colores    | 64               | **160**                                   | Ídem                                                                   |
| Miniaturas del admin   | 96, 160          | **160**                                   | 96 nunca se usa                                                        |
| Tarjeta                | 320, 480, 640    | **480, 640**                              | 320 solo lo piden pantallas pequeñas de densidad 1 y bots              |
| Foto principal         | 480, 800, 1200   | **640, 1200**                             | Reutiliza el 640 de la tarjeta (la foto principal es la de la tarjeta) |
| Zoom                   | `c_limit,w_2000` | igual                                     | Detalle real para una óptica                                           |
| `og:image`             | 1200 (principal) | igual                                     | —                                                                      |
| JSON-LD                | 1200, todas      | **1200, una por variante (la principal)** | Evita que los bots generen la galería entera                           |

De 10 cadenas a **5** (160, 480, 640, 1200 y el zoom). No se toca ningún `public_id`, ni la base,
ni Cloudinary.

**Descartado por ahora:** fijar un solo formato (`f_webp` en vez de `f_auto`). Reduciría formatos,
pero cambia la cadena de **todas** las fotos (regeneración masiva) y hoy un solo navegador domina.
Solo tendría sentido para fotos nuevas, con una marca por foto, lo que implica un cambio de API.

## 5. Comprimir y redimensionar en el navegador (solo fotos nuevas)

Hoy cada foto se guarda tal cual: promedio 1,25 MB, hasta 9248 × 6944 px (64 MP, 7,5 MB). La
mayoría (4.684 de 5.543) ya mide 1600 px o menos, pero con JPEG de calidad muy alta (≈ 420 KB/MP).

Propuesta: antes de subir, en el navegador, **lado mayor máximo 2400 px** (por encima del zoom de
2000 px, así que la lupa no pierde detalle) y **JPEG de calidad 0,88**, respetando la orientación
EXIF. Se guarda el original si el resultado no es más chico. Si la foto tiene transparencia, se
redimensiona como PNG. Si algo falla, se sube el original (nunca bloquea). Como efecto lateral, se
quitan los metadatos EXIF (incluida la ubicación GPS).

Estimación sobre la distribución real (supuestos de compresión entre 200 y 300 KB/MP):

| Escenario                 | Por foto        | Contra hoy      |
| ------------------------- | --------------- | --------------- |
| Solo redimensionar a 2400 | ~1,1 MB         | −10 a −16 %     |
| 2400 px + JPEG 0,88       | **0,6–0,85 MB** | **−32 a −55 %** |

Ahorra **almacenamiento** (créditos que quedan para siempre) y tiempo de subida. **No reduce
transformaciones:** la subida sigue contando 1 y los derivados son los mismos. Las cifras son
estimaciones: hay que medirlas con fotos reales de Roberto antes de decidir la calidad.

## 6. Ahorro futuro estimado y limitaciones

Por foto nueva, hoy: 1 (subida) + ~2,2 derivados ≈ **3,2 transformaciones** y 1,25 MB.

| Medida                        | Transformaciones por foto nueva                                   | Almacenamiento por foto |
| ----------------------------- | ----------------------------------------------------------------- | ----------------------- |
| Consolidar anchos             | −0,2 a −0,3 (≈ −9 %)                                              | —                       |
| JSON-LD solo con la principal | evita hasta ~+0,8 por foto de galería cuando los bots la recorren | —                       |
| Redimensionar y comprimir     | —                                                                 | −32 a −55 %             |

Limitaciones:

- La mayor parte del costo (la subida y la miniatura del admin) **no desaparece**: es una por foto.
  La palanca más grande es cuántas fotos se suben; cada copia de la misma foto en otro producto (hay 282) también se paga entera.
- La muestra es de 60 fotos y de un mes con poco tráfico. Con más visitas y navegadores distintos,
  la variedad de cadenas pesaría más y la consolidación ahorraría más.
- Cuánto ahorra la compresión depende de las fotos reales.

Con el plan Free, una vez fuera de la ventana lo de octubre, quedarían ~17 créditos por 30 días
para lo nuevo. Eso son **≈ 3.000 a 4.000 fotos nuevas por mes** hoy, algo más con la compresión. El
almacenamiento crece de forma permanente: unas 20.000 fotos con el tamaño actual (≈ 40.000
comprimidas) agotarían el plan solo con almacenamiento.

## 7. Riesgos para la calidad y la caché

- **Consolidación:** algunos dispositivos pasan a descargar un ancho un poco mayor (por ejemplo, una
  tarjeta de 320 a 480). La calidad mejora o queda igual; el costo es un poco más de ancho de banda,
  que es el concepto más barato. Ninguna foto se ve con menos resolución que hoy en pantallas de
  densidad 2 o 3.
- **Derivados nuevos transitorios:** un navegador que antes pedía `w_128` y ahora pide `w_160`
  genera ese derivado la primera vez, si no existe en su formato. Para JPEG XL ya existe en ~93 % de
  las fotos (lo generó el admin); en WebP no. Es un costo por visita, no masivo.
- **Caché:** las URL siguen siendo estables y sin versión, así que la caché del CDN y del navegador
  sigue sirviendo. Las cadenas que dejan de usarse quedan almacenadas (no se borran) y no molestan.
- **Compresión:** con calidad 0,88 y 2400 px el resultado es visualmente equivalente para catálogo y
  zoom; los riesgos son el color (perfil ICC), la orientación y las fotos con transparencia, que hay
  que cubrir con pruebas. Las fotos existentes no cambian.
- **SEO:** el JSON-LD con una foto por variante sigue siendo válido (Google acepta una o varias); la
  página sigue mostrando todas.

## 8. Implementación propuesta por etapas (nada ejecutado)

0. **Ahora, sin código:** revisar en la consola de Cloudinary si llegaron avisos y decidir el plan
   (ver punto 9).
1. **Consolidar anchos y el JSON-LD** (web; sin cambios de API, base ni Cloudinary). Pruebas
   unitarias del armado de URL (solo las 5 cadenas permitidas) y la medición `medir_urls.py` antes
   y después: ninguna cadena fuera de la línea base, 0 imágenes rotas, en catálogo, ficha, variantes,
   galería, admin, 1280 y 360 px. Se publica primero en Preview.
2. **Comprimir en el navegador las fotos nuevas** (web; sin cambios de API). Pruebas unitarias de
   la decisión (cuándo achicar, cuándo dejar el original, transparencia, orientación) y una
   comparación visual local con 10 a 20 fotos reales de Roberto (que las provea él, o descargando
   originales sin transformación con su autorización), mirando tamaño, nitidez del zoom y color.
3. **Medir 2 semanas** con `GET /usage?date=` (solo consulta): transformaciones por foto nueva y MB
   por foto, contra esta línea base.
4. **Más adelante, si hace falta:** formato único para fotos nuevas, o reutilizar una foto ya subida
   en otra variante sin volver a subirla. Las dos requieren cambios de API o de esquema y una
   decisión aparte.

## Etapa 1 implementada (rama `perf/cloudinary-etapa1`, sin publicar)

- `apps/web/src/lib/cloudinary.ts`: una sola escalera de anchos — tarjeta 480/640, foto principal
  640/1200, miniaturas de la ficha y del admin 160 (`THUMBNAIL_WIDTH`), zoom sin cambios.
- `VariantSelector`: la foto del selector de colores repetidos usa la misma miniatura de 160.
- `ProductDetailPage`: el JSON-LD lista solo la foto principal de cada variante (o la primera, si
  ninguna está marcada), en el mismo 1200 que `og:image`; sin duplicados.
- Formatos automáticos (`f_auto,q_auto`), `srcset`, `sizes` y carga diferida, iguales.

Medición antes/después con `medir_urls.py` (1280 densidad 2 y 1, 360 densidad 3; ningún pedido llegó
a Cloudinary): cadenas usadas 7 → 5, **ninguna nueva** (se dejan de pedir `w_128` y `w_800`),
cadenas por foto 2,24 → 2,03, 0 imágenes rotas
([`linea-base-urls.json`](cloudinary-transformaciones/linea-base-urls.json),
[`etapa1-urls.json`](cloudinary-transformaciones/etapa1-urls.json)). Ancho elegido contra ancho
mostrado × densidad: igual o mejor que antes en todas las vistas (miniaturas del celular de 128 a
160); la tarjeta en celulares de densidad 3 sigue en 640, como antes.

## 9. ¿Ampliar el plan?

**Sí, si Roberto va a seguir cargando en noviembre**: la cuenta está por encima del 100 % hasta que
lo de octubre salga de la ventana (21 al 30 de noviembre), y la consecuencia documentada, si no se
corrige, es la desactivación de la cuenta, con las fotos de la tienda sin mostrarse. Un mes de un
plan pago cubre ese período sin riesgo. Si la carga se frena hasta fin de mes, se puede esperar
vigilando los avisos por correo. Las etapas 1 y 2 hacen que el plan Free alcance más tiempo, pero
**no resuelven el exceso actual**.

Fuentes: [conteo de transformaciones](https://cloudinary.com/documentation/transformation_counts),
[facturación y planes](https://cloudinary.com/documentation/billing_and_plans),
[preguntas sobre créditos](https://cloudinary.com/documentation/developer_onboarding_faq_credits).
