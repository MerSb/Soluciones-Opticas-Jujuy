import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AdminProductDetail,
  AdminVariantDto,
  AccessoryRole,
  ColorTone,
  CreateProductRequest,
  CreateVariantsBatchRequest,
  ProductKind,
  SetProductLensTypesRequest,
} from "@soluciones-opticas/shared";
import { FormField } from "../../components/forms/FormField";
import { ShapeSelect } from "../../components/admin/ShapeSelect";
import type { PhotoCandidate, PhotoUploadStatus } from "../../components/admin/PhotoSequencePicker";
import { ApiClientError, apiPost, apiPut } from "../../services/api-client";
import { useAdminLensTypesQuery } from "../../services/queries/admin-lens";
import { LensTypeChecklist } from "./LensTypeChecklist";
import { ACCESSORY_ROLE_OPTIONS, accessoryRoleUsage } from "../../lib/accessories";
import { toneLabel } from "../../lib/color-tones";
import { FRAME_MATERIAL_OPTIONS } from "../../lib/optical-profile-taxonomy";
import {
  EMPTY_PROGRESS,
  hasPendingChanges,
  newDraftVariant,
  type DraftProgress,
  type DraftVariant,
  type ProductDraftFields,
} from "../../lib/product-drafts";
import { ColorChoice } from "./ColorChoice";
import { DraftVariantRow } from "./DraftVariantRow";
import {
  invalidateProduct,
  uploadProductImage,
  useSimilarProductsQuery,
} from "../../services/queries/admin";

// One tab of the multi-tab new-product page: the same basic fields as the
// single form, plus its variants (docs/COLORES.md), added one at a time with
// one simple form — color (one dot of the palette, or «Combinado»),
// material, SKU and stock — each with its own photos. Saving runs the
// existing endpoints in order — product, its variants (one atomic batch),
// each variant's photos — and remembers what is already created, so a
// retry continues from there and never creates anything twice.

export interface DraftTabState {
  fields: ProductDraftFields;
  progress: DraftProgress;
  photoCount: number;
  dirty: boolean;
  saved: boolean;
  saving: boolean;
}

interface Option {
  id: string;
  name: string;
}

interface Props {
  initialFields: ProductDraftFields;
  initialProgress?: DraftProgress;
  /** Photos that were chosen before a reload and could not be restored. */
  lostPhotoCount?: number;
  /** Per variant, photos already uploaded before a reload (on the server, not in this list). */
  previouslyUploadedPhotos?: number[];
  brands: Option[];
  categories: Option[];
  includedSurchargeText: string | null;
  onChange: (state: DraftTabState) => void;
  onSaved: (productId: string) => void;
}

const NETWORK_ERROR = "No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.";

function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.status < 500 ? error.message : fallback;
  if (error instanceof TypeError) return NETWORK_ERROR;
  return fallback;
}

export function AdminProductDraftForm({
  initialFields,
  initialProgress = EMPTY_PROGRESS,
  lostPhotoCount = 0,
  previouslyUploadedPhotos = [],
  brands,
  categories,
  includedSurchargeText,
  onChange,
  onSaved,
}: Props) {
  const queryClient = useQueryClient();
  const id = useId();
  const [fields, setFields] = useState<ProductDraftFields>(initialFields);
  const [progress, setProgress] = useState<DraftProgress>(initialProgress);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Double-click guard: state updates are not synchronous.
  const savingRef = useRef(false);
  const progressRef = useRef(progress);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  // Each color's photos live in its row (numbered by clicking them); the
  // form keeps the chosen ones here, by row key, to upload them in order.
  const photosRef = useRef(new Map<string, PhotoCandidate[]>());
  const [photoCounts, setPhotoCounts] = useState<Record<string, { chosen: number; all: number }>>(
    {},
  );
  // The photo whose upload failed after being signed, with the public_id
  // it was signed with: it may be saved after all (only the answer lost),
  // so its retry registers that id again (the API saves each one once)
  // before uploading anything, and it can't be unselected meanwhile.
  const unsureRef = useRef<{ key: string; publicId: string } | null>(null);
  const [unsureKey, setUnsureKey] = useState<string | null>(null);
  // The variant being typed, before «Agregar variante» puts it in the list.
  const [newTone, setNewTone] = useState<ColorTone | null>(null);
  const [newMaterial, setNewMaterial] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newStock, setNewStock] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [failedRow, setFailedRow] = useState<number | null>(null);
  const [uploadingRow, setUploadingRow] = useState<number | null>(null);

  const isAccessory = fields.kind === "ACCESSORY";
  // The lens types come from the API (also the ones Roberto adds later);
  // only active ones can be chosen for a new frame.
  const lensTypes = useAdminLensTypesQuery();
  const lensChoices = (lensTypes.data ?? []).filter((type) => !type.deletedAt);
  const productCreated = progress.productId !== null;
  const variantsCreated = progress.variantIds !== null;
  const rows = fields.variants;
  const chosenPhotos = Object.values(photoCounts).reduce((sum, c) => sum + c.chosen, 0);
  const allPhotos = Object.values(photoCounts).reduce((sum, c) => sum + c.all, 0);
  const typingVariant =
    newTone !== null || [newMaterial, newSku, newStock].some((value) => value.trim() !== "");
  const dirty = hasPendingChanges(fields, allPhotos, saved) || (typingVariant && !saved);

  useEffect(() => {
    onChange({ fields, progress, photoCount: chosenPhotos, dirty, saved, saving });
    // onChange is a stable callback from the parent.
  }, [fields, progress, chosenPhotos, dirty, saved, saving]);

  function set<K extends keyof ProductDraftFields>(key: K, value: ProductDraftFields[K]) {
    setSaveError(null);
    setFields((current) => ({ ...current, [key]: value }));
  }

  function setRows(variants: DraftVariant[]) {
    set("variants", variants);
  }

  function updateRow(key: string, patch: Partial<DraftVariant>) {
    setRows(
      fieldsRef.current.variants.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function removeRow(key: string) {
    setRows(fieldsRef.current.variants.filter((row) => row.key !== key));
    photosRef.current.delete(key);
    setPhotoCounts(({ [key]: _gone, ...rest }) => rest);
  }

  const onPhotos = useRef((key: string, photos: PhotoCandidate[], all: number) => {
    photosRef.current.set(key, photos);
    setPhotoCounts((current) =>
      current[key]?.chosen === photos.length && current[key]?.all === all
        ? current
        : { ...current, [key]: { chosen: photos.length, all } },
    );
  }).current;

  function updateProgress(next: DraftProgress) {
    progressRef.current = next;
    setProgress(next);
  }

  function resetNewVariant() {
    setNewTone(null);
    setNewMaterial("");
    setNewSku("");
    setNewStock("");
    setNewError(null);
  }

  // One variant at a time: its color, material, SKU and stock go to the
  // list below, where its photos are chosen; the form is then empty for the
  // next one. A frame may repeat a color (another material), told apart by
  // its SKU; an accessory never repeats one.
  function addVariant() {
    const sku = newSku.trim();
    const problem =
      newTone === null
        ? "Elegí el color en la paleta."
        : sku === ""
          ? "Escribí el SKU."
          : !/^\d+$/.test(newStock.trim())
            ? "Ingresá el stock: un número entero, 0 o más."
            : rows.some((row) => row.sku.trim().toLowerCase() === sku.toLowerCase())
              ? `El SKU «${sku}» ya está en la lista.`
              : isAccessory && rows.some((row) => row.tones.join("+") === newTone)
                ? `${toneLabel(newTone)} ya está en la lista: en un accesorio cada color va una vez.`
                : null;
    if (problem) {
      setNewError(problem);
      return;
    }
    setRows([
      ...rows,
      newDraftVariant([newTone!], toneLabel(newTone!), {
        material: newMaterial.trim(),
        sku,
        stock: newStock.trim(),
      }),
    ]);
    resetNewVariant();
  }

  const lowerSkus = rows.map((row) => row.sku.trim().toLowerCase());
  const repeated = (list: string[], index: number) =>
    list[index] !== "" && list.indexOf(list[index]!) !== index;
  const missing: string[] = [];
  if (!fields.name.trim()) missing.push("el nombre");
  if (!fields.brandId) missing.push("la marca");
  if (!fields.categoryId) missing.push("la categoría");
  if (!fields.basePrice || Number(fields.basePrice) <= 0) missing.push("el precio");
  if (isAccessory && !fields.accessoryRole) missing.push("el tipo de accesorio");
  if (rows.some((row) => !row.sku.trim())) missing.push("el SKU de cada variante");
  if (rows.some((row) => !/^\d+$/.test(row.stock.trim()))) {
    missing.push("el stock de cada variante (número entero, 0 o más)");
  }
  if (lowerSkus.some((_, i) => repeated(lowerSkus, i))) missing.push("SKU distintos");
  // Never lose what is being typed: it goes to the list, or is cleared.
  if (typingVariant && !variantsCreated) {
    missing.push("agregar a la lista la variante que estás cargando («Agregar variante»)");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current || saved || missing.length > 0) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setFailedRow(null);
    let step = "product";
    let rowIndex = -1;
    let photoIndex = -1;
    try {
      let { productId, variantIds, uploadedPhotos, lensTypesSaved } = progressRef.current;
      if (!productId) {
        const body: CreateProductRequest = isAccessory
          ? {
              name: fields.name.trim(),
              brandId: fields.brandId,
              categoryId: fields.categoryId,
              kind: "ACCESSORY",
              accessoryRole: (fields.accessoryRole || undefined) as AccessoryRole | undefined,
              soldIndividually: fields.soldIndividually,
              basePrice: Number(fields.basePrice),
            }
          : {
              name: fields.name.trim(),
              brandId: fields.brandId,
              categoryId: fields.categoryId,
              shape: fields.shape.trim() === "" ? null : fields.shape,
              basePrice: Number(fields.basePrice),
            };
        const product = await apiPost<AdminProductDetail>("/api/admin/products", body);
        productId = product.id;
        updateProgress({ productId, variantIds, uploadedPhotos, lensTypesSaved });
      }
      // Compatible lens types (frames only), with the existing endpoint: it
      // replaces the whole list, so sending it again never duplicates one.
      if (!isAccessory && fields.lensTypeIds.length > 0 && !lensTypesSaved) {
        step = "lenses";
        await apiPut<AdminProductDetail>(`/api/admin/products/${productId}/lens-types`, {
          lensTypeIds: fields.lensTypeIds,
        } satisfies SetProductLensTypesRequest);
        lensTypesSaved = true;
        updateProgress({ productId, variantIds, uploadedPhotos, lensTypesSaved });
      }
      if (rows.length > 0 && !variantIds) {
        step = "variants";
        // All variants in one atomic request: a repeated SKU creates none.
        const body: CreateVariantsBatchRequest = {
          variants: rows.map((row) => ({
            color: row.name.trim(),
            material: row.material.trim() === "" ? null : row.material.trim(),
            ...(row.tones.length > 0 ? { colorTones: row.tones } : {}),
            sku: row.sku.trim(),
            stock: Number(row.stock),
          })),
        };
        const created = await apiPost<AdminVariantDto[]>(
          `/api/admin/products/${productId}/variants/batch`,
          body,
        );
        variantIds = created.map((variant) => variant.id);
        uploadedPhotos = rows.map(() => 0);
        updateProgress({ productId, variantIds, uploadedPhotos, lensTypesSaved });
      }
      for (const [index, row] of rows.entries()) {
        rowIndex = index;
        const list = photosRef.current.get(row.key) ?? [];
        const before = previouslyUploadedPhotos[index] ?? 0;
        for (let p = uploadedPhotos[index] ?? 0; p < list.length; p += 1) {
          step = "photo";
          photoIndex = p;
          setUploadingRow(index);
          const key = list[p]!.key;
          const previous = unsureRef.current?.key === key ? unsureRef.current.publicId : undefined;
          const alt = [fields.name.trim(), row.name.trim(), `foto ${before + p + 1}`]
            .filter(Boolean)
            .join(" — ");
          await uploadProductImage(
            productId,
            variantIds![index]!,
            {
              file: list[p]!.file,
              alt,
              // The first photo of each color is its primary one.
              isPrimary: p === 0 && before === 0,
            },
            (publicId) => {
              unsureRef.current = { key, publicId };
            },
            previous,
          );
          unsureRef.current = null;
          uploadedPhotos = uploadedPhotos.map((n, i) => (i === index ? p + 1 : n));
          updateProgress({ productId, variantIds, uploadedPhotos, lensTypesSaved });
        }
      }
      invalidateProduct(queryClient, productId);
      setSaved(true);
      onSaved(productId);
    } catch (error) {
      const productId = progressRef.current.productId;
      if (productId) invalidateProduct(queryClient, productId);
      if (step === "photo") setFailedRow(rowIndex);
      const rowName = rows[rowIndex]?.name.trim() || "la variante";
      setSaveError(
        step === "product"
          ? describe(error, "No pudimos crear el producto.")
          : step === "lenses"
            ? `El producto se creó, pero no sus cristales compatibles: ${describe(error, "no pudimos guardarlos.")} Reintentá: solo se guardan los cristales, el producto no se vuelve a crear.`
            : step === "variants"
              ? `El producto se creó, pero no sus variantes (no se creó ninguna): ${describe(error, "no pudimos crear las variantes.")}`
              : `El producto y sus variantes se crearon, pero falló la foto ${photoIndex + 1} de ${rowName}: ${describe(error, "no pudimos subir la foto.")}`,
      );
    } finally {
      setUploadingRow(null);
      setUnsureKey(unsureRef.current?.key ?? null);
      savingRef.current = false;
      setSaving(false);
    }
  }

  // Per color: already uploaded photos keep their number; the one being
  // saved shows it; a failed photo that may be saved after all is locked.
  function rowPhotoState(index: number, key: string) {
    const list = photosRef.current.get(key) ?? [];
    const done = progress.uploadedPhotos[index] ?? 0;
    const uploadedKeys = list.slice(0, done).map((p) => p.key);
    const current = list[done]?.key;
    const locked = new Set(uploadedKeys);
    if (unsureKey && list.some((p) => p.key === unsureKey)) locked.add(unsureKey);
    const statuses: Record<string, PhotoUploadStatus> = Object.fromEntries([
      ...uploadedKeys.map((k) => [k, "saved" as const]),
      ...(current && saving && uploadingRow === index ? [[current, "uploading" as const]] : []),
      ...(current && !saving && failedRow === index ? [[current, "failed" as const]] : []),
    ]);
    return { locked, statuses };
  }

  function renderRow(row: DraftVariant, index: number) {
    const { locked, statuses } = rowPhotoState(index, row.key);
    const before = previouslyUploadedPhotos[index] ?? 0;
    const editable = !variantsCreated && !saving;
    return (
      <DraftVariantRow
        key={row.key}
        variant={row}
        heading={`Variante ${index + 1}: ${row.name}${row.tones.length === 0 ? " (fuera de la paleta)" : ""}`}
        editable={editable}
        photosDisabled={saving}
        onChange={(patch) => updateRow(row.key, patch)}
        onRemove={() => removeRow(row.key)}
        onPhotos={onPhotos}
        firstIsPrimary={before === 0}
        existingCount={before}
        locked={locked}
        statuses={statuses}
        skuRepeated={repeated(lowerSkus, index)}
      />
    );
  }

  const newInput =
    "w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text disabled:opacity-60";
  const selectClass =
    "w-full rounded-md border border-border bg-surface-muted px-4 py-2.5 text-text disabled:opacity-60";
  const locked = productCreated || saving;

  if (saved && progress.productId) {
    return (
      <div className="rounded-md border border-border p-4 text-sm text-text">
        <p className="font-semibold text-success">✓ «{fields.name}» guardado.</p>
        <p className="mt-1 text-text-muted">
          {rows.length > 0
            ? `${rows.length} ${rows.length === 1 ? "variante" : "variantes"} (${rows.map((row) => row.name).join(", ")}) y ${chosenPhotos} foto${chosenPhotos === 1 ? "" : "s"}.`
            : "Podés seguir con colores, fotos y estilos en su ficha."}
        </p>
        <Link
          to={`/admin/products/${progress.productId}`}
          className="mt-3 inline-block font-semibold text-primary hover:underline"
        >
          Abrir la ficha del producto
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl space-y-4" noValidate>
      <div>
        <h3 className="font-display text-lg font-semibold text-text">
          {isAccessory ? "Nuevo accesorio" : "Nuevo producto"}
        </h3>
        <p className="mt-1 text-sm text-text-muted">
          {isAccessory
            ? "Cargá los datos básicos. Otros colores o presentaciones, su precio, stock y fotos se pueden cargar después de crearlo."
            : "Cargá los datos básicos. Vas a poder agregar más variantes, imágenes y estilos después de crearlo."}
        </p>
      </div>
      {lostPhotoCount > 0 && (
        <p
          role="status"
          className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-text"
        >
          Recuperamos los datos de este borrador. Las fotos elegidas antes de recargar no se
          conservan: volvé a seleccionarlas
          {previouslyUploadedPhotos.some((n) => n > 0)
            ? ` (ya se habían subido ${previouslyUploadedPhotos.reduce((a, n) => a + n, 0)}; elegí solo las que faltan en cada color)`
            : ""}
          .
        </p>
      )}
      {productCreated && (
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text">
          El producto ya se creó: sus datos básicos se editan en{" "}
          <Link
            to={`/admin/products/${progress.productId}`}
            className="text-primary hover:underline"
          >
            su ficha
          </Link>
          . Acá solo falta terminar lo que quedó pendiente.
        </p>
      )}

      <fieldset disabled={locked}>
        <legend className="mb-1.5 text-sm font-medium text-text">¿Qué vas a crear?</legend>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["FRAME", "Anteojo"],
              ["ACCESSORY", "Accesorio"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm ${
                fields.kind === value ? "border-primary text-primary" : "border-border text-text"
              }`}
            >
              <input
                type="radio"
                name={`${id}-kind`}
                value={value}
                checked={fields.kind === value}
                onChange={() => set("kind", value as ProductKind)}
                className="accent-[var(--color-primary)]"
              />
              {label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-text-muted">No se puede cambiar después de crearlo.</p>
      </fieldset>

      <FormField
        label="Nombre"
        hint="Nombre comercial que ve el cliente: lo que distingue al modelo (forma, color, material, línea). La marca va aparte. Ej.: «Gatito Rosa Metálico Paris»."
        value={fields.name}
        disabled={locked}
        onChange={(e) => set("name", e.target.value)}
        required
      />

      <div>
        <label className="mb-1.5 block text-sm font-medium text-text" htmlFor={`${id}-brand`}>
          Marca
        </label>
        <select
          id={`${id}-brand`}
          value={fields.brandId}
          disabled={locked}
          onChange={(event) => set("brandId", event.target.value)}
          required
          className={selectClass}
        >
          <option value="" disabled>
            Seleccioná una marca
          </option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-text" htmlFor={`${id}-category`}>
          Categoría
        </label>
        <select
          id={`${id}-category`}
          value={fields.categoryId}
          disabled={locked}
          onChange={(event) => set("categoryId", event.target.value)}
          required
          className={selectClass}
        >
          <option value="" disabled>
            Seleccioná una categoría
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-text-muted">
          Clip-on, polarizado o 2 en 1 son características, no formas: elegí la categoría que
          corresponda (por ejemplo «Anteojos Con Clip On») y mencionalo en el nombre.
        </p>
      </div>

      {isAccessory ? (
        <>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text" htmlFor={`${id}-role`}>
              Tipo de accesorio
            </label>
            <select
              id={`${id}-role`}
              value={fields.accessoryRole}
              disabled={locked}
              onChange={(event) => set("accessoryRole", event.target.value as AccessoryRole)}
              required
              className={selectClass}
            >
              <option value="" disabled>
                Seleccioná el tipo
              </option>
              {ACCESSORY_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-text-muted">
              {accessoryRoleUsage(fields.accessoryRole || null, includedSurchargeText)}
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={fields.soldIndividually}
              disabled={locked}
              onChange={(event) => set("soldIndividually", event.target.checked)}
              className="mt-0.5 accent-[var(--color-primary)]"
            />
            <span>
              Se vende por separado
              <span className="block text-xs text-text-muted">
                Aparece en la sección Accesorios de la tienda cuando tenga una foto.
              </span>
            </span>
          </label>
        </>
      ) : (
        <ShapeSelect
          value={fields.shape}
          disabled={locked}
          onChange={(value) => set("shape", value)}
          selectClassName={selectClass}
        />
      )}

      <FormField
        label={isAccessory ? "Precio (ARS)" : "Precio base (ARS)"}
        type="number"
        inputMode="decimal"
        min="0.01"
        step="0.01"
        value={fields.basePrice}
        disabled={locked}
        onChange={(e) => set("basePrice", e.target.value)}
        required
      />

      {!isAccessory && (
        <fieldset className="space-y-2 rounded-md border border-border p-4">
          <legend className="px-1 text-sm font-semibold text-text">
            Cristales compatibles (opcional)
          </legend>
          <p className="text-xs text-text-muted">
            Qué tipos de cristal acepta este armazón. Sin elegir ninguno, la tienda muestra
            «Compatibilidad por consultar». No suma precios.
          </p>
          {lensTypes.isLoading && <p className="text-sm text-text-muted">Cargando cristales…</p>}
          {lensTypes.isError && (
            <p className="text-sm text-danger">
              No pudimos cargar los cristales. Podés crear el producto y elegirlos después en su
              ficha.
            </p>
          )}
          {lensTypes.data && lensChoices.length === 0 && (
            <p className="text-sm text-text-muted">
              Todavía no hay cristales cargados. Crealos en{" "}
              <Link to="/admin/lens-types" className="text-primary hover:underline">
                Cristales
              </Link>
              .
            </p>
          )}
          {lensChoices.length > 0 && (
            <LensTypeChecklist
              choices={lensChoices}
              selected={fields.lensTypeIds}
              onChange={(ids) => set("lensTypeIds", ids)}
              disabled={saving || progress.lensTypesSaved}
            />
          )}
        </fieldset>
      )}

      <fieldset className="space-y-3 rounded-md border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-text">
          Variantes y fotos (opcional)
        </legend>
        <p className="text-sm text-text">
          Cada variante es una pieza: un color, su material, su SKU, su stock y sus fotos. Para otro
          color, agregá otra variante. Sin variantes, el producto se crea solo y las agregás después
          en su ficha.
        </p>
        {!variantsCreated && (
          <div
            role="group"
            aria-label="Variante nueva"
            className="space-y-3 rounded-md bg-surface-sunken p-3"
          >
            <div>
              <p className="mb-1.5 text-sm font-medium text-text">Color</p>
              <ColorChoice
                value={newTone}
                onChange={(tone) => {
                  setNewTone(tone);
                  setNewError(null);
                }}
                label="Color de la variante nueva"
                disabled={saving}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label
                  htmlFor={`${id}-new-material`}
                  className="mb-1 block text-xs font-medium text-text"
                >
                  Material
                </label>
                <input
                  id={`${id}-new-material`}
                  list={`${id}-new-materials`}
                  value={newMaterial}
                  maxLength={200}
                  disabled={saving}
                  onChange={(event) => setNewMaterial(event.target.value)}
                  className={newInput}
                />
                <datalist id={`${id}-new-materials`}>
                  {FRAME_MATERIAL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.label} />
                  ))}
                </datalist>
              </div>
              <div>
                <label
                  htmlFor={`${id}-new-sku`}
                  className="mb-1 block text-xs font-medium text-text"
                >
                  SKU
                </label>
                <input
                  id={`${id}-new-sku`}
                  value={newSku}
                  maxLength={100}
                  disabled={saving}
                  onChange={(event) => {
                    setNewSku(event.target.value);
                    setNewError(null);
                  }}
                  className={newInput}
                />
              </div>
              <div>
                <label
                  htmlFor={`${id}-new-stock`}
                  className="mb-1 block text-xs font-medium text-text"
                >
                  Stock
                </label>
                <input
                  id={`${id}-new-stock`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  value={newStock}
                  disabled={saving}
                  onChange={(event) => {
                    setNewStock(event.target.value);
                    setNewError(null);
                  }}
                  className={newInput}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={addVariant}
                disabled={saving}
                className="min-h-11 rounded-md border border-primary px-4 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
              >
                Agregar variante
              </button>
              {typingVariant && (
                <button
                  type="button"
                  onClick={resetNewVariant}
                  disabled={saving}
                  className="min-h-11 px-2 text-sm font-medium text-text-muted underline underline-offset-4 hover:text-text"
                >
                  Descartar
                </button>
              )}
            </div>
            {newError && (
              <p role="alert" className="text-sm text-danger">
                {newError}
              </p>
            )}
          </div>
        )}

        {rows.map((row, index) => renderRow(row, index))}
      </fieldset>

      {!productCreated && <SimilarProductsWarning name={fields.name} sku="" />}

      {missing.length > 0 && (dirty || productCreated) && (
        <p className="text-sm text-text-muted">Falta {missing.join(", ")}.</p>
      )}
      {saveError && (
        <p role="alert" className="text-sm text-danger">
          {saveError}
        </p>
      )}

      <button
        type="submit"
        disabled={saving || missing.length > 0}
        className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
      >
        {saving
          ? "Guardando…"
          : productCreated
            ? "Reintentar lo pendiente"
            : isAccessory
              ? "Crear accesorio"
              : "Crear producto"}
      </button>
    </form>
  );
}

/** Possible duplicates of what is being loaded: a warning with links,
 * never a block (the same model in another color is legitimate). */
function SimilarProductsWarning({ name, sku }: { name: string; sku: string }) {
  const similar = useSimilarProductsQuery(name, sku);
  const found = similar.data ?? [];
  if (found.length === 0) return null;
  return (
    <div
      role="status"
      className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-text"
    >
      <p className="font-semibold">Posibles productos ya cargados:</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {found.map((product) => (
          <li key={`${product.id}-${product.reason}`}>
            <a
              href={`/admin/products/${product.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              {product.name}
            </a>{" "}
            <span className="text-text-muted">
              ({product.brandName}
              {product.reason === "SAME_SKU" ? ` · mismo SKU ${product.sku}` : " · mismo nombre"}
              {product.deletedAt ? " · en la papelera" : ""})
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-text-muted">
        Si es el mismo modelo en otro color, conviene agregar el color en su ficha. Si es otro
        producto, podés guardarlo igual.
      </p>
    </div>
  );
}
