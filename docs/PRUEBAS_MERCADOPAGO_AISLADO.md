# Mercado Pago — reintegración y entorno de prueba aislado

Rama `integration/checkout-mp-241facf` (2026-11-20). Etapa 1: integración local y validación
técnica. Etapa 2: barrera de seguridad del entorno aislado (§3). **Sin push, sin deploy, sin credenciales (ni reales ni de prueba), sin pagos, sin tocar
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

## 3. Barrera de seguridad del entorno aislado (etapa 2)

El entorno de pruebas no puede distinguirse de producción por `APP_ENV`, porque producción corre con
`APP_ENV=staging`. Tampoco por el token: según la documentación oficial, el Access Token de prueba
**también empieza con `APP_USR`**. Por eso la API **no arranca** si no coinciden tres cosas
independientes (`apps/api/src/lib/runtime-safety.ts`, llamada desde `apps/api/src/server.ts` antes
de abrir el puerto).

| Capa                         | Qué exige                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Interruptores explícitos  | `SANDBOX_MODE=on` y `PAYMENTS_MODE=off\|test`. Con `SANDBOX_MODE=on`: nunca `live`, ninguna variable `CLOUDINARY_*`, y `PUBLIC_WEB_URL` y `CORS_ORIGINS` nunca de la tienda real (`solucionesopticas.com.ar`, `soluciones-opticas-jujuy-web.vercel.app`); `PUBLIC_WEB_URL` en https. Con `PAYMENTS_MODE=test` hacen falta el token, el secreto del webhook y `PUBLIC_WEB_URL`. Fuera del sandbox, en un despliegue (`NODE_ENV=production`), `PAYMENTS_MODE=test` se rechaza: la tienda real nunca toma pagos de prueba. |
| 2. Marca en la base de datos | Un comentario de Postgres sobre la base: `soluciones-opticas:sandbox`. Con `SANDBOX_MODE=on`, sin esa marca no arranca, porque podría ser producción. Sin `SANDBOX_MODE`, con la marca tampoco arranca. La marca solo la escribe `npm run sandbox:init`, y solo sobre una base **sin ninguna tabla**. No es una tabla ni una migración: el esquema sigue idéntico al de producción.                                                                                                                                     |
| 3. Mercado Pago              | Con `PAYMENTS_MODE` en `test` o `live`, al arrancar se consulta `GET https://api.mercadopago.com/users/me` con el token. `test` exige una cuenta de prueba (etiqueta `test_user`); `live`, una real. Si Mercado Pago no responde o no informa el tipo de cuenta, **no arranca**.                                                                                                                                                                                                                                        |

Además, en código:

- **Cloudinary:** con `SANDBOX_MODE=on`, `isCloudinaryConfigured()` es falso aunque haya credenciales.
  Firmar subidas, borrar y verificar fotos responde «no está configurado», y la limpieza de
  huérfanas no hace nada.
- **Pagos:** con `PAYMENTS_MODE=off` el proveedor queda sin configurar aunque haya token, y el
  webhook responde 503 sin guardar nada.
- **`prisma/seed-staging.ts`:** solo escribe en una base con la marca. Antes no tenía protección: el
  «staging» de Railway es la tienda real, y correrlo ahí habría puesto productos [DEMO] a la venta.
- **Frontend:** un Preview de Vercel cuyo `VITE_API_BASE_URL` apunte a la API productiva no arranca
  (`apps/web/src/lib/api-target.ts`). Sin esa variable, un Preview usa su propio proxy, que responde
  405 a todo lo que no sea GET/HEAD (`apps/web/preview-api.ts`).

### Comprobado en arranques reales (API compilada, Postgres descartable local)

| Caso                                                                                          | Resultado                                                            |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Configuración de producción actual (todo apagado)                                             | **Arranca**                                                          |
| `SANDBOX_MODE=on` contra una base con tablas y sin marca                                      | Se niega                                                             |
| `SANDBOX_MODE=on` + credenciales de Cloudinary                                                | Se niega                                                             |
| `PAYMENTS_MODE=test` en un despliegue sin sandbox                                             | Se niega                                                             |
| `SANDBOX_MODE=on` + `PAYMENTS_MODE=live`                                                      | Se niega                                                             |
| `SANDBOX_MODE=on` + URL o CORS de la tienda real                                              | Se niega                                                             |
| `SANDBOX_MODE=on` contra la base preparada por `sandbox:init`                                 | **Arranca**                                                          |
| Sin `SANDBOX_MODE` contra la base de pruebas                                                  | Se niega                                                             |
| `sandbox:init` sin `SANDBOX_MODE`, sin confirmación, o contra una base con tablas y sin marca | Se niega; la base queda intacta                                      |
| `seed-staging.ts` directo contra una base sin marca                                           | Se niega; 0 productos [DEMO]                                         |
| `sandbox:init` sobre una base nueva, dos veces                                                | Marca, 14 migraciones, 4 productos [DEMO]; la segunda no cambia nada |

Los casos con token de Mercado Pago se probaron con un Mercado Pago simulado: no se llamó a Mercado
Pago.

## 4. Resultados (base Postgres 18 descartable, datos ficticios)

| Verificación                       | Etapa 1                    | Etapa 2                              |
| ---------------------------------- | -------------------------- | ------------------------------------ |
| Tests API                          | 856/856                    | **887/887** (+31 de la barrera)      |
| Tests web                          | 594/594 + 3 salteados      | **604/604 + 3 salteados** (+10)      |
| Typecheck API y web, lint, formato | Sin errores                | Sin errores                          |
| `prisma validate`, build API y web | OK                         | OK                                   |
| Migraciones: publicadas → seed → 5 | Catálogo e índices iguales | Sin cambios de esquema en la etapa 2 |

**Tests intermitentes (ya existían):** con los archivos en paralelo sobre una misma base,
`recommendations.test.ts` (salida estable) y dos tests de vencimiento de reservas fallan a veces. El
commit anterior a la etapa 2 (`1a681cc`) falló 2 de 10 corridas en esos mismos tests. Sin
paralelismo entre archivos (`npx vitest run --no-file-parallelism`), 5 de 5 en verde: se pisan datos
entre archivos. Pendiente: aislar esos tests.

### Lo que cubren los tests de pagos

- **Orders API:** solo la clase `Order` del SDK oficial (`mercadopago` 3.6.1):
  `POST /v1/orders` (`type: online`) y `GET /v1/orders/{id}`. Sin Preferences ni `merchant_orders`.
- **Idempotencia:**
  - La clave de idempotencia se guarda antes de llamar a Mercado Pago y se reenvía siempre igual.
  - Cada notificación se registra una sola vez y la procesa un solo proceso a la vez.
  - El pago se aprueba una sola vez y nunca baja de estado.
  - Un segundo pago del mismo pedido va a revisión humana.
- **Confirmación:** solo vale la lectura del pedido en Mercado Pago, con la referencia, el monto y
  la moneda iguales a los del pedido.
- **ARCA apagado:** con `ARCA_MODE=off`, un pedido pagado genera 0 pedidos a facturar.

## 5. Riesgos pendientes

1. **La verificación del tipo de cuenta no se probó contra Mercado Pago real.** Si
   `GET /users/me` del token de prueba no trae la etiqueta `test_user`, la API **no va a arrancar**
   con `PAYMENTS_MODE=test`. Falla del lado seguro; habría que revisarlo con el token cargado.
2. Ninguna prueba contra Mercado Pago real todavía.
3. **Nada corre solo:** no hay tarea programada para liberar reservas, reintentar eventos,
   consultar pagos pendientes ni procesar facturas.
4. **Reembolsos y contracargos** (`REVERSED`) se registran pero no cambian el pedido.
5. El ticket de WSAA (ARCA) vive en memoria.
6. **El repositorio de GitHub es público:** lo que se suba es visible. No hay secretos.
7. Los tests intermitentes de §4.
8. Los regalos (estuche y cordón) no viajan al pedido. Las páginas legales siguen en borrador.

## 6. Procedimiento para conectar el entorno aislado

Cada bloque necesita **autorización explícita**. Hasta la etapa 2 no se hizo nada de esto.

> **2026-11-20:** el bloque de Railway (6.1) ya está hecho, con dos diferencias respecto de lo
> escrito abajo: el código se subió con `railway up` (sin GitHub) y `sandbox:init` corrió como
> pre-deploy de una sola vez (la plantilla de Postgres no crea URL pública). Ver §6.6.

### 6.1 Railway — proyecto `soluciones-opticas-pruebas`

El proyecto es independiente del de producción y tiene su propio Postgres nuevo y vacío.

1. **Servicio de la API**, desde el repositorio, rama `integration/checkout-mp-241facf`:
   - Root Directory: la raíz del repo;
   - Build: `npm run build:api`;
   - Start: `npm run start:api`;
   - Healthcheck: `/api/health`;
   - **sin Pre-deploy command**.
2. **Variables del servicio, primera tanda: pagos apagados.**

   | Variable             | Valor                                                                        |
   | -------------------- | ---------------------------------------------------------------------------- |
   | `DATABASE_URL`       | Referencia `${{Postgres.DATABASE_URL}}` del Postgres de **este** proyecto    |
   | `NODE_ENV`           | `production`                                                                 |
   | `APP_ENV`            | `staging`                                                                    |
   | `SANDBOX_MODE`       | `on`                                                                         |
   | `PAYMENTS_MODE`      | `off`                                                                        |
   | `ARCA_MODE`          | `off`                                                                        |
   | `INVOICE_EMAIL_MODE` | `off`                                                                        |
   | `ONLINE_LENS_SALES`  | `off`                                                                        |
   | `JWT_SECRET`         | Nuevo: generarlo en el panel de Railway; **sellado**. Nunca el de producción |
   | `CORS_ORIGINS`       | URL fija del Preview de la rama (se completa en 6.3)                         |
   | `CLOUDINARY_*`       | **No crearlas.** Si existen, la API no arranca                               |

3. **Preparar la base, una sola vez, desde tu máquina:**
   - En Railway → Postgres del proyecto de pruebas → Connect, copiar `DATABASE_PUBLIC_URL` sin
     mostrarla.
   - En el worktree de la rama, exportarla solo para el comando:

   ```bash
   read -rs SANDBOX_DB && \
   SANDBOX_MODE=on DATABASE_URL="$SANDBOX_DB" npm run sandbox:init -- --confirmo-base-de-pruebas; \
   unset SANDBOX_DB
   ```

   `read -rs` no muestra la URL y no queda en el historial. El script:
   - **se niega si la base tiene tablas y no tiene la marca**;
   - si la base está vacía, la marca, aplica las 14 migraciones y carga el catálogo [DEMO];
   - repetirlo no cambia nada.

4. **Desplegar el servicio.** Tiene que arrancar con
   `SANDBOX_MODE=on, PAYMENTS_MODE=off, ARCA_MODE=off`. Si en los logs aparece
   `[startup] Configuración insegura`, no arranca y el mensaje dice por qué.
5. Comprobar `GET https://<api-de-pruebas>/api/health` → 200.

### 6.2 Vercel — Preview de la rama

1. La rama llega a GitHub (push autorizado) y Vercel crea el Preview.
2. Variables de **Preview limitadas a esa rama**:
   - `VITE_API_BASE_URL` = `https://<api-de-pruebas>`;
   - nada más obligatorio. **Nunca** un secreto: todo `VITE_*` llega al navegador.
3. Redeploy del Preview para que tome la variable. Si alguien pusiera ahí la API productiva, el
   Preview no arranca.
4. Anotar la URL fija de la rama (alias de rama de Vercel) y volver a Railway: `CORS_ORIGINS` = esa
   URL.

### 6.3 Admin de prueba

1. Registrarse en el Preview con un correo propio de prueba.
2. Promover esa cuenta con la URL de la base de pruebas, igual que en 6.1.3:

   ```bash
   read -rs SANDBOX_DB && \
   DATABASE_URL="$SANDBOX_DB" node scripts/promote-to-admin.mjs <correo> --dry-run; \
   unset SANDBOX_DB
   ```

   Repetir sin `--dry-run` después de revisar.

### 6.4 Credenciales de Mercado Pago de prueba (autorización aparte)

1. Mercado Pago Developers → la app → selector **Prueba** → Credenciales: copiar el Access Token **de
   prueba**.
2. Railway → servicio de la API de pruebas → Variables:
   - `MERCADOPAGO_ACCESS_TOKEN`, pegado directo y **sellado**;
   - `PUBLIC_WEB_URL` = URL fija del Preview.
3. Webhook: la app → **Configuración de Webhooks** → modo **Prueba** →
   - URL `https://<api-de-pruebas>/api/payments/mercadopago/webhook`;
   - evento **Order (Mercado Pago)**;
   - Guardar.
   - La pestaña **Producción** queda vacía.
4. Revelar la «Firma secreta» → `MERCADOPAGO_WEBHOOK_SECRET`, **sellada**.
5. Recién ahora: `PAYMENTS_MODE=test` → redeploy.
   - Al arrancar, la API consulta a Mercado Pago si la cuenta del token es de prueba.
   - Si es real, o si no se puede confirmar, **no arranca** (riesgo 1).

### 6.5 Escenarios (autorización aparte)

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
| E7  | Reserva vencida   | Pedido sin pagar por 30 minutos            | `EXPIRED` cuando alguien lo consulta (riesgo 3)                |

### 6.6 Bloque de infraestructura ejecutado (2026-11-20)

Autorizado por la responsable del proyecto. Sin credenciales de Mercado Pago ni de Cloudinary, sin
ARCA, sin push, sin tocar producción.

**Recursos (proyecto `soluciones-opticas-pruebas`, workspace personal, región `ams`)**

| Recurso    | Nombre / ID                                                           | Detalle                                                                            |
| ---------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Proyecto   | `soluciones-opticas-pruebas` · `909e748b-9026-490e-9567-6e986845df8c` | Distinto de producción: `proactive-grace` · `66277a93-cdfc-4b4e-ba41-17ba77933f19` |
| Entorno    | `production` · `931d3073-fde1-4402-a10e-230798ca703e`                 | Único entorno del proyecto de pruebas                                              |
| PostgreSQL | `Postgres` · `8394027f-40ef-4eef-aa39-d25aac830e37`                   | Plantilla oficial, PostgreSQL 18.6, volumen 5 GB, **sin TCP proxy ni URL pública** |
| API        | `api-pruebas` · `431e1452-a2a4-493e-b17c-0dbd1d168556`                | Sin fuente de GitHub; código de `a596f46` subido con `railway up`                  |
| Dominio    | `https://api-pruebas-production-bff2a278.up.railway.app`              | Generado por Railway, puerto 8080                                                  |

**Configuración de `api-pruebas`:** build `npm run build:api`, start `npm run start:api`,
healthcheck `/api/health` (120 s), reinicio `ON_FAILURE` ×3, **sin pre-deploy**. Variables:
`NODE_ENV=production`, `APP_ENV=staging`, `SANDBOX_MODE=on`, `PAYMENTS_MODE=off`, `ARCA_MODE=off`,
`INVOICE_EMAIL_MODE=off`, `ONLINE_LENS_SALES=off`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`
(resuelve a `postgres.railway.internal`, red privada del proyecto de pruebas) y `JWT_SECRET` nuevo
(48 bytes aleatorios, generado localmente y cargado por stdin; nunca impreso; no sellado). No hay
`CLOUDINARY_*`, `MERCADOPAGO_*` ni `CORS_ORIGINS`.

**Inicialización de la base (una sola vez).** Verificada antes: 0 tablas, sin comentario. Se puso
`npm run sandbox:init -- --confirmo-base-de-pruebas` como pre-deploy solo para el primer deploy
(`5edc1c3a`) y se quitó apenas terminó (verificado: `preDeployCommand: []`). Resultado:

- marca `soluciones-opticas:sandbox` escrita;
- 14/14 migraciones aplicadas, 0 fallidas (`_prisma_migrations`);
- 4 productos, los 4 `[DEMO]`; 0 usuarios, 0 pedidos.

**Arranque:** `API listening … SANDBOX_MODE=on, PAYMENTS_MODE=off, ARCA_MODE=off`. Desde internet:
`GET /api/health` → 200 `{"status":"ok"}`; `/api/products` → solo los 4 `[DEMO]`;
`POST /api/payments/mercadopago/webhook` → 503 (pagos apagados).

**Producción, comprobada después (solo lectura):** último deploy de `soluciones-opticas-api` sigue
siendo `f6e54c4e` (`241facf`, 2026-10-31); Postgres productivo sin deploys desde 2026-09-27; 0
cambios pendientes. La rama no está en GitHub.

**Cómo volver a desplegar.** El servicio no tiene autodeploy. Desde un worktree de la rama, vinculado
solo al proyecto de pruebas (nunca relinkear el repo principal, que apunta a `proactive-grace`):

```bash
railway link -p 909e748b-9026-490e-9567-6e986845df8c -e 931d3073-fde1-4402-a10e-230798ca703e \
  -s 431e1452-a2a4-493e-b17c-0dbd1d168556
railway status   # comprobar «soluciones-opticas-pruebas» antes de seguir
railway up --detach -s 431e1452-a2a4-493e-b17c-0dbd1d168556 -e 931d3073-fde1-4402-a10e-230798ca703e
```

**Tareas sobre la base (p. ej. promover el admin de 6.3).** No hay URL pública. Se corren dentro del
contenedor de la API, que ya tiene `DATABASE_URL` (todavía no probado):
`railway ssh -s 431e1452-a2a4-493e-b17c-0dbd1d168556 -- node scripts/promote-to-admin.mjs <correo> --dry-run`.

**Costo estimado.** Se paga por uso (RAM ≈ USD 10/GB-mes, CPU ≈ USD 20/vCPU-mes, volumen ≈
USD 0,15/GB-mes usado, salida ≈ USD 0,05/GB). En reposo (API ≈ 150 MB, Postgres ≈ 100 MB, CPU casi
nula) ≈ **USD 2–4 por mes**, que se suma al consumo de producción dentro del mismo plan. Se puede
bajar a casi cero activando el modo reposo (_sleep_) de `api-pruebas`, o borrando el proyecto al
terminar las pruebas.

## 7. Cómo reproducir la validación local

1. Crear un worktree de la rama.
2. Levantar un Postgres **descartable** solo en `127.0.0.1`, sin volumen.
3. Escribir un `.env` local con `DATABASE_URL` a esa base, un `JWT_SECRET` aleatorio, `ARCA_MODE=off`
   y sin credenciales de proveedores.
4. Crear `apps/web/.env.local` con `VITE_API_BASE_URL=http://localhost:3001`.
5. Correr:
   - `npm ci`;
   - `npx prisma migrate deploy` y `npx prisma db seed`;
   - `npm run test:api` y `npm run test:web`;
   - `npm run lint` y `npm run format`;
   - `npm run typecheck -w apps/web`;
   - `npm run build:api` y `npm run build:web`.

Los tests de la API vacían tablas de facturación y escriben (y restauran) el comentario de la base:
nunca apuntarlos a una base con datos reales.
