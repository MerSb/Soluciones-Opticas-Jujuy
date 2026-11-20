# Mercado Pago — reintegración y entorno de prueba aislado

Rama `integration/checkout-mp-241facf` (2026-11-20). Etapa 1: integración local y validación
técnica. **Sin push, sin deploy, sin credenciales (ni reales ni de prueba), sin pagos, sin tocar
producción.** ARCA queda apagado (`ARCA_MODE=off`).

## 1. Base verificada

| Dónde                                   | Commit publicado | Cómo se verificó                                   |
| --------------------------------------- | ---------------- | -------------------------------------------------- |
| Railway, servicio de la API, production | `241facf`        | `railway status` (lectura), último deployment      |
| Vercel, Production                      | `241facf`        | Deployments de GitHub creados por Vercel (lectura) |

Railway despliega la API desde la rama `feature/cloudinary-staging-readiness`. Una rama nueva en
GitHub no dispara ningún deploy de producción en Railway.

## 2. Qué se integró y cómo

`integration/online-checkout-arca` (`b4d75e7`) fusionada sobre `241facf`. Siete conflictos, todos
resueltos conservando los dos lados:

| Archivo                        | Resolución                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `apps/api/src/lib/env.ts`      | `PUBLIC_SITE_URL` (sitemap, publicado) **y** las variables de Mercado Pago, ARCA y cristales |
| `.env.example`                 | Ídem; se quitó el encabezado «Future» que quedaba duplicado                                  |
| `apps/web/.env.example`        | GA4 (publicado) y `VITE_ONLINE_LENS_SALES`                                                   |
| `apps/web/src/app/routes.tsx`  | Páginas legales (publicado) y `/factura/:id`                                                 |
| `apps/web/src/vite-env.d.ts`   | `VITE_VERCEL_ENV` y `VITE_ONLINE_LENS_SALES`                                                 |
| `packages/shared/src/index.ts` | `frame-shapes` y `orders` + `invoicing`                                                      |
| `docs/API.md`                  | Tabla publicada (incluye `/api/products/colors`) + las 4 rutas del checkout                  |

Productos, variantes, imágenes y Cloudinary quedan como en `241facf`: ninguno de esos archivos tuvo
conflicto y no se modificaron después de la fusión.

### Correcciones que hizo falta hacer

1. **Migraciones** renombradas a `20261120…` (detalle en
   [COMPRA_ONLINE_INTEGRACION.md §3](COMPRA_ONLINE_INTEGRACION.md)).
2. **Rutas del checkout en Vercel.** La versión publicada sacó el catch-all para devolver 404 reales;
   sin cambios, `/cart`, `/checkout`, `/order/…` (incluida la vuelta desde Mercado Pago) y
   `/factura/:id` daban 404 al entrar directo o al recargar. `apps/web/vercel.json` ahora las sirve
   con el shell `noindex` (`/spa-private`) y `X-Robots-Tag: noindex`, porque muestran datos
   personales. `test/seo.test.tsx` las cuenta como privadas.
3. **Fixtures de tests** (`checkout`, `payment-initiation`, `payment-webhook`, `order.service`): la
   publicada hizo único `product_images.cloudinary_public_id`; cada producto de prueba usa ahora su
   propio id. Solo tests.
4. **`product-add-to-cart.test.tsx`:** la ficha publicada ya no monta el configurador de cristales
   (`024a9c3`) y tiene «Cristales compatibles» apagado (`a4b1434`). Se quitó una espera que dependía
   del configurador, y los 3 tests de cristales online quedan en `it.skip` con el motivo escrito. Se
   reactivan junto con el configurador si se decide vender cristales online.

## 3. Resultados (2026-11-20, base Postgres 18 descartable, datos ficticios)

| Verificación                          | Resultado                                                   |
| ------------------------------------- | ----------------------------------------------------------- |
| `prisma validate`                     | Válido                                                      |
| Migraciones (9 publicadas → seed → 5) | Aplicadas; catálogo e índices previos idénticos             |
| `prisma migrate diff` vs esquema      | Sin diferencias (salvo el índice trigram manual, ADR-0014)  |
| Tests API                             | **856/856**, tres corridas seguidas                         |
| Tests web                             | **594/594 + 3 salteados** (cristales online), tres corridas |
| Typecheck API y web                   | Sin errores                                                 |
| Lint (ESLint)                         | Sin errores                                                 |
| Formato (Prettier)                    | Sin diferencias                                             |
| Build API (`tsc`) y web (`vite`)      | OK                                                          |

### Lo que cubren los tests de pagos

- **Orders API:** el adaptador usa solo la clase `Order` del SDK oficial (`mercadopago` 3.6.1):
  `POST /v1/orders` (`type: online`) y `GET /v1/orders/{id}`. Sin Preferences ni `merchant_orders`.
- **Idempotencia:**
  - La clave de idempotencia se guarda antes de llamar a Mercado Pago y se reenvía siempre igual.
  - Un segundo clic reutiliza el checkout existente.
  - Cada notificación se registra una sola vez y la procesa un solo proceso a la vez.
  - El pago se aprueba una sola vez (`approvedAt` no cambia) y una notificación vieja nunca lo baja.
  - Un segundo pago del mismo pedido va a revisión humana.
- **Confirmación:** solo vale la lectura del pedido en Mercado Pago, con la referencia, el monto y
  la moneda iguales a los del pedido. La página de retorno no confirma nada.
- **Firma:** validador oficial del SDK. Sin secreto configurado responde 503 y no procesa nada.
- **ARCA apagado:** con `ARCA_MODE=off`, un pedido pagado por webhook genera 0 pedidos a facturar,
  el panel informa `enabled: false` y no existe ningún endpoint de facturación manual.

### Escrituras hacia producción

- **La API** no tiene ninguna URL de la tienda: solo Mercado Pago (desde el SDK) y ARCA homologación.
- **La web en un Preview:**
  - Sin `VITE_API_BASE_URL`, llama a su propio origen, donde el proxy de previews deja pasar solo
    `GET`/`HEAD` de una lista fija de lecturas del catálogo. Un `POST` del checkout recibe 405.
  - Con `VITE_API_BASE_URL` apuntando a la API de pruebas, todo va ahí, incluido el middleware.
- Lo único que lee producción por defecto es el middleware de Vercel (un `GET` de la ficha de
  producto) y el rewrite de `/sitemap.xml`.

## 4. Riesgos pendientes

1. **Ninguna prueba contra Mercado Pago real todavía** (ni en modo de prueba): todo lo anterior usa
   un Mercado Pago simulado.
2. **Nada corre solo:** no hay tarea programada para liberar reservas vencidas, reintentar eventos,
   consultar pagos pendientes ni procesar facturas pendientes.
3. **Reembolsos y contracargos** (`REVERSED`) se registran pero no cambian el pedido. Con ARCA
   encendido, un pedido reembolsado antes de facturarse se facturaría igual.
4. **No hay una barrera explícita entre modo prueba y modo real** (por ejemplo `PAYMENTS_MODE`): la
   única garantía es usar el token de la pestaña «Credenciales de prueba».
5. **Cloudinary comparte carpeta por `APP_ENV`:** la ruta de subida es
   `soluciones-opticas/${APP_ENV}/…` y producción corre con `APP_ENV=staging`. El entorno de pruebas
   **no debe tener** credenciales de Cloudinary.
6. **El ticket de WSAA (ARCA) vive en memoria:** resolverlo antes de la homologación.
7. **El repositorio de GitHub es público:** lo que se suba a una rama es visible. No contiene
   secretos, pero sí la lógica de pagos y facturación.
8. Los regalos (estuche y cordón) no viajan al pedido. Las páginas legales siguen en borrador.

## 5. Procedimiento para el entorno de prueba aislado

Cada paso necesita **autorización explícita**. Nada de esto se hizo.

### 5.1 Railway — proyecto nuevo, no un entorno dentro del de producción

1. Crear un proyecto nuevo (por ejemplo `soluciones-opticas-pruebas`).
2. Agregar un **Postgres nuevo** en ese proyecto.
3. Crear el servicio de la API desde el repositorio, con la rama de prueba:
   - Root Directory: la raíz del repo;
   - Build: `npm run build:api`;
   - Start: `npm run start:api`;
   - Healthcheck: `/api/health`.
4. Cargar las variables del servicio (tabla 5.3).
5. Con `DATABASE_URL` del **Postgres de pruebas**, aplicar `npx prisma migrate deploy` y después
   `npm run db:seed:staging` (datos ficticios). **Nunca restaurar un respaldo de producción.**
6. Crear un admin de prueba para ver «Pedidos online».

### 5.2 Vercel — Preview de la rama

1. La rama llega a GitHub, previa autorización del push, y Vercel crea el Preview.
2. Variables de **Preview limitadas a esa rama**:
   - `VITE_API_BASE_URL` = URL de la API de pruebas;
   - `VITE_CLOUDINARY_CLOUD_NAME` es opcional (es pública).
   - **Nunca** un secreto: todo `VITE_*` llega al navegador.
3. Usar la URL fija de la rama (el alias de rama de Vercel) en `CORS_ORIGINS` y `PUBLIC_WEB_URL`.

### 5.3 Variables del servicio de la API de pruebas

| Variable                     | Valor                                                    | Secreta     |
| ---------------------------- | -------------------------------------------------------- | ----------- |
| `DATABASE_URL`               | Referencia al Postgres **de pruebas**                    | sí          |
| `NODE_ENV`                   | `production`                                             |             |
| `APP_ENV`                    | `staging` (es otro servicio; no cambia el de producción) |             |
| `JWT_SECRET`                 | Nuevo, generado en Railway; distinto del de producción   | sí          |
| `CORS_ORIGINS`               | URL del Preview de la rama                               |             |
| `PUBLIC_WEB_URL`             | URL del Preview de la rama                               |             |
| `MERCADOPAGO_ACCESS_TOKEN`   | Access Token **de prueba** de la app                     | sí, sellada |
| `MERCADOPAGO_WEBHOOK_SECRET` | «Firma secreta» del webhook en modo Prueba               | sí, sellada |
| `ARCA_MODE`                  | `off`                                                    |             |
| `INVOICE_EMAIL_MODE`         | `off`                                                    |             |
| `ONLINE_LENS_SALES`          | `off`                                                    |             |
| `CLOUDINARY_*`               | **No definir** (riesgo 5)                                |             |

El Access Token se pega directo en las variables del servicio y se sella. Nunca en Vercel, en un
archivo del repo, en la terminal ni en un chat.

### 5.4 Webhook de Mercado Pago

Recién con la API de pruebas desplegada:

1. Mercado Pago Developers → la app → **Configuración de Webhooks** → interruptor **Prueba**.
2. URL: `https://<api-de-pruebas>/api/payments/mercadopago/webhook`.
3. Evento: **Order (Mercado Pago)**.
4. Guardar.
5. Revelar la «Firma secreta» → cargarla como `MERCADOPAGO_WEBHOOK_SECRET` (sellada) → redeploy.

La pestaña **Producción** queda vacía.

### 5.5 Escenarios a ejecutar (con autorización)

Ventana de incógnito, sin sesión de Mercado Pago, tarjetas de prueba oficiales. El resultado lo
define el nombre del titular.

| #   | Escenario         | Cómo                                       | Esperado                                                       |
| --- | ----------------- | ------------------------------------------ | -------------------------------------------------------------- |
| E1  | Aprobado          | Titular `APRO`, DNI 12345678               | `PAID`, pago `APPROVED`, stock descontado una vez, 0 facturas  |
| E2  | Rechazado         | Titular `OTHE`                             | Intento cerrado, pedido `PENDING_PAYMENT`, se puede reintentar |
| E3  | Pendiente         | Titular `CONT`                             | Sigue `PENDING_PAYMENT`; el retorno dice «pendiente»           |
| E4  | Webhook duplicado | «Simular notificación» ×2 con el pedido E1 | Sin cambios en `approvedAt` ni en el stock                     |
| E5  | Retorno falso     | Abrir la URL de éxito sin pagar            | Nada cambia                                                    |
| E6  | Sin firma         | `POST` al webhook sin `x-signature`        | 401, nada guardado                                             |
| E7  | Reserva vencida   | Pedido sin pagar por 30 minutos            | `EXPIRED` cuando alguien lo consulta (riesgo 2)                |

## 6. Cómo reproducir la validación local

1. Crear un worktree de la rama.
2. Levantar un Postgres **descartable** solo en `127.0.0.1`, sin volumen.
3. Escribir un `.env` local con `DATABASE_URL` a esa base, un `JWT_SECRET` aleatorio y
   `ARCA_MODE=off`, sin credenciales de proveedores.
4. Crear `apps/web/.env.local` con `VITE_API_BASE_URL=http://localhost:3001`.
5. Correr:
   - `npm ci`;
   - `npx prisma migrate deploy` y `npx prisma db seed`;
   - `npm run test:api` y `npm run test:web`;
   - `npm run lint` y `npm run format`;
   - `npm run typecheck -w apps/web`;
   - `npm run build:api` y `npm run build:web`.

Los tests de la API vacían tablas de facturación: nunca apuntarlos a una base con datos reales.
