import { useId, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { AdminImageDto, AdminVariantDto } from "@soluciones-opticas/shared";
import { FormField } from "../../components/forms/FormField";
import { ProductImage } from "../../components/products/ProductImage";
import { ApiClientError } from "../../services/api-client";
import { COLOR_FAMILY_OPTIONS, FRAME_MATERIAL_OPTIONS } from "../../lib/optical-profile-taxonomy";
import { CLOUDINARY_WIDTHS } from "../../lib/cloudinary";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  validateImageFile,
} from "../../lib/image-validation";
import {
  useCreateVariantMutation,
  useDeleteImageMutation,
  useDeleteVariantMutation,
  useUpdateImageMutation,
  useUpdateVariantMutation,
  useUploadProductImageMutation,
} from "../../services/queries/admin";

export function AdminVariantsEditor({
  productId,
  variants,
}: {
  productId: string;
  variants: AdminVariantDto[];
}) {
  const createVariant = useCreateVariantMutation(productId);
  const [color, setColor] = useState("");
  const [material, setMaterial] = useState("");
  const [sku, setSku] = useState("");
  const [stock, setStock] = useState("0");

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createVariant.mutate(
      {
        color: color.trim() === "" ? null : color,
        material: material.trim() === "" ? null : material,
        sku,
        stock: Number(stock),
      },
      {
        onSuccess: () => {
          setColor("");
          setMaterial("");
          setSku("");
          setStock("0");
        },
      },
    );
  }

  const createError =
    createVariant.error instanceof ApiClientError ? createVariant.error.message : undefined;

  return (
    <div>
      <h3 className="font-display text-base font-semibold text-text">Variantes</h3>
      <p className="mt-1 text-sm text-text-muted">
        Cada variante representa un color/material con su propio SKU y stock. Las imágenes se suben
        por variante, directo a nuestro proveedor de imágenes.
      </p>

      <div className="mt-4 space-y-4">
        {variants.map((variant) => (
          <VariantCard key={variant.id} productId={productId} variant={variant} />
        ))}
        {variants.length === 0 && (
          <p className="text-sm text-text-muted">Todavía no hay variantes cargadas.</p>
        )}
      </div>

      <form
        onSubmit={handleCreate}
        className="mt-6 flex flex-wrap items-end gap-3 border-t border-border pt-6"
        noValidate
      >
        <div>
          <label className="mb-1.5 block text-sm font-medium text-text" htmlFor="new-variant-color">
            Color
          </label>
          <input
            id="new-variant-color"
            list="color-options"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-40 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text"
          />
          <datalist id="color-options">
            {COLOR_FAMILY_OPTIONS.map((option) => (
              <option key={option.value} value={option.label} />
            ))}
          </datalist>
        </div>
        <div>
          <label
            className="mb-1.5 block text-sm font-medium text-text"
            htmlFor="new-variant-material"
          >
            Material
          </label>
          <input
            id="new-variant-material"
            list="material-options"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            className="w-40 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text"
          />
          <datalist id="material-options">
            {FRAME_MATERIAL_OPTIONS.map((option) => (
              <option key={option.value} value={option.label} />
            ))}
          </datalist>
        </div>
        <FormField
          label="SKU"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          required
          className="w-40"
        />
        <FormField
          label="Stock"
          type="number"
          min="0"
          step="1"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className="w-28"
        />
        <button
          type="submit"
          disabled={createVariant.isPending || sku.trim() === ""}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
        >
          {createVariant.isPending ? "Agregando…" : "Agregar variante"}
        </button>
      </form>
      {createError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {createError}
        </p>
      )}
    </div>
  );
}

function VariantCard({ productId, variant }: { productId: string; variant: AdminVariantDto }) {
  const updateVariant = useUpdateVariantMutation(productId);
  const deleteVariant = useDeleteVariantMutation(productId);
  const [stock, setStock] = useState(variant.stock.toString());

  const deleteError =
    deleteVariant.error instanceof ApiClientError ? deleteVariant.error.message : undefined;

  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-text">
            {variant.color ?? "Sin color"} · {variant.material ?? "Sin material"}
          </p>
          <p className="text-sm text-text-muted">SKU: {variant.sku}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="1"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            aria-label={`Stock de ${variant.sku}`}
            className="w-20 rounded-md border border-border bg-surface-muted px-2 py-1.5 text-sm text-text"
          />
          <button
            type="button"
            onClick={() =>
              updateVariant.mutate({ variantId: variant.id, body: { stock: Number(stock) } })
            }
            disabled={updateVariant.isPending || Number(stock) === variant.stock}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-muted disabled:opacity-60"
          >
            Guardar stock
          </button>
          <button
            type="button"
            onClick={() => deleteVariant.mutate(variant.id)}
            disabled={deleteVariant.isPending}
            className="text-sm font-medium text-danger hover:underline disabled:opacity-60"
          >
            Eliminar
          </button>
        </div>
      </div>
      {deleteError && <p className="mt-1 text-xs text-danger">{deleteError}</p>}

      <ImagesEditor productId={productId} variantId={variant.id} images={variant.images} />
    </div>
  );
}

function ImagesEditor({
  productId,
  variantId,
  images,
}: {
  productId: string;
  variantId: string;
  images: AdminImageDto[];
}) {
  const updateImage = useUpdateImageMutation(productId, variantId);
  const deleteImage = useDeleteImageMutation(productId, variantId);

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-sm font-medium text-text">Imágenes</p>
      <ul className="mt-2 flex flex-wrap gap-3">
        {images.map((image) => (
          <li key={image.id} className="w-28 text-center">
            <ProductImage
              publicId={image.cloudinaryPublicId}
              alt={image.alt}
              widths={CLOUDINARY_WIDTHS.adminThumbnail}
              aspectRatio="1 / 1"
              className="w-28 rounded-md"
            />
            <p className="mt-1 truncate text-xs text-text-muted" title={image.alt}>
              {image.alt}
            </p>
            {image.isPrimary ? (
              <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                Principal
              </span>
            ) : (
              <button
                type="button"
                onClick={() => updateImage.mutate({ imageId: image.id, body: { isPrimary: true } })}
                disabled={updateImage.isPending}
                className="mt-1 block text-xs font-medium text-primary hover:underline disabled:opacity-60"
              >
                Marcar principal
              </button>
            )}
            <button
              type="button"
              onClick={() => deleteImage.mutate(image.id)}
              disabled={deleteImage.isPending}
              className="mt-1 block text-xs font-medium text-danger hover:underline disabled:opacity-60"
            >
              Eliminar
            </button>
            {deleteImage.isError && deleteImage.variables === image.id && (
              <p className="mt-1 text-xs text-danger">
                {deleteImage.error instanceof ApiClientError
                  ? deleteImage.error.message
                  : "No se pudo eliminar."}
              </p>
            )}
          </li>
        ))}
        {images.length === 0 && (
          <li className="text-sm text-text-muted">Todavía no hay imágenes para esta variante.</li>
        )}
      </ul>

      <ImageUploadForm
        productId={productId}
        variantId={variantId}
        isFirstImage={images.length === 0}
      />
    </div>
  );
}

function ImageUploadForm({
  productId,
  variantId,
  isFirstImage,
}: {
  productId: string;
  variantId: string;
  isFirstImage: boolean;
}) {
  const upload = useUploadProductImageMutation(productId, variantId);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputId = useId();

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    upload.reset();

    if (!selected) return;
    const error = validateImageFile(selected);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  }

  function resetForm() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setAlt("");
    setValidationError(null);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    upload.mutate({ file, alt, isPrimary: isFirstImage }, { onSuccess: () => resetForm() });
  }

  const uploadErrorMessage =
    upload.error instanceof Error ? upload.error.message : "No se pudo subir la imagen.";

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-3" noValidate>
      {previewUrl && (
        // Preview only — never implies the upload has actually
        // succeeded (§14): it's built from the local file the browser
        // already has, shown while `upload` is still idle/pending.
        <img
          src={previewUrl}
          alt=""
          aria-hidden="true"
          className="h-16 w-16 rounded-md border border-border object-cover"
        />
      )}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-text" htmlFor={inputId}>
          Imagen (JPEG, PNG o WebP, máx. {MAX_IMAGE_BYTES / (1024 * 1024)} MB)
        </label>
        <input
          id={inputId}
          type="file"
          accept={ALLOWED_IMAGE_MIME_TYPES.join(",")}
          onChange={handleFileChange}
          className="text-sm text-text"
        />
      </div>
      <FormField
        label="Texto alternativo"
        value={alt}
        onChange={(e) => setAlt(e.target.value)}
        required
        className="w-56"
      />
      <button
        type="submit"
        disabled={upload.isPending || !file || !alt}
        className="rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-muted disabled:opacity-60"
      >
        {upload.isPending ? "Subiendo…" : "Subir imagen"}
      </button>
      {validationError && (
        <p role="alert" className="w-full text-sm text-danger">
          {validationError}
        </p>
      )}
      {upload.isError && (
        <div className="flex w-full items-center gap-2">
          <p role="alert" className="text-sm text-danger">
            {uploadErrorMessage}
          </p>
          <button
            type="button"
            onClick={() => upload.mutate({ file: file!, alt, isPrimary: isFirstImage })}
            className="text-sm font-medium text-primary hover:underline"
          >
            Reintentar
          </button>
        </div>
      )}
    </form>
  );
}
