# Runbook — Accesorios Fase 1 (ADR-0028) en staging

Procedimiento para publicar la migración `20261011150000_add_accessory_catalog` y el código de
accesorios en dos pasos (commit A: base + API; commit B: web). **Cada paso remoto requiere
autorización explícita.** Nunca se imprimen ni se guardan credenciales: los comandos remotos leen las
variables del propio contenedor.

## 0. Datos de referencia (verificados en solo lectura, 2026-10-11)

- PostgreSQL 18.6 (Railway, servicio `Postgres`), base de ~9 MB.
- `_prisma_migrations`: 6 migraciones aplicadas, ninguna fallida; la última es
  `20260913045017_add_shipping_foundation`.
- No existen todavía `ProductKind`, `AccessoryRole`, `products.kind|accessory_role|sold_individually`,
  `product_variants.label`, `products_kind_idx` ni los tres CHECK.
- La migración es aditiva: sin DROP/DELETE/UPDATE/RENAME; `kind` entra con `DEFAULT 'FRAME'`.

## 1. Backup previo (PostgreSQL 18)

**Qué toca Railway este paso:** solo `pg_dump`, lecturas con
`default_transaction_read_only=on`, `base64` y el borrado del archivo temporal propio. Ningún comando
de restauración apunta jamás a Railway: `pg_restore` se ejecuta únicamente con `docker exec` dentro del
contenedor local descartable del paso 2.

**Consistencia con datos cambiando:** `pg_dump` lee toda la base en una única instantánea
(`REPEATABLE READ`), así que el dump es consistente aunque Roberto edite durante la copia. Para poder
comparar conteos se toman **antes y después** del dump: si coinciden, nada cambió en el medio y el
dump debe tener exactamente esos conteos; si difieren, repetir el paso 1 (o pedir a Roberto una pausa
de un par de minutos).

**Destino:** fuera del repositorio, del scratchpad y de cualquier carpeta sincronizada, por ejemplo
`~/backups-privados/soluciones-opticas/` (permisos `700`). El dump contiene datos personales (cuentas
de clientes): queda cifrado, el claro se borra con `shred` y el cifrado se elimina al cerrar la fase.

```bash
set -euo pipefail
umask 077
DEST=~/backups-privados/soluciones-opticas; mkdir -p "$DEST"; chmod 700 "$DEST"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
F="$DEST/pre0028-$STAMP"

# Conteo exacto de TODAS las tablas de public (mismo SQL en producción y en la restauración).
COUNT_SQL="select table_name || '|' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I', table_name), false, true, '')))[1]::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1"
prod_counts() {
  railway ssh --service Postgres -- sh -c "PGOPTIONS='-c default_transaction_read_only=on' \
    psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -At -c \"$COUNT_SQL\"" | tr -d '\r'
}

# 1.a Conteos ANTES.
prod_counts > "$F.counts.before"

# 1.b Dump (formato custom) dentro del contenedor + hash remoto.
railway ssh --service Postgres -- sh -c '
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/pre0028.dump &&
  sha256sum /tmp/pre0028.dump' | tr -d '\r' | awk '{print $1}' > "$F.sha256.remote"

# 1.c Conteos DESPUÉS. Si difieren de ANTES, borrar todo y repetir el paso 1.
prod_counts > "$F.counts.after"
diff "$F.counts.before" "$F.counts.after" && echo "sin cambios durante el dump"

# 1.d Transferencia en base64 (railway ssh puede asignar TTY y corromper binario) + hash local.
railway ssh --service Postgres -- sh -c 'base64 -w0 /tmp/pre0028.dump' | tr -d '\r' \
  | base64 -d > "$F.dump"
sha256sum "$F.dump" | awk '{print $1}' > "$F.sha256.local"
diff "$F.sha256.remote" "$F.sha256.local" && echo "hash idéntico"

# 1.e Borrar el temporal del contenedor (contiene datos personales).
railway ssh --service Postgres -- sh -c 'rm -f /tmp/pre0028.dump && ls /tmp/pre0028.dump 2>/dev/null || echo borrado'
```

## 2. Verificación: restauración aislada y descartable

```bash
pg_restore --list "$F.dump" > /dev/null && echo "catálogo legible"   # requiere cliente 18, o:
docker run --rm -i postgres:18 pg_restore --list < "$F.dump" > /dev/null && echo "catálogo legible"

docker run --rm -d --name so-restore-check -e POSTGRES_PASSWORD="$(openssl rand -hex 16)" \
  -p 127.0.0.1:5499:5432 postgres:18
until docker exec so-restore-check pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
docker exec -i so-restore-check pg_restore -U postgres -d postgres --no-owner --no-acl --exit-on-error \
  < "$F.dump" && echo "restauración sin errores"
docker exec so-restore-check psql -U postgres -d postgres -At -c "$COUNT_SQL" > "$F.counts.restore"
diff "$F.counts.before" "$F.counts.restore" && echo "conteos idénticos"
docker exec so-restore-check psql -U postgres -d postgres -At \
  -c "select count(*) from _prisma_migrations where finished_at is not null"   # 6
docker rm -f so-restore-check                                                  # descartar
```

El backup es válido solo si: los conteos ANTES/DESPUÉS coinciden, el hash remoto y el local son
idénticos, `pg_restore --exit-on-error` termina sin errores y los conteos restaurados son idénticos.

### 2.1 Cifrado y custodia

```bash
gpg --symmetric --cipher-algo AES256 --output "$F.dump.gpg" "$F.dump"   # passphrase por pinentry
gpg --decrypt "$F.dump.gpg" | sha256sum | awk '{print $1}' | diff - "$F.sha256.local" \
  && echo "el cifrado descifra al mismo dump"
shred -u "$F.dump"                                    # nunca queda el claro en disco
sha256sum "$F.dump.gpg" > "$F.dump.gpg.sha256"
```

La passphrase se guarda en el gestor de contraseñas, nunca junto al archivo. Fecha de eliminación del
cifrado: al cerrar la Fase 1 (o la retención que se decida).

## 3. Publicación escalonada

Commits: **A = `c905ecc`** (migración + API + contratos; la web es la anterior y compila) y **B = el
commit siguiente, HEAD de `feature/accessories-catalog`** (interfaz + documentación).

1. Push de `feature/accessories-catalog` y fast-forward de `feature/cloudinary-staging-readiness` **a A**
   → Railway ejecuta el predeploy `prisma migrate deploy` y publica la API; Vercel publica la web
   anterior (compatible).
2. Verificar antes de seguir:
   - Railway `SUCCESS` con `meta.commitHash` = A (`railway deployment list --json`).
   - Log del deploy: `Applying migration 20261011150000_add_accessory_catalog` y
     `All migrations have been successfully applied`.
   - `_prisma_migrations`: 7 filas terminadas (solo lectura).
   - `GET /api/health` → `ok`; `GET /api/products` → los mismos productos que antes, todos
     `kind: "FRAME"`; `GET /api/products?kind=ACCESSORY` → lista vacía.
   - Vercel `success` con A y la tienda igual que antes.
3. Recién entonces fast-forward **a B** → Vercel `success` con B (API de deployments de GitHub) y
   `www` y el alias sirviendo el mismo bundle nuevo. Railway redeploya la API sin migraciones nuevas.

## 4. Smoke tests (sin crear datos reales)

- `/products`: mismos productos e imágenes que antes; fichas con medidas; precio sin "Desde".
- `/accesorios`: estado vacío con WhatsApp; el header muestra "Accesorios" sin desborde.
- Admin (Roberto o la desarrolladora, sin guardar): dashboard con "Anteojos activos" y
  "Accesorios activos"; listado con filtro "Mostrar"; alta con "Anteojo / Accesorio"; la carga y el
  orden de fotos de un anteojo existente se ven igual (sin subir ni borrar nada).

## 5. Si algo falla

| Situación                      | Acción                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Falla el predeploy (migración) | Railway mantiene el contenedor anterior. No redeployar a ciegas. Inspeccionar en solo lectura qué objetos existen (tipos, columnas, índice, CHECK). Con autorización: quitar a mano los objetos parciales en una transacción, `npx prisma migrate resolve --rolled-back 20261011150000_add_accessory_catalog`, corregir y volver a desplegar. |
| API nueva (A), web vieja       | Es el estado previsto entre los pasos 1 y 3: compatible.                                                                                                                                                                                                                                                                                      |
| Web nueva, API vieja           | No debería ocurrir con este orden. Si ocurre: Instant Rollback de Vercel y volver al paso 1.                                                                                                                                                                                                                                                  |
| Error de código tras publicar  | Redeploy de `4f825af` (Railway) e Instant Rollback (Vercel). **No** requiere tocar la base: la API vieja ignora las columnas nuevas y sus inserciones cumplen los CHECK (todo entra como `FRAME`). Si ya se cargaron accesorios, darlos de baja antes: la API vieja los mostraría como anteojos.                                              |
| Pérdida o corrupción de datos  | Único caso para restaurar el backup del paso 1 sobre la base (destructivo: se pierde lo cargado después). Requiere autorización explícita y un plan aparte; nunca se hace como parte de las pruebas.                                                                                                                                          |

Lo que **no** revierte un redeploy: la migración (columnas, tipos, CHECK). Deshacerla es SQL manual
(`ALTER TABLE … DROP CONSTRAINT/COLUMN`, `DROP TYPE`) previa verificación de que no haya accesorios.
