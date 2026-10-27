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
2. **`apps/web/middleware.ts` (Vercel Routing Middleware, runtime Node.js), solo para `/products/:slug` y `/accesorios/:slug`:**
   - Consulta `GET /api/products/<slug>`, con un límite de 2,5 s.
   - Si la API responde 404, hace un rewrite interno a `/404` (404.html) con status 404 y `X-Robots-Tag: noindex`. La app sigue mostrando «Producto no encontrado». Es un rewrite y no un `fetch` al propio sitio, porque en los Preview ese `fetch` choca con Deployment Protection.
   - Ante cualquier otra respuesta (200, 5xx, timeout o error de red), sigue al rewrite y responde 200 (_fail-open_). Así, una caída de la API nunca convierte una ficha real en 404.
   - No hay catch-all: una ruta inventada sigue siendo 404 real.
   - `/404` responde 200 si se lo pide directamente (es `404.html` con `cleanUrls`). Nada enlaza a esa URL y tiene `noindex`.
   - `/login` y `/admin/*` responden 200 con `noindex` (meta y header). La autorización la sigue haciendo la API; el shell no contiene datos.

## Build en Vercel con el middleware

El middleware hace que Vercel compile una función, y ese compilador ejecuta su propio `npm install`. Ignora el comando del proyecto (`npm install --ignore-scripts`) y dispara el `postinstall` de la raíz. Sin el CLI de Prisma, el primer Preview falló con `prisma: command not found`.

`scripts/postinstall.mjs` omite `prisma generate` solo cuando `VERCEL=1`. En Railway y en local sigue generando el cliente: Railpack copia todo el repo antes de instalar cuando existe un `postinstall`.

## Comportamiento esperado

| Ruta                                               | HTTP | Notas                                                                    |
| -------------------------------------------------- | ---- | ------------------------------------------------------------------------ |
| `/`, `/products`, `/accesorios`, estáticas         | 200  | `<head>` prerenderizado con su canonical                                 |
| `/products/<existente>`, `/accesorios/<existente>` | 200  | La app pone canonical, título y JSON-LD                                  |
| `/products/<inexistente>`                          | 404  | Shell de 404.html, `noindex`                                             |
| `/login`, `/register`, `/account/*`, `/admin/*`    | 200  | `noindex` (meta y `X-Robots-Tag`); el admin sin sesión redirige al login |
| `/ruta-inventada`, `/products/a/b`                 | 404  |                                                                          |

## Costo

Cada carga directa de una ficha hace una consulta a la API antes de responder. La navegación interna no pasa por el middleware.

Medición en el Preview de `cd9c1f8` (2026-10-27, desde Jujuy, 5 pedidos por ruta):

| Ruta                          | Tiempo total | Consulta en la API (Railway) |
| ----------------------------- | ------------ | ---------------------------- |
| Ficha existente               | 0,45–0,49 s  | 6–53 ms                      |
| Ficha inexistente (404)       | 0,46–0,50 s  | 6–53 ms                      |
| Página estática (`/products`) | 0,20–0,23 s  | —                            |

Railway registró exactamente una consulta `GET /api/products/<slug>` por cada pedido a una ficha: no hay recursión ni otras consultas.

## Proxy de solo lectura para los Preview

Los Preview no tienen `VITE_API_BASE_URL` (está solo en producción) y la API no los admite por CORS. Sin la variable, la app no arranca. Para ver el catálogo en un Preview sin tocar CORS ni variables:

- `src/lib/env.ts`: si falta `VITE_API_BASE_URL` y `VITE_VERCEL_ENV` (lo define Vercel) es `preview`, la app usa su propio dominio como API. En cualquier otro caso sigue fallando al arrancar, igual que antes.
- `apps/web/preview-api.ts`, llamado desde el middleware para `/api/*`, actúa **solo si `VERCEL_ENV=preview`**. En producción hace `next()` sin consultar nada, y `/api/*` sigue siendo el 404 estático de siempre.

Lo que permite y lo que no:

| Pedido                                                                                                                                                                                                 | Respuesta                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `GET`/`HEAD` de `/api/health`, `/api/products`, `/api/products/shapes`, `/api/products/<slug>` (+`/related`, `/quote`), `/api/accessories/included`, `/api/categories`, `/api/brands`, `/api/branches` | Reenviado a la API pública                              |
| `GET /api/auth/session`                                                                                                                                                                                | `{ user: null, canRefresh: false }` sin llamar a la API |
| Cualquier otra ruta (admin, auth, favoritos, perfil, recomendaciones…)                                                                                                                                 | 403, no se reenvía                                      |
| `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`                                                                                                                                                            | 405, no se reenvía                                      |

- El slug tiene que cumplir `[a-z0-9]+(-[a-z0-9]+)*`, y el destino es fijo.
- Del pedido del visitante solo viajan la ruta y la consulta: sin cookies, sin `Authorization` y sin otras cabeceras.
- De la respuesta solo vuelven el status, el cuerpo y el `content-type`: nunca `Set-Cookie`.
- Todo sale con `cache-control: no-store` y `X-Robots-Tag: noindex`.
- En el Preview no hay sesión: el login y el admin no pueden llegar a producción.
- Las fotos se ven porque `VITE_CLOUDINARY_CLOUD_NAME` existe en el entorno Preview.

## Verificación después de publicar

Para la ficha, alcanza con un GET a `/products/<slug>` y otro a `/products/no-existe-xyz`; para el resto, ver la tabla de arriba. Para leer los códigos: `curl -s -o /dev/null -w "%{http_code}" URL`.
