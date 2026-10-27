# Integración: edición de SKU con la rama de seguridad de Cloudinary

La rama `fix/editar-sku-variante` (edición de SKU de variantes) sale de `5503ffb`, igual que la
rama de fotos. La rama `fix/cloudinary-public-id-seguridad` se apoya en la de fotos y agrega una
regla nueva: una foto solo se registra si su `cloudinaryPublicId` está en la carpeta de su variante
(`lib/image-ownership.ts`). Al juntarlas hacen falta dos ajustes, ambos verificados con
`git merge-tree` el 2026-10-27 (sin hacer el merge).

## 1. Conflicto de texto en `docs/API.md`

La rama de Cloudinary reacomodó el ancho de toda la tabla de endpoints de admin, y la rama de SKU
cambió la fila `PATCH /api/admin/products/:id/variants/:variantId`. Resolución: quedarse con la
tabla de la rama de Cloudinary y volver a escribir solo esa fila con la nota del SKU (actualización
parcial; `sku` sin espacios a los bordes, 1–100 caracteres, solo cambia el código —id, stock y fotos
se conservan—; repetido → `409`). Después, `npx prettier --write docs/API.md`.

## 2. Test de la API con un `public_id` que la regla nueva rechaza

`apps/api/test/admin/products.test.ts`, test _"corrects a mistyped SKU in place, keeping the
variant, its stock and its photos"_, registra la foto con `cloudinaryPublicId: "test/sku-fix"`.
Git lo fusiona sin conflicto, pero con la regla nueva ese id se rechaza y el test falla. Cambiarlo
por el helper que la rama de Cloudinary ya usa en ese mismo archivo:

```ts
cloudinaryPublicId: testPublicId("sku-fix", productId, variant.body.id),
```

## Después del merge

- Correr la suite completa de la API y de la web sobre la rama combinada (base descartable).
- `apps/web/src/pages/admin/AdminVariantsEditor.tsx` se fusiona solo; comprobar que cada ficha
  tenga a la vez `<VariantSkuEditor …>` (SKU) y `altBase={photoAltBase(…)}` (fotos).

## Tarea aparte: SKU único sin distinguir mayúsculas

No forma parte de esta integración. El índice `product_variants_sku_key` compara el texto exacto,
así que hoy `ABC` y `abc` pueden convivir. La propuesta está en
[DATABASE_DESIGN.md](DATABASE_DESIGN.md). Producción todavía no se revisó, y hay que revisarla en un
backup reciente antes de cualquier migración. Cuando se cambie el índice, hay que invertir el test
_"currently accepts a SKU that differs from another only in letter case"_.
