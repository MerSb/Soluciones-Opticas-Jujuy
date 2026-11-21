# Bajar stock desde el administrador (recorrido de Roberto)

Relevado el 2026-11-21. Roberto busca un código de lente (p. ej. `1007`), abre el producto, reconoce el
color correcto y baja una unidad. Las reglas de stock **no cambiaron**: el stock es por variante y se
guarda con «Guardar stock» (campo «Stock de <SKU>» + botón, que se habilita solo cuando el número
cambió; un campo vacío nunca se guarda como 0).

## Recorrido

1. **Admin → Productos → «Buscar por SKU o código de modelo»** (`/admin/products`). La búsqueda vive en
   la URL: `?sku=1007&nombre=…&tipo=FRAME&eliminados=1&pagina=2&ultimo=<variante>`. Escribir reemplaza
   la entrada del historial (no deja pasos de más en «Atrás»). «Borrar» limpia el código y vuelve a la
   caja. Solo se guardan criterios de búsqueda; nada en `localStorage`.
2. **Resultados:** columna **Foto** (la principal de cada variante). Tocarla abre el visor con las fotos
   de esa variante y la leyenda «SKU · color · Modelo sugerido (sin confirmar)»; cerrar deja la
   búsqueda igual. Mientras llega la respuesta de un código recién escrito, la pantalla dice
   «Buscando «…»…» en lugar de mostrar resultados viejos con el código nuevo.
3. **Abrir el producto** desde un resultado: la ficha ofrece **«Volver a la búsqueda «1007»»**.
4. **Tarjeta de la variante:** la foto principal con lupa **«Ver grande»** junto al color, «Modelo
   sugerido … · sin confirmar», el SKU y el stock. Abrir y cerrar el visor no guarda nada y conserva un
   número de stock escrito y todavía no guardado.
5. **«Guardar stock»**, como siempre: un solo cambio, en esa variante.
6. **Volver a la búsqueda:** vuelve un paso atrás (sin entrada nueva en el historial) con el mismo
   código, filtros y página; el resultado abierto queda marcado **«Último abierto»** y a la vista, y los
   resultados se vuelven a pedir a la API, así el stock mostrado es el actual.

## Mejora futura (propuesta, NO implementada): «Dar de baja 1 unidad»

Hoy la baja depende de escribir bien el número (escribir 0 en lugar de 2 pierde unidades). Propuesta
para una autorización aparte:

- Botón **«Dar de baja 1 unidad»** en cada tarjeta de variante (y opcionalmente en los resultados).
- **Confirmación con la foto principal, el SKU y el color** de la variante («¿Dar de baja 1 unidad de
  1007 c3 · Rojo? Quedan 2 → 1»), con «Confirmar» / «Cancelar».
- En la API, una operación **atómica e idempotente** (`stock = stock - 1` con `stock > 0`, con una clave
  de operación para que un doble clic o un reintento no descuente dos veces), que nunca deja stock
  negativo (ya hay `CHECK stock >= 0`).
- Opcional: registro de bajas (quién, cuándo, cuánto) para auditar.

Cambia el mecanismo de baja: requiere decisión de Roberto, tests de concurrencia y doble clic, y
autorización antes de implementarse.
