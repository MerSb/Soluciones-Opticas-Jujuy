# Auditoría web: candidato de integración

- **Fecha:** 2026-10-16
- **Rama candidata (solo local):** `candidate/web-audit-multicolor`.
- **Ramas originales:** no se reescribieron ni se forzaron.
- **Estado:** no hubo push, merge remoto ni deploy. No se modificaron la base real ni Cloudinary, ni se tocaron productos, stock o precios.

## 0. Estado real verificado (no se dio por supuesto ningún SHA)

| Referencia                                     | SHA       | Nota                                                                                                                                                            |
| ---------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origin/feature/cloudinary-staging-readiness`  | `e051a7e` | Rama comercial desplegada (Vercel y Railway). Sin cambios desde el último informe.                                                                              |
| `feature/cloudinary-staging-readiness` (local) | `3fc0eaa` | Ref local **desactualizada**: 4 commits detrás del remoto y ancestro de `e051a7e`. No se usa.                                                                   |
| `chore/website-20-point-audit`                 | `2adbc75` | 14 commits sobre `e051a7e` (eran 11 en el informe anterior; ver §1).                                                                                            |
| `feature/accessory-multi-color`                | `8849f3f` | 1 commit sobre `e051a7e`. Sin cambios.                                                                                                                          |
| `candidate/web-audit-multicolor`               | `dffd49a` | Auditoría + multicolor (dos merges locales). La punta de la rama es el commit de este informe, que solo agrega este archivo: el código es idéntico a `dffd49a`. |

El árbol de trabajo está limpio en las tres ramas.

## 1. Bloqueos resueltos

| Bloqueo                                                                       | Resolución                                                                                                                                                                                                                                                                                                                        | Commit    |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Textos legales con `[[PENDIENTE]]` que se publicarían                         | Cada documento tiene un interruptor literal de aprobación (hoy los tres en `false`). Mientras no esté aprobado:<br>• el build de producción no tiene ruta, ni link en el footer, ni HTML pregenerado, y la URL da **404 real**;<br>• el texto ni siquiera entra al bundle;<br>• los borradores se revisan solo con `npm run dev`. | `63b7fca` |
| Guardas para que no se repita                                                 | El build **falla** si `[[PENDIENTE` llega a `dist` (probado: aprobar el aviso legal con marcadores rompe el build y nombra el chunk). Un test rechaza un documento aprobado con marcadores. La analítica no puede activarse sin la política de cookies aprobada.                                                                  | `63b7fca` |
| **Fichas de producto con el canonical de la home** (encontrado en esta etapa) | `/products/:slug` y `/accesorios/:slug` se reescribían a `index.html`, cuyo `<head>` declara canonical y `og:url` = `/`. Para un buscador que lee el HTML, cada ficha era un duplicado de la home. Ahora usan `spa.html`, sin canonical heredado; la app pone el propio y el JSON-LD.                                             | `0a37f35` |
| Páginas privadas indexables antes de ejecutar JS                              | Login, registro, cuenta y admin usan `spa-private.html` (meta `noindex`) y reciben `X-Robots-Tag: noindex`.                                                                                                                                                                                                                       | `0a37f35` |
| Lista de datos legales faltantes                                              | [legal-pending-data.md](legal-pending-data.md): seis datos del negocio, preguntas para el asesor y el procedimiento de aprobación.                                                                                                                                                                                                | `2adbc75` |
| Fallas de las suites Chromium sin clasificar                                  | Clasificadas y resueltas (§5).                                                                                                                                                                                                                                                                                                    | —         |

### Verificación de SEO y routing

Es una emulación local de `vercel.json` contra el build real del candidato. `vercel_emu.py` aplica la semántica documentada de Vercel:

- filesystem primero, con `cleanUrls` y sin barra final;
- `rewrites` en orden;
- `404.html` con estado 404;
- headers según la ruta de entrada.

**No es Vercel**: la confirmación definitiva es el preview (§6).

| Ruta                                            | Estado           | Content-Type        | X-Robots-Tag | Canonical en el HTML     | Meta robots         |
| ----------------------------------------------- | ---------------- | ------------------- | ------------ | ------------------------ | ------------------- |
| `/`, `/accesorios`, `/products`, `/contact`     | 200              | text/html           | —            | su propia URL            | —                   |
| `/products/<slug>`, `/accesorios/<slug>`        | 200              | text/html           | —            | ninguno (lo pone la app) | —                   |
| `/login`, `/register`, `/account/*`, `/admin/*` | 200              | text/html           | `noindex`    | ninguno                  | `noindex, nofollow` |
| `/aviso-legal`, `/privacidad`, `/cookies`       | **404**          | text/html           | —            | ninguno                  | `noindex, nofollow` |
| `/esta-pagina-no-existe`, `/products/a/b`       | **404**          | text/html           | —            | ninguno                  | `noindex, nofollow` |
| `/robots.txt`                                   | 200              | text/plain          | —            | —                        | —                   |
| `/sitemap.xml` (proxy al API)                   | 200              | **application/xml** | —            | —                        | —                   |
| `/accesorios.html`, `/contact/`                 | 308 → URL limpia | —                   | —            | —                        | —                   |
| Cualquier ruta con Host `*.vercel.app`          | igual            | —                   | `noindex`    | —                        | —                   |

Otras verificaciones:

- **Sitemap:** se parseó como XML válido y tiene 11 URLs (las 7 estáticas indexables más 4 fichas de la base local).
- **`robots.txt`:** `Allow: /`, `Disallow: /admin` y `/account`, y la línea `Sitemap:`.
- **Fichas, después de ejecutar JS** (Chromium, con productos del snapshot de staging): canonical propio, sin `noindex`, y JSON-LD `Product`, `Offer`, `Brand` y `BreadcrumbList`. El JSON-LD `Optician` está en todos los shells.
- **Build de producción del candidato:** el footer no tiene links legales y `/aviso-legal` muestra "Página no encontrada" con HTTP 404.

**Limitaciones de la SPA (documentadas, no se ocultan):**

- **Ficha inexistente** (`/products/no-existe`): Vercel no puede saber en el build qué slugs existen, así que responde **200** con el shell y la app muestra "Producto no encontrado" con `noindex`. Es un soft 404 marcado. La alternativa, un 404 real, requeriría SSR o una función edge que consulte la API, y queda fuera de alcance.
- **Contenido del catálogo:** los títulos y descripciones de las fichas y el JSON-LD de producto los pone la app con JS. Google los renderiza; otros buscadores o previsualizadores que no ejecutan JS ven el shell neutro, sin canonical engañoso.
- **Routing por lista explícita:** una ruta nueva con parámetros tiene que agregarse a `vercel.json`. Si falta, un test falla.

## 2. Diferencias entre ramas (respecto de `e051a7e`)

| Rama                             | Commits                | Archivos | +/-        | API | Web | Shared | Prisma / migraciones |
| -------------------------------- | ---------------------- | -------- | ---------- | --- | --- | ------ | -------------------- |
| `chore/website-20-point-audit`   | 14                     | 98       | +3150 −188 | 9   | 75  | 1      | **0**                |
| `feature/accessory-multi-color`  | 1                      | 16       | +1198 −10  | 5   | 10  | 1      | **0**                |
| `candidate/web-audit-multicolor` | 15 (+2 merges locales) | 112      | +4348 −198 | 14  | 83  | 2      | **0**                |

- **Solapamiento:** dos archivos, `ProductDetailPage.tsx` y `AdminProductDetailPage.tsx`. Hubo un único conflicto, en el selector de variantes: se conservó el evento `select_variant` de la auditoría **y** `showAvailability` de multicolor.
- **Lo que no entra:** ninguna de las dos ramas toca la ruleta, Payments V1 ni Virtual Try-On (0 archivos), y ninguna trae migraciones. Las ramas `feature/prize-wheel`, `feature/payments-v1` y `spike/virtual-try-on-*` **no se integraron**.
- **Cambios de API:**
  - auditoría: `GET /api/auth/session` y `GET /sitemap.xml`, solo lectura;
  - multicolor: endpoints de admin para los colores de accesorios, sobre el modelo de variantes existente.

## 3. Estrategia de integración (recomendada)

Las dos ramas avanzan la rama comercial **por fast-forward**, sin force push. Ambas condiciones están verificadas con `git merge-base --is-ancestor`.

1. **Paso A, auditoría:** `origin/feature/cloudinary-staging-readiness` avanza `e051a7e → 2adbc75`. Es un fast-forward, porque `e051a7e` es ancestro.
2. **Verificar en producción** (§7) y dejar correr al menos un día.
3. **Paso B, multicolor:** avanza `2adbc75 →` la punta del candidato (código de `dffd49a`). También es fast-forward, porque el candidato contiene a `2adbc75`. Lo que se despliega es **exactamente el commit probado** en §5.

**Por qué en dos pasos y no uno:**

- Cada paso se puede revertir solo.
- La auditoría cambia el routing de Vercel, que es el riesgo principal; multicolor cambia el admin.
- Si algo falla, se sabe de qué lado viene.

El paso B ya está probado sobre la auditoría, así que no hay una combinación sin probar.

**Alternativa:** un solo fast-forward a la punta del candidato. Es válida (está probada), con más radio de impacto y un rollback que revierte las dos cosas juntas.

## 4. Documentos legales

| Documento   | Estado del texto                                      | Datos faltantes                                                       | En el sitio publicado |
| ----------- | ----------------------------------------------------- | --------------------------------------------------------------------- | --------------------- |
| Aviso legal | Borrador completo salvo los datos del titular         | Razón social, CUIT, domicilio legal o fiscal, email                   | **No** (404)          |
| Privacidad  | Borrador (Ley 25.326) basado en lo que el código hace | Razón social y CUIT, plazos de conservación, ubicación de proveedores | **No** (404)          |
| Cookies     | Texto completo, verificado contra el código           | Ninguno; solo falta la aprobación                                     | **No** (404)          |

El detalle, las preguntas para el asesor y el procedimiento de aprobación están en [legal-pending-data.md](legal-pending-data.md).

## 5. Resultados de pruebas (rama candidata `dffd49a`)

### Gates

| Gate                              | Resultado                                                        |
| --------------------------------- | ---------------------------------------------------------------- |
| `npm run format` (Prettier)       | OK                                                               |
| `npm run lint`                    | OK                                                               |
| `typecheck:api` / `typecheck:web` | OK                                                               |
| `build:api` / `build:web`         | OK (la guarda anti-borradores pasa, sin `[[PENDIENTE` en `dist`) |
| `db:validate` (Prisma)            | OK                                                               |
| `test:api`                        | **400/400**                                                      |
| `test:web`                        | **350/350**                                                      |

### Suites Chromium: clasificación de las fallas previas y resultado final

| Suite             | Antes (rama de auditoría) | Clasificación                                                                                                                                                                                                                                                                                                                                                                                | Acción                                                                                                                                                   | Candidato |
| ----------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `review2_e2e`     | 9/10                      | **Test desactualizado.** Exigía 401 de `/me` y `/refresh` para un visitante; `f838d6f` reemplazó eso a propósito por un único `200 /api/auth/session`, cubierto por tests de API y web.                                                                                                                                                                                                      | Se actualizó solo ese check, y quedó **más estricto**: lista exacta de llamadas de auth y 0 respuestas ≥400.                                             | **10/10** |
| `accessories_e2e` | 4/12 (igual en `e051a7e`) | **Depende de una funcionalidad no integrada.** La suite se actualizó para multicolor ("Colores y presentaciones").                                                                                                                                                                                                                                                                           | **Ninguna.** Con multicolor integrado pasa sin cambios.                                                                                                  | **12/12** |
| `order_e2e`       | 8/10 (igual en `e051a7e`) | **Test desactualizado.** Se escribió el 10-10 a las 22:01; a las 22:37, `4f825af` ("la principal siempre primera") cambió dos comportamientos a propósito:<br>• si la flecha queda bloqueada detrás de la principal, el foco pasa a la otra flecha;<br>• marcar como principal sube la foto, y el mensaje al eliminar nombra a la nueva principal.<br>Ambos están documentados en el código. | Se actualizaron esas dos expectativas. La del borrado ahora **codifica la regla** (se promueve la segunda del orden vigente) en lugar de un nombre fijo. | **10/10** |
| `colors_e2e`      | — (multicolor)            | —                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                        | **12/12** |
| `img_e2e_traced`  | 19/19                     | —                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                        | **19/19** |
| `primary_e2e`     | 11/11                     | —                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                        | **11/11** |
| `phase2_e2e`      | 15/15                     | —                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                        | **15/15** |
| `fixes_e2e`       | 11/11                     | —                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                        | **11/11** |
| `auth_e2e`        | 17                        | —                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                        | **17/17** |
| `acc_fit_e2e`     | —                         | —                                                                                                                                                                                                                                                                                                                                                                                            | —                                                                                                                                                        | **11/11** |

- **Regresiones reales encontradas:** ninguna.
- **Problemas de entorno** (no son del producto):
  - el worktree de base tuvo fuentes en 403 por el `node_modules` enlazado;
  - el emulador en `127.0.0.1:5180` no está en el CORS local, así que la verificación de fichas se hizo con el snapshot;
  - `pkill -f` terminó la propia shell.
- **Las suites e2e no están en el repo:** son scripts de QA locales. Las versiones originales se conservan junto a las actualizadas (`*.orig.py`) para auditar el cambio.
- **No se desactivó ni se salteó ningún check.**

### Accesibilidad, responsive, enlaces y SEO (candidato)

- **axe-core 4.10.3**, 15 páginas en tema claro y oscuro: **0 violaciones**.
- **Responsive** a 320, 375, 390, 768, 1280 y 1440 px: sin overflow ni controles recortados; **0 errores de consola**.
- **Enlaces:**
  - 26 páginas internas rastreadas en dev, con las legales visibles porque es el modo de revisión: **0 enlaces que terminen en 404**;
  - 17 externos (wa.me y Google Maps), todos 200.
- **Build de producción:** footer sin links legales y `/aviso-legal` con 404.
- **Matriz SEO/routing:** §1.

## 6. Plan de Vercel Preview (requiere autorización para el push)

1. **Qué publicar:**
   - `git push origin chore/website-20-point-audit` (paso A);
   - más adelante, `candidate/web-audit-multicolor` (paso B).
   - Son ramas **nuevas** en el remoto. Vercel genera un preview por rama automáticamente; Railway despliega solo su rama configurada, así que **no toca la API ni producción**.
2. **Limitaciones conocidas del preview:**
   - **SSO:** las URLs de preview están detrás de Vercel Authentication (302). Para verificarlas automáticamente hace falta un secreto de **Protection Bypass for Automation**, que se crea en la configuración del proyecto y es decisión del dueño. Sin él, la verificación es manual en el navegador, con la sesión de Vercel iniciada.
   - **CORS:** la URL del preview no está en `CORS_ORIGINS` de la API, así que el catálogo no cargará en el preview. **No se propone cambiar el CORS** (es un cambio de infraestructura que dispara un redeploy de la API). El preview se usa solo para lo que no se puede probar localmente: routing, headers, 404 y HTML. El comportamiento con datos ya está probado en local (§5).
   - **Robots:** Vercel agrega `X-Robots-Tag: noindex` a todo preview, así que la columna de robots no es representativa ahí; se verifica en producción.
   - **Sitemap:** `/sitemap.xml` del preview hace proxy a la API de producción, que todavía no tiene el endpoint, así que dará 404 hasta que se despliegue la API (paso A en producción).
3. **Checklist** (`VERCEL_BYPASS=<secreto> python3 vercel_matrix.py https://<preview>`, o a mano):
   - `/esta-pagina-no-existe`, `/aviso-legal`, `/privacidad`, `/cookies` → **404**;
   - `/products/<slug>` y `/accesorios/<slug>` recargados → 200, sin canonical en el HTML;
   - `/login` y `/admin` → `noindex` en meta y header;
   - `/robots.txt` → text/plain;
   - headers de seguridad presentes;
   - `/accesorios.html` → 308.

## 7. Plan de publicación (requiere autorización explícita)

1. Preview verificado (§6).
2. **Paso A:** `git push origin chore/website-20-point-audit:feature/cloudinary-staging-readiness`. Es fast-forward, **sin `--force`**. Railway y Vercel despliegan los dos.
   - Durante los minutos en que la web nueva convive con la API vieja, la web cae a `/me` (fallback probado) y `/sitemap.xml` puede dar 404. No hay migraciones; `prisma migrate deploy` no aplica nada.
3. **Verificar en producción:**
   - `railway deployment list` muestra el SHA `2adbc75`;
   - `GET /api/auth/session` → `{"user":null,"canRefresh":false}`;
   - `GET https://www.solucionesopticas.com.ar/sitemap.xml` → XML;
   - la matriz de §6 contra www;
   - Lighthouse comparado con el informe de 20 puntos (§4.1);
   - una visita anónima → una sola llamada de auth, 200;
   - las 6 fichas de accesorios cargan.
4. **Search Console:** enviar el sitemap (acción manual).
5. **Paso B**, al día siguiente o después: fast-forward a la punta del candidato y verificar:
   - el admin de colores en un accesorio de prueba **creado y borrado solo si el dueño lo autoriza**;
   - las fichas públicas sin cambios para los accesorios de un solo color.

## 8. Plan de rollback

- **Web:** en Vercel, "Promote to Production" del deployment anterior (`e051a7e`, o `2adbc75` si el problema es del paso B). Es instantáneo.
- **API:** en Railway, "Redeploy" del deployment anterior. No hay cambios de esquema, así que la base no necesita reversión. Los endpoints nuevos son de solo lectura (auditoría) o de admin (multicolor).
- **Git:** la rama comercial se puede devolver por un push normal de un commit de revert. **Nunca** con `--force`, salvo autorización expresa.
- **Datos:** multicolor solo crea variantes cuando el admin lo usa. Si se revierte después de usarlo, esas variantes siguen siendo variantes válidas del modelo existente, sin pérdida.

## 9. GO / NO-GO

- **Preview: GO técnico, pendiente de tu autorización para el push.** El candidato y la rama de auditoría pasan todos los gates y suites, y el routing está verificado por emulación.
  - Falta decidir si se crea el bypass de SSO o si la verificación se hace a mano.
- **Producción: NO-GO por ahora.** Se habilita cuando se cumpla todo esto:
  1. autorización explícita;
  2. el checklist del preview (§6) en verde sobre Vercel real, sobre todo el 404 real y la recarga de fichas;
  3. publicar primero el paso A y verificarlo en producción antes del paso B.
- **Documentos legales:** se publican aparte, cuando estén aprobados ([legal-pending-data.md](legal-pending-data.md)). No bloquean.
