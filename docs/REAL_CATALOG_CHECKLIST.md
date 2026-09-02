# Guía para cargar el catálogo real

Esta guía es para quien nos vaya a pasar la información de los productos reales — no hace falta
ser programador para leerla ni completarla.

## Qué necesitamos por cada producto

Copiá esta lista por cada modelo que quieras cargar y completá lo que tengas. **No hace falta
completar todo** — lo que falte, se puede cargar después.

```
Producto: __________________________
Marca: ______________________________
Categoría (ej: anteojos de sol, recetados, deportivos): ______________________
Precio: _____________________________
Forma (ej: aviador, redondo, cuadrado, ojo de gato, ovalado, envolvente, rectangular): ____________
Estilo (uno o varios — ej: clásico, moderno, minimalista, elegante, urbano, audaz): ____________
Medidas del armazón, si las tenés (en milímetros — suelen estar impresas adentro de la patilla):
  Ancho del lente: _____ mm
  Ancho del puente: _____ mm
  Largo de patilla: _____ mm
  Altura del lente: _____ mm

Por cada color/variante disponible:
  Color: __________________
  Material (ej: metal, acetato, TR90, mixto): __________________
  Código/SKU (si tenés uno; si no, lo generamos nosotros): __________________
  Stock disponible: _____
  Fotos: (ver la guía de fotos más abajo — al menos 1, idealmente 2 a 4)
```

## Qué es obligatorio y qué es opcional

Lo único que realmente hace falta para cargar un producto es: **nombre, marca, categoría, precio**,
y **al menos una variante con su código y stock**. Todo lo demás (forma, estilo, medidas, color,
material, fotos) es opcional y se puede agregar o corregir después sin perder nada de lo ya
cargado.

**Nunca inventamos estos datos.** Si no nos pasás el precio, el stock o una medida, ese campo queda
vacío en el sistema — no se completa con un valor de prueba ni se estima. Un campo vacío en el
panel de administración se ve claramente marcado como "incompleto", nunca como si fuera un dato
real.

## Por qué pedimos forma, estilo, medidas, color y material

Estos datos son los que usa el sistema de recomendaciones para sugerirle a cada cliente los
modelos que mejor se ajustan a lo que busca. Cuantos más datos tenga un producto, mejor puede
compararlo el sistema — pero un producto con menos datos **igual aparece en el catálogo y en las
recomendaciones**, solo que con menos "evidencia" detrás de la sugerencia. Nunca vamos a inventar
una medida o un estilo solamente para que un producto llegue al 100% de información completa.

## Guía de fotos

- Foto clara y enfocada del producto, con buena luz (luz natural funciona muy bien).
- Fondo preferentemente neutro o limpio — no hace falta que sea blanco puro ni que tenga el fondo
  removido, pero sí que no distraiga del producto.
- Si podés, sacá el producto desde más de un ángulo (de frente, de costado, algún detalle).
- Evitá capturas de pantalla de redes sociales o fotos con marcas de agua de otro sitio.
- Cuanta más resolución mejor (una foto sacada con un celular actual ya alcanza perfectamente) —
  evitá fotos muy chicas o pixeladas.
- Con **una sola foto por producto ya se puede cargar** — no es necesario tener las 4 para empezar.

## Carga inicial recomendada

Para probar que todo funciona bien de punta a punta con datos reales, recomendamos empezar con una
muestra chica — **5 a 10 productos** con la mayor cantidad de información real que tengas
disponible para esos pocos. Una vez que confirmemos que se ven bien en el catálogo, en el panel de
administración y en las recomendaciones, seguimos con el resto.
