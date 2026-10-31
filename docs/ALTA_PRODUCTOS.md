# Alta de productos (una sola página)

`/admin/products/new` (y `?tipo=accesorio`, que empieza como accesorio) crea **un producto por vez,
en una sola página**, desde el 2026-10-31. Reemplaza a la página de pestañas.

## Por qué

Con la página de pestañas, al tocar «Crear producto» se abría la ficha del producto creado pero con
el mismo desplazamiento de la página anterior (la app no volvía arriba al cambiar de ruta), así
que se veía «Medidas del armazón» y parecía que el alta «llevaba a medidas»; con varias pestañas no
navegaba. Además, si faltaba algo el botón quedaba deshabilitado sin llevar al campo.

## Secciones

1. **Datos generales:** anteojo o accesorio (no se cambia después), nombre, marca, categoría,
   precio; en accesorios, tipo de accesorio y «Se vende por separado».
2. **Características y medidas** (solo anteojos, opcionales): forma, estilos y las cinco medidas en
   mm (mayores que 0 y hasta 500, como la API).
3. **Colores, material, SKU y stock:** el formulario de una variante (paleta, «Combinado» con sus
   tonos, «Otro color…», material, SKU, stock) y la lista de las agregadas. Ver
   [COLORES.md](COLORES.md).
4. **Fotografías:** las fotos de cada variante agregada, numeradas por clic (la 1 es la principal).

Un único botón final: «Crear producto» («Crear accesorio»).

## Validación

- Al tocar el botón, si falta algo obligatorio (nombre, marca, categoría, precio, tipo de
  accesorio) o algo está mal (medidas, SKU vacío o repetido, stock, una variante a medio cargar),
  no se envía nada: cada error aparece junto a su campo, la página va al primero y le da el foco, y
  arriba del botón queda la lista de lo que falta (cada ítem lleva a su campo).
- Antes de crear el producto se consulta, solo lectura, si algún SKU ya existe en otro producto
  (`GET /api/admin/products/similar?sku=`). Si existe, se marca en su variante y no se crea nada,
  para no dejar un producto sin sus variantes. Si no se puede consultar, tampoco se crea nada.
- Nada de lo escrito se pierde con un error.

## Guardado y reintentos

Producto → variantes (un pedido atómico, `POST …/variants/batch`) → fotos, recordando lo ya creado:
un reintento («Reintentar lo pendiente») sigue desde ahí y nunca crea nada dos veces (la foto cuyo
resultado se perdió se vuelve a registrar por su `public_id`). Al terminar se abre la ficha del
producto, arriba, con «✓ Producto creado».

## Borradores

Lo escrito se guarda en `localStorage` (`soj:admin:product-drafts:v1`, mismo formato que antes,
con forma, estilos y medidas agregados); las fotos no se pueden guardar. Si quedaron varios
borradores de la página de pestañas, se abre el primero y los demás aparecen listados con
«Continuar con este» y «Descartar».

## Rutas

Sin cambios: el panel y el listado de productos siguen enlazando a `/admin/products/new` y
`/admin/products/new?tipo=accesorio`. Al cambiar de página dentro del administrador, la nueva
página se abre arriba.
