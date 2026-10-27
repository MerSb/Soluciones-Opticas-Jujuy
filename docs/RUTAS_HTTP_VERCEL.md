# Códigos HTTP de las rutas de la tienda (Vercel)

## Problema (detectado en producción el 2026-10-27)

Las fichas de producto (`/products/<slug>`, `/accesorios/<slug>`), `/login`, `/register`, `/account/*` y `/admin/*` respondían **HTTP 404**. La página se veía bien: lo que llegaba era `404.html`, que tiene el mismo shell de la app, y React Router dibujaba la ruta correcta. Google, en cambio, recibía un 404 en las 336 fichas del sitemap.

## Causa raíz

`vercel.json` tiene `cleanUrls: true`. Con esa opción, Vercel sirve `spa.html` en `/spa` (y `/spa.html` redirige con 308). Los rewrites apuntaban a `/spa.html` y `/spa-private.html`, que no resuelven a ningún archivo, así que Vercel caía en `404.html`.

Lo que se midió en producción:

| URL                          | Respuesta                         |
| ---------------------------- | --------------------------------- |
| `/spa`                       | 200                               |
| `/spa.html`                  | 308                               |
| `/products/<slug existente>` | 404, con el `<title>` de 404.html |

El emulador local que se usó en la auditoría (`vercel_emu.py`) resolvía `/spa.html` como archivo, y el test fijaba ese destino. Por eso el error no se vio antes de publicar.

## Corrección

1. **Rewrites a URLs limpias:** `/spa` y `/spa-private`. Un test exige que ningún destino local termine en `.html`.
2. **`apps/web/middleware.ts` (Vercel Routing Middleware), solo para `/products/:slug` y `/accesorios/:slug`:**
   - Consulta `GET /api/products/<slug>`, con un límite de 2,5 s.
   - Si la API responde 404, devuelve el contenido de `404.html` con status 404 y `X-Robots-Tag: noindex`. La app sigue mostrando «Producto no encontrado».
   - Ante cualquier otra respuesta (200, 5xx, timeout o error de red), sigue al rewrite y responde 200 (_fail-open_). Así, una caída de la API nunca convierte una ficha real en 404.
   - No hay catch-all: una ruta inventada sigue siendo 404 real.
   - `/login` y `/admin/*` responden 200 con `noindex` (meta y header). La autorización la sigue haciendo la API; el shell no contiene datos.

## Comportamiento esperado

| Ruta                                               | HTTP | Notas                                                                    |
| -------------------------------------------------- | ---- | ------------------------------------------------------------------------ |
| `/`, `/products`, `/accesorios`, estáticas         | 200  | `<head>` prerenderizado con su canonical                                 |
| `/products/<existente>`, `/accesorios/<existente>` | 200  | La app pone canonical, título y JSON-LD                                  |
| `/products/<inexistente>`                          | 404  | Shell de 404.html, `noindex`                                             |
| `/login`, `/register`, `/account/*`, `/admin/*`    | 200  | `noindex` (meta y `X-Robots-Tag`); el admin sin sesión redirige al login |
| `/ruta-inventada`, `/products/a/b`                 | 404  |                                                                          |

## Costo

Cada carga directa de una ficha hace una consulta a la API antes de responder. Desde Jujuy, la API tarda unos 0,7 s de mediana; desde la región de Vercel debería ser menos, pero hay que medirlo en el preview. La navegación interna no pasa por el middleware.

## Verificación después de publicar

Para la ficha, alcanza con un GET a `/products/<slug>` y otro a `/products/no-existe-xyz`; para el resto, ver la tabla de arriba. Para leer los códigos: `curl -s -o /dev/null -w "%{http_code}" URL`.
