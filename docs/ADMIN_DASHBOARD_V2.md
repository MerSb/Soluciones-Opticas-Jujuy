# Admin Dashboard V2

Scope, exact metric/alert definitions, and known limitations for `/admin`'s new landing page. No
schema changes were needed for any of it.

## Objetivo

Convertir `/admin` en una herramienta operativa real: al entrar, el equipo ve de inmediato qué
está activo, qué necesita atención (sin stock, sin imagen) y tiene accesos directos a las tareas
más comunes — en vez de aterrizar directamente en la lista de productos sin contexto.

Explícitamente fuera de alcance en esta fase: ventas, caja, facturación, ARCA, Mercado Pago,
turnos, reservas, compras, proveedores, multi-sucursal, auditoría avanzada, gráficos históricos,
reportes exportables, notificaciones push.

## Arquitectura

Mismo patrón que el resto de `/api/admin/*` (ver ADR-0021): routes → controllers → services →
Prisma, sin repository layer. `GET /api/admin/dashboard` se monta en `adminRouter`
(`apps/api/src/routes/admin/index.ts`), que ya aplica `authenticate` + `authorize("ADMIN")` a todo
lo que cuelga de él — la ruta nueva no repite esos middlewares.

Frontend: `AdminLayout` (ya existente) gana un ítem de navegación "Dashboard"; el índice de
`/admin` pasó de un `<Navigate to="/admin/products" />` a renderizar `AdminDashboardPage`
directamente. `useAdminDashboardQuery()` (`apps/web/src/services/queries/admin-dashboard.ts`,
key `["admin", "dashboard"]`) sigue el mismo patrón que `useAdminBrandsQuery`/
`useAdminProductsQuery` — sin gate manual de rol en el hook, porque `AdminRoute` ya garantiza que
solo un ADMIN autenticado llega a renderizar la página.

## Endpoint

```
GET /api/admin/dashboard
```

Requiere `authenticate` + `authorize("ADMIN")` (heredados del router padre). Respuesta:

```ts
interface AdminDashboardResponse {
  metrics: {
    activeProducts: number;
    outOfStockProducts: number;
    productsWithoutImages: number;
    activeBrands: number;
    activeCategories: number;
    registeredUsers: number;
  };
  alerts: {
    outOfStock: { id: string; name: string; brandName: string }[];
    withoutImages: { id: string; name: string; brandName: string }[];
  };
}
```

Nunca modelos Prisma crudos. Cada item de alerta es exactamente `{id, name, brandName}` —
seleccionado explícitamente (`select`), nunca un `findMany()` completo recortado en memoria.

## Definición exacta de cada KPI

- **activeProducts**: `Product` con `deletedAt: null`. No existe un flag de "publicado" separado
  del soft-delete en el schema actual, así que no se inventó uno.
- **outOfStockProducts**: `Product` activo cuyo conjunto de variantes no tiene ninguna con
  `stock > 0` — Prisma: `variants: { none: { stock: { gt: 0 } } }`. Un producto **sin variantes**
  cae en esta definición (vacuously true), consistente con `computeInStock([]) === false`
  (`apps/api/src/lib/product-availability.ts`, reutilizado como fuente conceptual de verdad, no
  reimplementado como filtro Prisma aparte).
- **productsWithoutImages**: `Product` activo donde ninguna de sus variantes tiene ninguna
  `ProductImage` — Prisma: `variants: { none: { images: { some: {} } } } }`. Es un KPI a nivel
  **producto**, no variante: un producto con una variante sin imagen pero otra variante con
  imagen **no** cuenta acá (cubierto explícitamente por un test — ver más abajo). Igual que el
  anterior, un producto sin variantes cae en esta definición.
- **activeBrands** / **activeCategories**: `Brand`/`Category` con `deletedAt: null`. Mismo
  razonamiento que `activeProducts` — no hay otro flag de estado.
- **registeredUsers**: `User` con `deletedAt: null`, **sin filtrar por rol** — incluye tanto
  `CUSTOMER` como `ADMIN`. Representa "usuarios registrados en el sistema", no una métrica
  comercial de clientes. El DTO nunca expone email, password hash, rol ni ningún otro dato por
  usuario — solo el número total. Si un futuro milestone necesita una métrica comercial
  (clientes reales, sin cuentas de staff), se agregará como un KPI separado
  (`registeredCustomers`), no redefiniendo este.

## Definición exacta de las alertas

Listas de como máximo 5 productos cada una, ordenadas por `name ASC` y luego `id ASC` como
desempate estable. Deliberadamente **no** por `createdAt DESC`: la fecha de creación del producto
no representa cuándo apareció el problema de stock o imagen (no existe ese timestamp en el
schema), así que usarla transmitiría una prioridad falsa. El orden alfabético es neutral.

- `alerts.outOfStock`: mismo filtro que `outOfStockProducts`, `take: 5`.
- `alerts.withoutImages`: mismo filtro que `productsWithoutImages`, `take: 5`.

Ambas excluyen productos soft-deleted (`deletedAt: null`, heredado del `where` compartido con su
métrica). Cada item enlaza a la ruta de edición admin ya existente (`/admin/products/:id`) — no
se creó ninguna ruta nueva.

## Reglas de stock (reutilizadas, no reimplementadas)

La fuente conceptual de verdad sigue siendo `computeInStock(variants) => variants.some(v =>
v.stock > 0)`. El dashboard no puede reutilizar literalmente esa función porque necesita un
**agregado a nivel de base de datos** (un `count()`, no traer todas las filas), así que expresa la
misma regla como filtro Prisma (`variants: { none: { stock: { gt: 0 } } }`) — la negación exacta
de "alguna variante tiene stock > 0". Se verificó con tests explícitos que ambas expresiones
coinciden en los cuatro casos relevantes:

- producto sin variantes → sin stock
- todas las variantes en 0 → sin stock
- una variante con stock > 0 → con stock
- variantes mixtas (alguna en 0, alguna > 0) → con stock

## Performance

8 queries independientes (6 `count()`, 2 `findMany({ take: 5, select: {...} })`) resueltas en un
único `Promise.all` — sin N+1, sin `findMany().length`, sin includes innecesarios.

## Seguridad

`GET /api/admin/dashboard` exige `authenticate` + `authorize("ADMIN")` (heredados del router
padre, verificados por tests: 401 sin sesión, 403 para `CUSTOMER`, 200 para `ADMIN`). El frontend
nunca confía solo en el guard de `AdminRoute` — la protección real es la del backend. El DTO nunca
expone email/password hash/rol/ids de otros usuarios; `registeredUsers` es exclusivamente un
número.

## Responsive

Grid de métricas: 1 columna en mobile, 2 en tablet (`sm:`), 3 en desktop (`lg:`). Alertas: 1
columna en mobile/tablet, 2 en desktop (`lg:`) — cada lista se apila verticalmente dentro de su
tarjeta sin overflow horizontal. Verificado por inspección de las clases Tailwind aplicadas contra
los breakpoints pedidos (320/375/768/1024/1440px); no se agregó un breakpoint custom porque los
estándar de Tailwind (`sm`/`lg`) ya cubren los saltos de layout necesarios.

## Accesibilidad

- Jerarquía de encabezados correcta: `AdminLayout` ya renderiza el único `<h1>`
  ("Panel de administración") de la sección; `AdminDashboardPage` usa `<h2>` para "Resumen"
  (visualmente oculto, `sr-only` — la grilla de métricas ya es autoexplicativa visualmente pero
  necesita un landmark para lectores de pantalla), "Alertas operativas" y "Accesos rápidos", y
  `<h3>` para cada subsección de alerta ("Productos sin stock" / "Productos sin imagen").
- Cada acceso rápido y cada "Editar" de alerta es un `<Link>` real (navegable, indexable), nunca
  un `div` con `onClick`.
- El error del dashboard usa `role="alert"` (vía `StatusMessage`, componente ya existente).
- Los skeletons de carga son `aria-hidden="true"` (decorativos), mismo patrón que el resto del
  sitio.
- No se agregó `aria-label` donde el texto visible ya es suficientemente descriptivo.

## Tests

**Backend** (`apps/api/test/admin/dashboard.test.ts`, 16 tests): auth (401/403/200), forma exacta
del DTO, ausencia de datos sensibles, cada métrica comparada contra un `prisma.count()`
independiente disparado en paralelo (no un delta before/after — ver el comentario en el archivo:
otros archivos de test corren en paralelo contra la misma base de datos de desarrollo, así que un
delta que abarca un round-trip de mutación queda expuesto a lo que esos archivos estén haciendo en
ese instante; comparar contra un conteo directo disparado en el mismo `Promise.all` reduce esa
ventana a milisegundos), los 6 casos de semántica stock/imagen del punto anterior, el tope de 5 +
orden alfabético de las alertas, y exclusión de soft-deleted. Cleanup por IDs capturados en
creación — nunca por nombre mutable.

**Frontend** (`apps/web/test/admin-dashboard-page.test.tsx`, 6 tests): render de métricas y
alertas reales, loading (sin números inventados ni stale), error con mensaje claro + retry (sin
stack traces ni códigos internos), estados vacíos con mensaje positivo específico (la sección no
desaparece), enlaces de accesos rápidos y de "Editar" apuntando a las rutas reales. El guard de
`/admin/*` no se duplicó acá — ya está cubierto genéricamente por `admin-route.test.tsx`, que
protege cualquier ruta hija de `AdminRoute`, no solo el dashboard.

## Limitaciones conocidas

- Las alertas son una muestra fija de 5, no paginada — un catálogo con muchos más de 5 productos
  problemáticos solo muestra los primeros 5 alfabéticamente. Aceptado explícitamente: el objetivo
  es un vistazo operativo rápido, no un reporte completo (fuera de alcance en esta fase).
- `registeredUsers` no distingue clientes de staff. Es una decisión deliberada (ver arriba), no un
  descuido.
- Un producto sin variantes cuenta como "sin stock" y "sin imagen" simultáneamente. Es coherente
  con el resto del sistema (`computeInStock([]) === false`), no un caso especial inventado para
  este dashboard.

## Deuda técnica pendiente (no tocada en esta fase)

`apps/api/test/admin/{brands,categories,products}.test.ts` siguen limpiando sus fixtures por
nombre mutable (`startsWith`) en vez de por id — documentado por primera vez durante Customer
Experience V2 y todavía sin corregir. Se evaluó nuevamente en esta fase: el fix real toca ~15+
puntos de creación solo en `products.test.ts`, más los de los otros dos archivos, así que no
califica como "pequeño y aislado" y se dejó fuera de alcance, tal como se decidió la vez anterior.
Los tests nuevos de este milestone (`admin/dashboard.test.ts`, y el resto de los agregados en esta
fase) sí limpian exclusivamente por id.

Además, se observó (no introducido por este milestone, patrón preexistente) que corridas completas
de `npm run test:api` pueden fallar de forma intermitente por una condición de carrera entre
archivos: `apps/api/test/admin/products.test.ts` tiene regresiones que deliberadamente mutan el
`shape`/`stock` del producto sembrado `andina-aviador` para probar que el motor de recomendación
reacciona en tiempo real, y esa mutación concurrente puede coincidir exactamente con el "dos
requests seguidos deben ser idénticos" que varios otros archivos verifican sobre ese mismo
producto — confirmado en ambos: `apps/api/test/related-products.test.ts` y
`apps/api/test/recommendations.test.ts`, cada uno bajo su propio test "produces stable,
deterministic output across repeated requests". Ambos archivos pasan de forma aislada; en 5
corridas completas de la suite durante este milestone, cada uno flakeó una vez, en corridas
distintas, nunca junto con un fallo real de `admin/dashboard.test.ts`. Es un flake preexistente de
la suite (mismo origen: fixtures compartidos y mutables en el catálogo sembrado), no introducido ni
corregido en este milestone — los tests nuevos de este milestone usan exclusivamente productos
propios, nunca el catálogo sembrado, precisamente para no sufrir ni agravar este problema.
