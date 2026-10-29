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
} from "@soluciones-opticas/shared";
import { FormField } from "../../components/forms/FormField";
import { ShapeSelect } from "../../components/admin/ShapeSelect";
import { ColorToneDot } from "../../components/products/ColorToneDot";
import type { PhotoCandidate, PhotoUploadStatus } from "../../components/admin/PhotoSequencePicker";
import { ApiClientError, apiPost } from "../../services/api-client";
import { ACCESSORY_ROLE_OPTIONS, accessoryRoleUsage } from "../../lib/accessories";
import { COLOR_TONE_OPTIONS, toneLabel, tonesName } from "../../lib/color-tones";
import {
  EMPTY_PROGRESS,
  hasPendingChanges,
  newDraftVariant,
  type DraftProgress,
  type DraftVariant,
  type ProductDraftFields,
  type VariantMode,
} from "../../lib/product-drafts";
import { ColorTonePicker } from "./ColorTonePicker";
import { DraftVariantRow } from "./DraftVariantRow";
import {
  invalidateProduct,
  uploadProductImage,
  useSimilarProductsQuery,
} from "../../services/queries/admin";

// One tab of the multi-tab new-product page: the same basic fields as the
// single form, plus the colors it comes in, chosen on the color palette
// (docs/COLORES.md): several colors are several variants, each with its own
// SKU, stock and photos; a single piece of two or more tones is one variant.
// Saving runs the existing endpoints in order — product, its colors (one
// atomic batch), each color's photos — and remembers what is already
// created, so a retry continues from there and never creates anything twice.

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
  const [customColor, setCustomColor] = useState("");
  const [failedRow, setFailedRow] = useState<number | null>(null);
  const [uploadingRow, setUploadingRow] = useState<number | null>(null);

  const isAccessory = fields.kind === "ACCESSORY";
  const productCreated = progress.productId !== null;
  const variantsCreated = progress.variantIds !== null;
  const rows = fields.variants;
  const chosenPhotos = Object.values(photoCounts).reduce((sum, c) => sum + c.chosen, 0);
  const allPhotos = Object.values(photoCounts).reduce((sum, c) => sum + c.all, 0);
  const dirty = hasPendingChanges(fields, allPhotos, saved);

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

  // "colors": each palette color clicked is its own variant (row).
  function toggleColor(tone: ColorTone) {
    const existing = rows.find((row) => row.tones.length === 1 && row.tones[0] === tone);
    if (existing) removeRow(existing.key);
    else setRows([...rows, newDraftVariant([tone], toneLabel(tone))]);
  }

  function addCustomColor() {
    const name = customColor.trim().replace(/\s+/g, " ");
    if (!name) return;
    setRows([...rows, newDraftVariant([], name)]);
    setCustomColor("");
  }

  // "combined": one row, its tones in the order clicked; the name follows
  // the tones until it is typed by hand.
  function setCombinedTones(tones: ColorTone[]) {
    const row = rows[0];
    if (tones.length === 0) return setRows([]);
    if (!row) return setRows([newDraftVariant(tones, tonesName(tones))]);
    const autoName = row.name === "" || row.name === tonesName(row.tones);
    setRows([{ ...row, tones, name: autoName ? tonesName(tones) : row.name }]);
  }

  function setMode(mode: VariantMode) {
    if (mode === fields.variantMode) return;
    const typed = rows.some((row) => row.sku.trim() !== "" || row.stock !== "");
    if (
      typed &&
      !window.confirm(
        "Cambiar el tipo de carga borra los colores elegidos y sus SKU y stock. ¿Seguir?",
      )
    ) {
      return;
    }
    setFields((current) => ({ ...current, variantMode: mode, variants: [] }));
    photosRef.current.clear();
    setPhotoCounts({});
  }

  const lowerSkus = rows.map((row) => row.sku.trim().toLowerCase());
  const lowerNames = rows.map((row) => row.name.trim().toLowerCase());
  const repeated = (list: string[], index: number) =>
    list[index] !== "" && list.indexOf(list[index]!) !== index;
  const missing: string[] = [];
  if (!fields.name.trim()) missing.push("el nombre");
  if (!fields.brandId) missing.push("la marca");
  if (!fields.categoryId) missing.push("la categoría");
  if (!fields.basePrice || Number(fields.basePrice) <= 0) missing.push("el precio");
  if (isAccessory && !fields.accessoryRole) missing.push("el tipo de accesorio");
  if (fields.variantMode === "combined" && rows.length === 1 && rows[0]!.tones.length < 2) {
    missing.push("al menos dos tonos de la pieza combinada");
  }
  if (rows.some((row) => !row.name.trim())) missing.push("el nombre de cada color");
  if (rows.some((row) => !row.sku.trim())) missing.push("el SKU de cada color");
  if (rows.some((row) => !/^\d+$/.test(row.stock.trim()))) {
    missing.push("el stock de cada color (número entero, 0 o más)");
  }
  if (lowerSkus.some((_, i) => repeated(lowerSkus, i))) missing.push("SKU distintos");
  if (lowerNames.some((_, i) => repeated(lowerNames, i)))
    missing.push("nombres de color distintos");

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
      let { productId, variantIds, uploadedPhotos } = progressRef.current;
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
        updateProgress({ productId, variantIds, uploadedPhotos });
      }
      if (rows.length > 0 && !variantIds) {
        step = "variants";
        // All colors in one atomic request: a repeated SKU creates none.
        const body: CreateVariantsBatchRequest = {
          variants: rows.map((row) => ({
            color: row.name.trim(),
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
        updateProgress({ productId, variantIds, uploadedPhotos });
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
          updateProgress({ productId, variantIds, uploadedPhotos });
        }
      }
      invalidateProduct(queryClient, productId);
      setSaved(true);
      onSaved(productId);
    } catch (error) {
      const productId = progressRef.current.productId;
      if (productId) invalidateProduct(queryClient, productId);
      if (step === "photo") setFailedRow(rowIndex);
      const rowName = rows[rowIndex]?.name.trim() || "el color";
      setSaveError(
        step === "product"
          ? describe(error, "No pudimos crear el producto.")
          : step === "variants"
            ? `El producto se creó, pero no sus colores (no se creó ninguno): ${describe(error, "no pudimos crear los colores.")}`
            : `El producto y sus colores se crearon, pero falló la foto ${photoIndex + 1} de ${rowName}: ${describe(error, "no pudimos subir la foto.")}`,
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

  const selectClass =
    "w-full rounded-md border border-border bg-surface-muted px-4 py-2.5 text-text disabled:opacity-60";
  const locked = productCreated || saving;

  if (saved && progress.productId) {
    return (
      <div className="rounded-md border border-border p-4 text-sm text-text">
        <p className="font-semibold text-success">✓ «{fields.name}» guardado.</p>
        <p className="mt-1 text-text-muted">
          {rows.length > 0
            ? `${rows.length} ${rows.length === 1 ? "color" : "colores"} (${rows.map((row) => row.name).join(", ")}) y ${chosenPhotos} foto${chosenPhotos === 1 ? "" : "s"}.`
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

      <fieldset className="space-y-3 rounded-md border border-border p-4">
        <legend className="px-1 text-sm font-semibold text-text">Colores y fotos (opcional)</legend>
        <div role="radiogroup" aria-label="Cómo viene este modelo" className="space-y-2">
          {(
            [
              [
                "colors",
                "Varios colores",
                "Cada color es un armazón distinto, con su SKU, su stock y sus fotos.",
              ],
              [
                "combined",
                "Una pieza de varios tonos",
                "Un solo armazón que combina dos o más tonos (por ejemplo, rojo y negro).",
              ],
            ] as const
          ).map(([value, label, help]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                fields.variantMode === value ? "border-primary" : "border-border"
              } ${variantsCreated || saving ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name={`${id}-mode`}
                checked={fields.variantMode === value}
                disabled={variantsCreated || saving}
                onChange={() => setMode(value)}
                className="mt-1 accent-[var(--color-primary)]"
              />
              <span>
                <span className="font-medium text-text">{label}</span>
                <span className="block text-xs text-text-muted">{help}</span>
              </span>
            </label>
          ))}
        </div>

        {fields.variantMode === "colors" ? (
          <div className="space-y-2">
            <p className="text-sm text-text">
              Tocá todos los colores en que viene. Sin colores, el producto se crea solo y los
              agregás después en su ficha.
            </p>
            <div role="group" aria-label="Colores de la paleta" className="flex flex-wrap gap-2">
              {COLOR_TONE_OPTIONS.map(({ tone, label }) => {
                const chosen = rows.some((row) => row.tones.length === 1 && row.tones[0] === tone);
                return (
                  <button
                    key={tone}
                    type="button"
                    aria-pressed={chosen}
                    disabled={variantsCreated || saving}
                    onClick={() => toggleColor(tone)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition-colors disabled:opacity-50 ${
                      chosen
                        ? "border-primary bg-primary/10 font-semibold text-primary"
                        : "border-border text-text hover:border-primary"
                    }`}
                  >
                    <ColorToneDot tones={[tone]} />
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label
                  htmlFor={`${id}-custom`}
                  className="mb-1 block text-xs font-medium text-text"
                >
                  Otro color (fuera de la paleta)
                </label>
                <input
                  id={`${id}-custom`}
                  value={customColor}
                  maxLength={60}
                  disabled={variantsCreated || saving}
                  onChange={(event) => setCustomColor(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomColor();
                    }
                  }}
                  className="w-48 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text"
                />
              </div>
              <button
                type="button"
                onClick={addCustomColor}
                disabled={customColor.trim() === "" || variantsCreated || saving}
                className="min-h-11 rounded-md border border-border px-3 text-sm font-medium text-text hover:border-primary disabled:opacity-60"
              >
                Agregar color
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-text">Tonos de la pieza, el principal primero:</p>
            <ColorTonePicker
              value={rows[0]?.tones ?? []}
              onChange={setCombinedTones}
              label="Tonos de la pieza combinada"
              disabled={variantsCreated || saving}
            />
          </div>
        )}

        {rows.map((row, index) => {
          const { locked, statuses } = rowPhotoState(index, row.key);
          const before = previouslyUploadedPhotos[index] ?? 0;
          return (
            <DraftVariantRow
              key={row.key}
              variant={row}
              heading={
                fields.variantMode === "combined"
                  ? `Pieza combinada: ${tonesName(row.tones)}`
                  : row.tones.length > 0
                    ? toneLabel(row.tones[0]!)
                    : `${row.name} (fuera de la paleta)`
              }
              editable={!variantsCreated && !saving}
              photosDisabled={saving}
              onChange={(patch) => updateRow(row.key, patch)}
              onRemove={fields.variantMode === "colors" ? () => removeRow(row.key) : undefined}
              onPhotos={onPhotos}
              firstIsPrimary={before === 0}
              existingCount={before}
              locked={locked}
              statuses={statuses}
              skuRepeated={repeated(lowerSkus, index)}
              nameRepeated={repeated(lowerNames, index)}
            />
          );
        })}
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
