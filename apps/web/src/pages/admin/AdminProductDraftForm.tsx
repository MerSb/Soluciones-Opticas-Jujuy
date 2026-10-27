import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AdminProductDetail,
  AdminVariantDto,
  AccessoryRole,
  CreateProductRequest,
  CreateVariantRequest,
  ProductKind,
} from "@soluciones-opticas/shared";
import { FormField } from "../../components/forms/FormField";
import { ShapeSelect } from "../../components/admin/ShapeSelect";
import {
  PhotoSequencePicker,
  usePhotoSequence,
  type PhotoUploadStatus,
} from "../../components/admin/PhotoSequencePicker";
import { ApiClientError, apiPost } from "../../services/api-client";
import { ACCESSORY_ROLE_OPTIONS, accessoryRoleUsage } from "../../lib/accessories";
import {
  EMPTY_PROGRESS,
  hasPendingChanges,
  type DraftProgress,
  type ProductDraftFields,
} from "../../lib/product-drafts";
import {
  invalidateProduct,
  uploadProductImage,
  useSimilarProductsQuery,
} from "../../services/queries/admin";

// One tab of the multi-tab new-product page: the same basic fields as the
// single form, plus an optional first color with its photos (photos belong
// to a variant). Saving runs the existing endpoints in order — product,
// color, each photo — and remembers what is already created, so a retry
// after an error continues from there and never creates the product twice.

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
  /** Photos already uploaded before a reload (on the server, not in this list). */
  previouslyUploadedPhotos?: number;
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
  previouslyUploadedPhotos = 0,
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
  // Photos are numbered by clicking them (PhotoSequencePicker); only the
  // numbered ones are uploaded, in that order.
  const sequence = usePhotoSequence();
  const photos = sequence.selected;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Double-click guard: state updates are not synchronous.
  const savingRef = useRef(false);
  const progressRef = useRef(progress);
  const photosRef = useRef(photos);
  photosRef.current = photos;
  // The photo whose upload failed after being signed, with the public_id
  // it was signed with: it may be saved after all (only the answer lost),
  // so its retry registers that id again (the API saves each one once)
  // before uploading anything, and it can't be unselected meanwhile.
  const unsureRef = useRef<{ key: string; publicId: string } | null>(null);
  const [unsureKey, setUnsureKey] = useState<string | null>(null);

  const isAccessory = fields.kind === "ACCESSORY";
  const productCreated = progress.productId !== null;
  const dirty = hasPendingChanges(fields, sequence.candidates.length, saved);

  useEffect(() => {
    onChange({ fields, progress, photoCount: photos.length, dirty, saved, saving });
    // onChange is a stable callback from the parent.
  }, [fields, progress, photos.length, dirty, saved, saving]);

  function set<K extends keyof ProductDraftFields>(key: K, value: ProductDraftFields[K]) {
    setSaveError(null);
    setFields((current) => ({ ...current, [key]: value }));
  }

  function updateProgress(next: DraftProgress) {
    progressRef.current = next;
    setProgress(next);
  }

  const wantsVariant =
    photos.length > 0 ||
    fields.color.trim() !== "" ||
    fields.sku.trim() !== "" ||
    fields.stock !== "";
  const stockNumber = fields.stock === "" ? 0 : Number(fields.stock);
  const missing: string[] = [];
  if (!fields.name.trim()) missing.push("el nombre");
  if (!fields.brandId) missing.push("la marca");
  if (!fields.categoryId) missing.push("la categoría");
  if (!fields.basePrice || Number(fields.basePrice) <= 0) missing.push("el precio");
  if (isAccessory && !fields.accessoryRole) missing.push("el tipo de accesorio");
  if (wantsVariant && !fields.sku.trim())
    missing.push("el SKU del color (las fotos van en un color)");
  if (wantsVariant && (!Number.isInteger(stockNumber) || stockNumber < 0)) {
    missing.push("un stock válido (número entero, 0 o más)");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current || saved || missing.length > 0) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    let step = "product";
    try {
      let { productId, variantId, uploadedPhotos } = progressRef.current;
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
        updateProgress({ productId, variantId, uploadedPhotos });
      }
      if (wantsVariant && !variantId) {
        step = "variant";
        const body: CreateVariantRequest = {
          color: fields.color.trim() || null,
          sku: fields.sku.trim(),
          stock: stockNumber,
        };
        const variant = await apiPost<AdminVariantDto>(
          `/api/admin/products/${productId}/variants`,
          body,
        );
        variantId = variant.id;
        updateProgress({ productId, variantId, uploadedPhotos });
      }
      const list = photosRef.current;
      for (let index = uploadedPhotos; index < list.length; index += 1) {
        step = `photo:${index + 1}`;
        const key = list[index]!.key;
        const previous = unsureRef.current?.key === key ? unsureRef.current.publicId : undefined;
        const alt = [fields.name.trim(), fields.color.trim(), `foto ${index + 1}`]
          .filter(Boolean)
          .join(" — ");
        await uploadProductImage(
          productId,
          variantId!,
          {
            file: list[index]!.file,
            alt,
            // The first photo of the color is the primary one.
            isPrimary: index === 0 && previouslyUploadedPhotos === 0,
          },
          (publicId) => {
            unsureRef.current = { key, publicId };
          },
          previous,
        );
        unsureRef.current = null;
        uploadedPhotos = index + 1;
        updateProgress({ productId, variantId, uploadedPhotos });
      }
      invalidateProduct(queryClient, productId);
      setSaved(true);
      onSaved(productId);
    } catch (error) {
      const productId = progressRef.current.productId;
      if (productId) invalidateProduct(queryClient, productId);
      setSaveError(
        step === "product"
          ? describe(error, "No pudimos crear el producto.")
          : step === "variant"
            ? `El producto se creó, pero no su color: ${describe(error, "no pudimos crear el color.")}`
            : `El producto y su color se crearon, pero falló la ${step.replace("photo:", "foto ")}: ${describe(error, "no pudimos subir la foto.")}`,
      );
    } finally {
      setUnsureKey(unsureRef.current?.key ?? null);
      savingRef.current = false;
      setSaving(false);
    }
  }

  // Already uploaded photos keep their number; the one being saved shows it.
  // A failed photo that may be saved after all is locked too.
  const uploadedKeys = photos.slice(0, progress.uploadedPhotos).map((p) => p.key);
  const lockedKeys = new Set(unsureKey ? [...uploadedKeys, unsureKey] : uploadedKeys);
  const current = photos[progress.uploadedPhotos]?.key;
  const photoStatuses: Record<string, PhotoUploadStatus> = Object.fromEntries([
    ...uploadedKeys.map((key) => [key, "saved" as const]),
    ...(current && saving ? [[current, "uploading" as const]] : []),
    // Only a photo step can fail once the color exists.
    ...(current && !saving && saveError && progress.variantId
      ? [[current, "failed" as const]]
      : []),
  ]);

  const selectClass =
    "w-full rounded-md border border-border bg-surface-muted px-4 py-2.5 text-text disabled:opacity-60";
  const locked = productCreated || saving;

  if (saved && progress.productId) {
    return (
      <div className="rounded-md border border-border p-4 text-sm text-text">
        <p className="font-semibold text-success">✓ «{fields.name}» guardado.</p>
        <p className="mt-1 text-text-muted">
          {photos.length > 0
            ? `${photos.length} foto${photos.length === 1 ? "" : "s"} en el color ${fields.color || fields.sku}.`
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
          {previouslyUploadedPhotos > 0
            ? ` (ya se habían subido ${previouslyUploadedPhotos}; elegí solo las que faltan)`
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

      <fieldset
        className="space-y-3 rounded-md border border-border p-4"
        disabled={saving || progress.variantId !== null}
      >
        <legend className="px-1 text-sm font-semibold text-text">
          Primer color y fotos (opcional)
        </legend>
        <p className="text-xs text-text-muted">
          Las fotos se guardan en este color. Otros colores se agregan después en la ficha.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField
            label="Color"
            hint="Color principal primero: «Negro mate», «Rosa transparente»."
            value={fields.color}
            onChange={(e) => set("color", e.target.value)}
          />
          <FormField
            label="SKU"
            hint="Código único de este color. No reutilices uno existente."
            value={fields.sku}
            onChange={(e) => set("sku", e.target.value)}
          />
          <FormField
            label="Stock"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={fields.stock}
            onChange={(e) => set("stock", e.target.value)}
          />
        </div>
      </fieldset>

      <div>
        <p className="mb-1.5 text-sm font-medium text-text">Fotos de este color</p>
        <PhotoSequencePicker
          sequence={sequence}
          firstIsPrimary={previouslyUploadedPhotos === 0}
          existingCount={previouslyUploadedPhotos}
          disabled={saving}
          locked={lockedKeys}
          statuses={photoStatuses}
        />
      </div>

      {!productCreated && <SimilarProductsWarning name={fields.name} sku={fields.sku} />}

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
