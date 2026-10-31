import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
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
  SimilarProductDto,
  StylePreference,
} from "@soluciones-opticas/shared";
import { FormField } from "../../components/forms/FormField";
import { ShapeSelect } from "../../components/admin/ShapeSelect";
import { PreferenceChipGroup } from "../../components/optical-profile/PreferenceChipGroup";
import type { PhotoCandidate, PhotoUploadStatus } from "../../components/admin/PhotoSequencePicker";
import { ApiClientError, apiGet, apiPost, apiPut } from "../../services/api-client";
import { useAdminLensTypesQuery } from "../../services/queries/admin-lens";
import { LensTypeChecklist } from "./LensTypeChecklist";
import { ACCESSORY_ROLE_OPTIONS, accessoryRoleUsage, colorKey } from "../../lib/accessories";
import { LENS_COMPATIBILITY_ENABLED } from "../../lib/features";
import {
  FRAME_MATERIAL_OPTIONS,
  STYLE_PREFERENCE_OPTIONS,
} from "../../lib/optical-profile-taxonomy";
import {
  EMPTY_PROGRESS,
  hasPendingChanges,
  newDraftVariant,
  type DraftMeasurements,
  type DraftProgress,
  type DraftVariant,
  type ProductDraftFields,
} from "../../lib/product-drafts";
import {
  ACCESSORY_EXTRA_COLORS,
  ColorChoice,
  chosenColor,
  colorChoiceProblem,
} from "./ColorChoice";
import { DraftVariantPhotos, DraftVariantRow } from "./DraftVariantRow";
import {
  invalidateProduct,
  uploadProductImage,
  useSimilarProductsQuery,
} from "../../services/queries/admin";

// The new-product page, on one screen (docs/ALTA_PRODUCTOS.md): general
// data, characteristics and measurements (frames), the variants — color
// (one dot of the palette; «Combinado» with its tones; «Otro color…»),
// material, SKU and stock — and each variant's photos, with one «Crear
// producto». Nothing is sent while something required is missing: the
// error shows next to its field and the page takes you there. Saving runs
// the existing endpoints in order — product, its variants (one atomic
// batch), each variant's photos — and remembers what is already created,
// so a retry continues from there and never creates anything twice.

export interface DraftState {
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
  onChange: (state: DraftState) => void;
  onSaved: (productId: string) => void;
}

const NETWORK_ERROR = "No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.";

function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) return error.status < 500 ? error.message : fallback;
  if (error instanceof TypeError) return NETWORK_ERROR;
  return fallback;
}

const MEASUREMENT_FIELDS: { key: keyof DraftMeasurements; label: string }[] = [
  { key: "lensWidth", label: "Ancho del lente (mm)" },
  { key: "bridgeWidth", label: "Ancho del puente (mm)" },
  { key: "templeLength", label: "Largo de patilla (mm)" },
  { key: "lensHeight", label: "Altura del lente (mm)" },
  { key: "frameWidth", label: "Ancho del armazón (mm)" },
];

// Same limits as the API (admin-products.schema.ts).
const MAX_PRICE = 10_000_000;
const MAX_MEASUREMENT = 500;

const measurementOrNull = (value: string) => (value.trim() === "" ? null : Number(value));

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
  // Errors show from the first «Crear producto» on, and follow the fixes.
  const [showErrors, setShowErrors] = useState(false);
  // SKUs the API already has (checked before creating anything).
  const [takenSkus, setTakenSkus] = useState<Record<string, string>>({});
  // Double-click guard: state updates are not synchronous.
  const savingRef = useRef(false);
  const progressRef = useRef(progress);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  // Each variant's photos live in its photo block (numbered by clicking
  // them); the form keeps the chosen ones here, by row key, to upload them
  // in order.
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
  const [newChoice, setNewChoice] = useState<string | null>(null);
  const [newOther, setNewOther] = useState("");
  const [newTones, setNewTones] = useState<ColorTone[]>([]);
  const [newMaterial, setNewMaterial] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newStock, setNewStock] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  // «Crear producto» was pressed with a variant half-typed: flagged until
  // it is added or discarded (not while it is being typed afterwards).
  const [pendingFlagged, setPendingFlagged] = useState(false);
  const [failedRow, setFailedRow] = useState<number | null>(null);
  const [uploadingRow, setUploadingRow] = useState<number | null>(null);

  const isAccessory = fields.kind === "ACCESSORY";
  // The lens types come from the API (also the ones Roberto adds later);
  // only active ones can be chosen for a new frame. Suspended for now.
  const lensTypes = useAdminLensTypesQuery(LENS_COMPATIBILITY_ENABLED);
  const lensChoices = (lensTypes.data ?? []).filter((type) => !type.deletedAt);
  const productCreated = progress.productId !== null;
  const variantsCreated = progress.variantIds !== null;
  const rows = fields.variants;
  const chosenPhotos = Object.values(photoCounts).reduce((sum, c) => sum + c.chosen, 0);
  const allPhotos = Object.values(photoCounts).reduce((sum, c) => sum + c.all, 0);
  const typingVariant =
    newChoice !== null ||
    newTones.length > 0 ||
    [newOther, newMaterial, newSku, newStock].some((value) => value.trim() !== "");
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
    setNewChoice(null);
    setNewOther("");
    setNewTones([]);
    setNewMaterial("");
    setNewSku("");
    setNewStock("");
    setNewError(null);
    setPendingFlagged(false);
  }

  // One variant at a time: its color, material, SKU and stock go to the
  // list below, and its photos to the photos section; the form is then
  // empty for the next one. A frame may repeat a color (another material),
  // told apart by its SKU; an accessory never repeats one. «Combinado» is
  // ONE variant with its tones; «Otro color…» keeps the typed name, without
  // tones (docs/COLORES.md).
  function addVariant() {
    const sku = newSku.trim();
    const chosen = chosenColor(newChoice, newOther, newTones);
    const problem =
      colorChoiceProblem(newChoice, newOther, newTones) ??
      (sku === ""
        ? "Escribí el SKU."
        : !/^\d+$/.test(newStock.trim())
          ? "Ingresá el stock: un número entero, 0 o más."
          : rows.some((row) => row.sku.trim().toLowerCase() === sku.toLowerCase())
            ? `El SKU «${sku}» ya está en la lista.`
            : isAccessory && rows.some((row) => colorKey(row.name) === colorKey(chosen!.color))
              ? `${chosen!.color} ya está en la lista: en un accesorio cada color va una vez.`
              : null);
    if (problem) {
      setNewError(problem);
      return;
    }
    setRows([
      ...rows,
      newDraftVariant(chosen!.tones, chosen!.color, {
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

  // What blocks «Crear producto», by field, in the order of the page.
  const errors: Record<string, string> = {};
  if (!productCreated) {
    if (!fields.name.trim()) errors.name = "Escribí el nombre del producto.";
    if (!fields.brandId) errors.brandId = "Elegí la marca.";
    if (!fields.categoryId) errors.categoryId = "Elegí la categoría.";
    if (isAccessory && !fields.accessoryRole) errors.accessoryRole = "Elegí el tipo de accesorio.";
    const price = Number(fields.basePrice);
    if (!fields.basePrice.trim() || !(price > 0) || price > MAX_PRICE) {
      errors.basePrice = "Ingresá el precio: mayor que 0.";
    }
    if (!isAccessory) {
      for (const { key } of MEASUREMENT_FIELDS) {
        const raw = fields.measurements[key].trim();
        const value = Number(raw);
        if (raw !== "" && !(value > 0 && value <= MAX_MEASUREMENT)) {
          errors[`m-${key}`] = `Ingresá un número en mm, mayor que 0 y hasta ${MAX_MEASUREMENT}.`;
        }
      }
    }
  }
  if (!variantsCreated) {
    // Never lose what is being typed: it goes to the list, or is cleared.
    if (typingVariant) {
      errors.newVariant = "Agregá esta variante a la lista («Agregar variante») o descartala.";
    }
    rows.forEach((row, index) => {
      const sku = row.sku.trim();
      if (!sku) errors[`${row.key}-sku`] = "Escribí el SKU.";
      else if (repeated(lowerSkus, index)) errors[`${row.key}-sku`] = "SKU repetido en la lista.";
      else if (takenSkus[sku.toLowerCase()]) {
        errors[`${row.key}-sku`] =
          `Ya existe en «${takenSkus[sku.toLowerCase()]}»: usá otro código.`;
      }
      if (!/^\d+$/.test(row.stock.trim())) {
        errors[`${row.key}-stock`] = "Ingresá el stock: un número entero, 0 o más.";
      }
    });
  }
  const errorKeys = Object.keys(errors);
  const shown = (key: string) =>
    showErrors && (key !== "newVariant" || pendingFlagged) ? errors[key] : undefined;

  function goToField(key: string) {
    const holder = document.querySelector(`[data-field="${key}"]`);
    holder?.scrollIntoView?.({ block: "center" });
    // The field itself; in the variant being typed, the color chosen.
    const target = ['[aria-invalid="true"]', "input[type=radio]:checked", "input, select, textarea"]
      .map((selector) => holder?.querySelector<HTMLElement>(selector))
      .find(Boolean);
    target?.focus();
  }

  // SKUs already used by another product: checked before creating the
  // product, so a taken code never leaves a product without its variants.
  async function findTakenSkus(): Promise<Record<string, string>> {
    const taken: Record<string, string> = {};
    for (const row of rows) {
      const sku = row.sku.trim();
      const found = await apiGet<SimilarProductDto[]>("/api/admin/products/similar", { sku });
      const same = found.find(
        (p) => p.reason === "SAME_SKU" && p.sku?.toLowerCase() === sku.toLowerCase(),
      );
      if (same) taken[sku.toLowerCase()] = same.name;
    }
    return taken;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current || saved) return;
    setShowErrors(true);
    if (errors.newVariant) setPendingFlagged(true);
    if (errorKeys.length > 0) {
      goToField(errorKeys[0]!);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setFailedRow(null);
    let step = "check";
    let rowIndex = -1;
    let photoIndex = -1;
    try {
      let { productId, variantIds, uploadedPhotos, lensTypesSaved } = progressRef.current;
      if (rows.length > 0 && !variantIds) {
        const taken = await findTakenSkus();
        setTakenSkus(taken);
        const first = rows.find((row) => taken[row.sku.trim().toLowerCase()]);
        if (first) {
          // Shown next to its SKU; nothing was created.
          requestAnimationFrame(() => goToField(`${first.key}-sku`));
          return;
        }
      }
      step = "product";
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
              ...(fields.styles.length > 0 ? { styles: fields.styles } : {}),
              lensWidth: measurementOrNull(fields.measurements.lensWidth),
              bridgeWidth: measurementOrNull(fields.measurements.bridgeWidth),
              templeLength: measurementOrNull(fields.measurements.templeLength),
              lensHeight: measurementOrNull(fields.measurements.lensHeight),
              frameWidth: measurementOrNull(fields.measurements.frameWidth),
            };
        const product = await apiPost<AdminProductDetail>("/api/admin/products", body);
        productId = product.id;
        updateProgress({ productId, variantIds, uploadedPhotos, lensTypesSaved });
      }
      // Compatible lens types (frames only; suspended for now), with the
      // existing endpoint: it replaces the whole list, so sending it again
      // never duplicates one.
      if (
        LENS_COMPATIBILITY_ENABLED &&
        !isAccessory &&
        fields.lensTypeIds.length > 0 &&
        !lensTypesSaved
      ) {
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
              // The first photo of each variant is its primary one.
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
        step === "check"
          ? `No pudimos verificar los SKU, así que no se creó nada: ${describe(error, "intentá de nuevo.")}`
          : step === "product"
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

  // Per variant: already uploaded photos keep their number; the one being
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

  const heading = (row: DraftVariant, index: number) =>
    `Variante ${index + 1}: ${row.name}${row.tones.length === 0 ? " (fuera de la paleta)" : ""}`;

  const newInput =
    "w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text disabled:opacity-60";
  const selectClass = (key: string) =>
    `w-full rounded-md border bg-surface-muted px-4 py-2.5 text-text disabled:opacity-60 ${
      shown(key) ? "border-danger" : "border-border"
    }`;
  const locked = productCreated || saving;
  const fieldError = (key: string) =>
    shown(key) ? (
      <p id={`${id}-${key}-error`} className="mt-1.5 text-sm text-danger">
        {shown(key)}
      </p>
    ) : null;
  const describedBy = (key: string) => (shown(key) ? `${id}-${key}-error` : undefined);

  if (saved && progress.productId) {
    return (
      <div className="rounded-md border border-border p-4 text-sm text-text">
        <p className="font-semibold text-success">✓ «{fields.name}» guardado.</p>
        <Link
          to={`/admin/products/${progress.productId}`}
          className="mt-3 inline-block font-semibold text-primary hover:underline"
        >
          Abrir la ficha del producto
        </Link>
      </div>
    );
  }

  const missingLabels = errorKeys.map((key) => errors[key]!.replace(/\.$/, ""));

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-8" noValidate>
      {lostPhotoCount > 0 && (
        <p
          role="status"
          className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-text"
        >
          Recuperamos los datos de este borrador. Las fotos elegidas antes de recargar no se
          conservan: volvé a seleccionarlas
          {previouslyUploadedPhotos.some((n) => n > 0)
            ? ` (ya se habían subido ${previouslyUploadedPhotos.reduce((a, n) => a + n, 0)}; elegí solo las que faltan en cada variante)`
            : ""}
          .
        </p>
      )}
      {productCreated && (
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text">
          El producto ya se creó: sus datos generales se editan en{" "}
          <Link
            to={`/admin/products/${progress.productId}`}
            className="text-primary hover:underline"
          >
            su ficha
          </Link>
          . Acá solo falta terminar lo que quedó pendiente.
        </p>
      )}

      <FormSection title="Datos generales">
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
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm ${
                  fields.kind === value ? "border-primary text-primary" : "border-border text-text"
                }`}
              >
                <input
                  type="radio"
                  name={`${id}-kind`}
                  value={value}
                  checked={fields.kind === value}
                  onChange={() => {
                    set("kind", value as ProductKind);
                    // «Rosado» and the like are accessory names only.
                    if (newChoice && ACCESSORY_EXTRA_COLORS.includes(newChoice)) {
                      setNewChoice(null);
                    }
                  }}
                  className="accent-[var(--color-primary)]"
                />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-text-muted">No se puede cambiar después de crearlo.</p>
        </fieldset>

        <div data-field="name">
          <FormField
            label="Nombre"
            hint="Nombre comercial que ve el cliente: lo que distingue al modelo (forma, color, material, línea). La marca va aparte. Ej.: «Gatito Rosa Metálico Paris»."
            value={fields.name}
            disabled={locked}
            onChange={(e) => set("name", e.target.value)}
            error={shown("name")}
            required
          />
        </div>

        <div data-field="brandId">
          <label className="mb-1.5 block text-sm font-medium text-text" htmlFor={`${id}-brand`}>
            Marca
          </label>
          <select
            id={`${id}-brand`}
            value={fields.brandId}
            disabled={locked}
            onChange={(event) => set("brandId", event.target.value)}
            required
            aria-invalid={Boolean(shown("brandId"))}
            aria-describedby={describedBy("brandId")}
            className={selectClass("brandId")}
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
          {fieldError("brandId")}
        </div>

        <div data-field="categoryId">
          <label className="mb-1.5 block text-sm font-medium text-text" htmlFor={`${id}-category`}>
            Categoría
          </label>
          <select
            id={`${id}-category`}
            value={fields.categoryId}
            disabled={locked}
            onChange={(event) => set("categoryId", event.target.value)}
            required
            aria-invalid={Boolean(shown("categoryId"))}
            aria-describedby={describedBy("categoryId")}
            className={selectClass("categoryId")}
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
          {fieldError("categoryId")}
          <p className="mt-1.5 text-xs text-text-muted">
            Clip-on, polarizado o 2 en 1 son características, no formas: elegí la categoría que
            corresponda (por ejemplo «Anteojos Con Clip On») y mencionalo en el nombre.
          </p>
        </div>

        {isAccessory && (
          <>
            <div data-field="accessoryRole">
              <label className="mb-1.5 block text-sm font-medium text-text" htmlFor={`${id}-role`}>
                Tipo de accesorio
              </label>
              <select
                id={`${id}-role`}
                value={fields.accessoryRole}
                disabled={locked}
                onChange={(event) => set("accessoryRole", event.target.value as AccessoryRole)}
                required
                aria-invalid={Boolean(shown("accessoryRole"))}
                aria-describedby={describedBy("accessoryRole")}
                className={selectClass("accessoryRole")}
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
              {fieldError("accessoryRole")}
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
        )}

        <div data-field="basePrice">
          <FormField
            label={isAccessory ? "Precio (ARS)" : "Precio base (ARS)"}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={fields.basePrice}
            disabled={locked}
            onChange={(e) => set("basePrice", e.target.value)}
            error={shown("basePrice")}
            required
          />
        </div>
      </FormSection>

      {!isAccessory && (
        <FormSection title="Características y medidas">
          <ShapeSelect
            value={fields.shape}
            disabled={locked}
            onChange={(value) => set("shape", value)}
            selectClassName={selectClass("shape")}
          />
          <div>
            <p className="mb-1.5 text-sm font-medium text-text">Estilos (opcional)</p>
            <PreferenceChipGroup<StylePreference>
              legend="Estilos"
              options={STYLE_PREFERENCE_OPTIONS}
              selected={fields.styles}
              onToggle={(value) =>
                !locked &&
                set(
                  "styles",
                  fields.styles.includes(value)
                    ? fields.styles.filter((style) => style !== value)
                    : [...fields.styles, value],
                )
              }
            />
          </div>
          <div>
            <p className="text-sm font-medium text-text">Medidas del armazón (opcional)</p>
            <p className="mt-1 text-xs text-text-muted">
              Suelen estar impresas en la parte interna de la patilla.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {MEASUREMENT_FIELDS.map(({ key, label }) => (
                <div key={key} data-field={`m-${key}`}>
                  <FormField
                    label={label}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.1"
                    value={fields.measurements[key]}
                    disabled={locked}
                    onChange={(e) =>
                      set("measurements", { ...fields.measurements, [key]: e.target.value })
                    }
                    error={shown(`m-${key}`)}
                  />
                </div>
              ))}
            </div>
          </div>
          {LENS_COMPATIBILITY_ENABLED && (
            <fieldset className="space-y-2 rounded-md border border-border p-4">
              <legend className="px-1 text-sm font-semibold text-text">
                Cristales compatibles (opcional)
              </legend>
              <p className="text-xs text-text-muted">
                Qué tipos de cristal acepta este armazón. Sin elegir ninguno, la tienda muestra
                «Compatibilidad por consultar». No suma precios.
              </p>
              {lensTypes.isLoading && (
                <p className="text-sm text-text-muted">Cargando cristales…</p>
              )}
              {lensTypes.isError && (
                <p className="text-sm text-danger">
                  No pudimos cargar los cristales. Podés crear el producto y elegirlos después en su
                  ficha.
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
        </FormSection>
      )}

      <FormSection title="Colores, material, SKU y stock">
        <p className="text-sm text-text">
          Cada variante es una pieza con su color, material, SKU y stock. Para otro color, agregá
          otra variante; para una pieza de varios tonos, elegí «Combinado» y sus tonos. Sin
          variantes, el producto se crea solo y las agregás después en su ficha.
        </p>
        {!variantsCreated && (
          <div
            role="group"
            aria-label="Variante nueva"
            data-field="newVariant"
            className={`space-y-3 rounded-md bg-surface-sunken p-3 ${
              shown("newVariant") ? "ring-2 ring-danger" : ""
            }`}
          >
            <div>
              <p className="mb-1.5 text-sm font-medium text-text">Color</p>
              <ColorChoice
                value={newChoice}
                onChange={(choice) => {
                  setNewChoice(choice);
                  setNewError(null);
                }}
                label="Color de la variante nueva"
                disabled={saving}
                extraNames={isAccessory ? ACCESSORY_EXTRA_COLORS : []}
                otherName={newOther}
                onOtherName={(name) => {
                  setNewOther(name);
                  setNewError(null);
                }}
                combinedTones={newTones}
                onCombinedTones={(tones) => {
                  setNewTones(tones);
                  setNewError(null);
                }}
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
            {(newError ?? shown("newVariant")) && (
              <p role="alert" className="text-sm text-danger">
                {newError ?? shown("newVariant")}
              </p>
            )}
          </div>
        )}

        {rows.map((row, index) => (
          <DraftVariantRow
            key={row.key}
            variant={row}
            heading={heading(row, index)}
            editable={!variantsCreated && !saving}
            onChange={(patch) => updateRow(row.key, patch)}
            onRemove={() => removeRow(row.key)}
            skuRepeated={repeated(lowerSkus, index)}
            errors={{ sku: shown(`${row.key}-sku`), stock: shown(`${row.key}-stock`) }}
          />
        ))}
      </FormSection>

      <FormSection title="Fotografías">
        {rows.length === 0 ? (
          <p className="text-sm text-text-muted">
            Las fotos van por variante: agregá una variante arriba para elegir las suyas.
          </p>
        ) : (
          rows.map((row, index) => {
            const { locked: lockedPhotos, statuses } = rowPhotoState(index, row.key);
            const before = previouslyUploadedPhotos[index] ?? 0;
            return (
              <DraftVariantPhotos
                key={row.key}
                variant={row}
                heading={heading(row, index)}
                disabled={saving}
                onPhotos={onPhotos}
                firstIsPrimary={before === 0}
                existingCount={before}
                locked={lockedPhotos}
                statuses={statuses}
              />
            );
          })
        )}
      </FormSection>

      {!productCreated && <SimilarProductsWarning name={fields.name} sku="" />}

      {showErrors && errorKeys.length > 0 && (
        <div role="alert" className="text-sm text-danger">
          <p className="font-semibold">Revisá estos datos antes de crear el producto:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {errorKeys.map((key, index) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => goToField(key)}
                  className="text-left underline underline-offset-2"
                >
                  {missingLabels[index]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {saveError && (
        <p role="alert" className="text-sm text-danger">
          {saveError}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="min-h-11 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
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

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-4 rounded-md border border-border p-4 sm:p-5">
      <h3 id={id} className="font-display text-base font-semibold text-text">
        {title}
      </h3>
      {children}
    </section>
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
