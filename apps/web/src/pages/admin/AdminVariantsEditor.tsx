import { useState } from "react";
import type { FormEvent } from "react";
import type { AdminVariantDto, ProductKind } from "@soluciones-opticas/shared";
import { FormField } from "../../components/forms/FormField";
import { ApiClientError } from "../../services/api-client";
import { COLOR_FAMILY_OPTIONS, FRAME_MATERIAL_OPTIONS } from "../../lib/optical-profile-taxonomy";
import {
  useCreateVariantMutation,
  useDeleteVariantMutation,
  useUpdateVariantMutation,
} from "../../services/queries/admin";
import { AdminVariantImagesEditor } from "./AdminVariantImagesEditor";
import { AccessoryColorPicker } from "./AccessoryColorPicker";
import { VariantSkuEditor } from "./VariantSkuEditor";

const blankToNull = (value: string) => (value.trim() === "" ? null : value.trim());
// An empty stock field must never be saved as 0 by accident (Number("")
// is 0); 0 typed on purpose is still accepted.
const isBlank = (value: string) => value.trim() === "";
const STOCK_REQUIRED = "Ingresá el stock (0 si no hay unidades).";
// Same description the new-product page gives its photos ("— foto N" is
// added per photo).
function photoAltBase(productName: string, variant: AdminVariantDto): string {
  return (
    [productName.trim(), variant.label, variant.color].filter(Boolean).join(" — ") || variant.sku
  );
}

const priceOrNull = (value: string) => (value.trim() === "" ? null : Number(value));

// ADR-0028: an accessory's variants are its colors or presentations
// (e.g. a cleaner's sizes), each with its own optional price. A frame's
// variants keep exactly the existing form and card.
export function AdminVariantsEditor({
  productId,
  productSlug = "",
  productName = "",
  variants,
  kind = "FRAME",
}: {
  productId: string;
  /** For the description of new photos ("Product — Color — foto N"). */
  productName?: string;
  /** For suggested SKUs of new accessory colors. */
  productSlug?: string;
  variants: AdminVariantDto[];
  kind?: ProductKind;
}) {
  const isAccessory = kind === "ACCESSORY";
  const createVariant = useCreateVariantMutation(productId);
  const [color, setColor] = useState("");
  const [material, setMaterial] = useState("");
  const [label, setLabel] = useState("");
  const [priceOverride, setPriceOverride] = useState("");
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
        ...(isAccessory
          ? { label: blankToNull(label), priceOverride: priceOrNull(priceOverride) }
          : {}),
      },
      {
        onSuccess: () => {
          setColor("");
          setMaterial("");
          setLabel("");
          setPriceOverride("");
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
      <h3 className="font-display text-base font-semibold text-text">
        {isAccessory ? "Colores y presentaciones" : "Variantes"}
      </h3>
      <p className="mt-1 text-sm text-text-muted">
        {isAccessory
          ? "Cada color o presentación tiene su propio SKU, stock y fotos. Si no le ponés precio propio, usa el precio del accesorio."
          : "Cada variante representa un color/material con su propio SKU y stock. Las imágenes se suben por variante, directo a nuestro proveedor de imágenes."}
      </p>

      <div className="mt-4 space-y-4">
        {variants.map((variant) =>
          isAccessory ? (
            <AccessoryVariantCard
              key={variant.id}
              productId={productId}
              productName={productName}
              variant={variant}
            />
          ) : (
            <VariantCard
              key={variant.id}
              productId={productId}
              productName={productName}
              variant={variant}
            />
          ),
        )}
        {variants.length === 0 && (
          <p className="text-sm text-text-muted">Todavía no hay variantes cargadas.</p>
        )}
      </div>

      {isAccessory && (
        <div className="mt-6">
          <AccessoryColorPicker
            productId={productId}
            productSlug={productSlug}
            variants={variants}
          />
          <p className="mt-6 text-sm font-medium text-text">
            ¿Es una presentación (por ejemplo, un tamaño)? Cargala acá:
          </p>
        </div>
      )}

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
        {isAccessory && (
          <>
            <FormField
              label="Presentación (opcional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={100}
              className="w-44"
            />
            <FormField
              label="Precio propio (opcional)"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={priceOverride}
              onChange={(e) => setPriceOverride(e.target.value)}
              className="w-40"
            />
          </>
        )}
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
          error={isBlank(stock) ? STOCK_REQUIRED : undefined}
          className="w-28"
        />
        <button
          type="submit"
          disabled={createVariant.isPending || sku.trim() === "" || isBlank(stock)}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
        >
          {createVariant.isPending
            ? "Agregando…"
            : isAccessory
              ? "Agregar presentación"
              : "Agregar variante"}
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

// Real Catalog Readiness §9 — explains the irreversible, cascading
// consequences in plain language (never mentions Cloudinary/providers)
// before the variant (and everything it carries) is gone for good.
function confirmDeleteVariant(imageCount: number): boolean {
  const message =
    imageCount > 0
      ? `Esta variante tiene ${imageCount} ${imageCount === 1 ? "imagen cargada" : "imágenes cargadas"}. Al eliminarla también se eliminarán sus imágenes y stock. Esta acción no se puede deshacer.`
      : "Al eliminar esta variante también se eliminará su información de stock. Esta acción no se puede deshacer.";
  return window.confirm(message);
}

// Accessories: removing a color is final, while running out is not — so
// the warning points to stock 0 first. (No order, prize or saved quote
// references a variant in this schema; quotes are never stored.)
function confirmDeleteAccessoryVariant(name: string, imageCount: number): boolean {
  const images =
    imageCount > 0 ? ` y ${imageCount === 1 ? "su imagen" : `sus ${imageCount} imágenes`}` : "";
  return window.confirm(
    `Vas a eliminar «${name}»${images}. Dejará de ofrecerse en la tienda y no se puede deshacer.\n\nSi solo se agotó, mejor poné su stock en 0: sigue cargado y vuelve a ofrecerse cuando haya unidades.`,
  );
}

function VariantCard({
  productId,
  productName,
  variant,
}: {
  productId: string;
  productName: string;
  variant: AdminVariantDto;
}) {
  const updateVariant = useUpdateVariantMutation(productId);
  const deleteVariant = useDeleteVariantMutation(productId);
  const [stock, setStock] = useState(variant.stock.toString());

  const updateError =
    updateVariant.error instanceof ApiClientError ? updateVariant.error.message : undefined;
  const deleteError =
    deleteVariant.error instanceof ApiClientError ? deleteVariant.error.message : undefined;

  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-text">
            {variant.color ?? "Sin color"} · {variant.material ?? "Sin material"}
          </p>
          <VariantSkuEditor productId={productId} variant={variant} />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="1"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            aria-label={`Stock de ${variant.sku}`}
            aria-invalid={isBlank(stock)}
            aria-describedby={isBlank(stock) ? `stock-hint-${variant.id}` : undefined}
            className="w-20 rounded-md border border-border bg-surface-muted px-2 py-1.5 text-sm text-text"
          />
          <button
            type="button"
            onClick={() =>
              updateVariant.mutate({ variantId: variant.id, body: { stock: Number(stock) } })
            }
            disabled={updateVariant.isPending || isBlank(stock) || Number(stock) === variant.stock}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text hover:bg-surface-muted disabled:opacity-60"
          >
            {updateVariant.isPending ? "Guardando…" : "Guardar stock"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirmDeleteVariant(variant.images.length)) {
                deleteVariant.mutate(variant.id);
              }
            }}
            disabled={deleteVariant.isPending}
            className="text-sm font-medium text-danger hover:underline disabled:opacity-60"
          >
            Eliminar
          </button>
        </div>
      </div>
      {isBlank(stock) && (
        <p id={`stock-hint-${variant.id}`} className="mt-1 text-xs text-danger">
          {STOCK_REQUIRED}
        </p>
      )}
      {updateError && (
        <p role="alert" className="mt-1 text-xs text-danger">
          No pudimos guardar el stock: {updateError}
        </p>
      )}
      {deleteError && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {deleteError}
        </p>
      )}

      <AdminVariantImagesEditor
        productId={productId}
        variantId={variant.id}
        images={variant.images}
        altBase={photoAltBase(productName, variant)}
      />
    </div>
  );
}

function AccessoryVariantCard({
  productId,
  productName,
  variant,
}: {
  productId: string;
  productName: string;
  variant: AdminVariantDto;
}) {
  const updateVariant = useUpdateVariantMutation(productId);
  const deleteVariant = useDeleteVariantMutation(productId);
  const [label, setLabel] = useState(variant.label ?? "");
  const [price, setPrice] = useState(variant.priceOverride?.toString() ?? "");
  const [stock, setStock] = useState(variant.stock.toString());

  const title =
    [variant.label, variant.color, variant.material].filter(Boolean).join(" · ") || "Única";
  const stockMissing = isBlank(stock);
  const changed =
    blankToNull(label) !== variant.label ||
    priceOrNull(price) !== variant.priceOverride ||
    Number(stock) !== variant.stock;

  function save() {
    updateVariant.mutate({
      variantId: variant.id,
      body: { label: blankToNull(label), priceOverride: priceOrNull(price), stock: Number(stock) },
    });
  }

  const updateError =
    updateVariant.error instanceof ApiClientError ? updateVariant.error.message : undefined;
  const deleteError =
    deleteVariant.error instanceof ApiClientError ? deleteVariant.error.message : undefined;

  return (
    <div className="rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex flex-wrap items-center gap-2 font-medium text-text">
            {title}
            {variant.stock === 0 && (
              <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
                Agotado
              </span>
            )}
          </p>
          <VariantSkuEditor productId={productId} variant={variant} />
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirmDeleteAccessoryVariant(title, variant.images.length)) {
              deleteVariant.mutate(variant.id);
            }
          }}
          disabled={deleteVariant.isPending}
          className="text-sm font-medium text-danger hover:underline disabled:opacity-60"
        >
          Eliminar
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <FormField
          label="Presentación"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={100}
          className="w-44"
        />
        <FormField
          label="Precio propio"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          placeholder="Precio base"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className="w-40"
        />
        <FormField
          label="Stock"
          type="number"
          min="0"
          step="1"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          error={stockMissing ? STOCK_REQUIRED : undefined}
          className="w-28"
        />
        <button
          type="button"
          onClick={save}
          disabled={updateVariant.isPending || !changed || stockMissing}
          className="rounded-md border border-border px-3 py-2.5 text-sm font-medium text-text hover:bg-surface-muted disabled:opacity-60"
        >
          {updateVariant.isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
      <div role="status" aria-label={`Estado de ${title}`}>
        {updateVariant.isSuccess && !changed && (
          <p className="mt-1 text-xs text-success">Cambios guardados.</p>
        )}
      </div>
      {updateError && (
        <p role="alert" className="mt-1 text-xs text-danger">
          No pudimos guardar los cambios: {updateError}
        </p>
      )}
      {deleteError && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {deleteError}
        </p>
      )}

      <AdminVariantImagesEditor
        productId={productId}
        variantId={variant.id}
        images={variant.images}
        altBase={photoAltBase(productName, variant)}
      />
    </div>
  );
}
