import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import type { StylePreference } from "@soluciones-opticas/shared";
import { SeoHead } from "../../components/ui/SeoHead";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { FormField } from "../../components/forms/FormField";
import { PreferenceChipGroup } from "../../components/optical-profile/PreferenceChipGroup";
import { FRAME_SHAPE_OPTIONS, STYLE_PREFERENCE_OPTIONS } from "../../lib/optical-profile-taxonomy";
import { ApiClientError } from "../../services/api-client";
import type { AdminVariantDto } from "@soluciones-opticas/shared";
import {
  useAdminBrandsQuery,
  useAdminCategoriesQuery,
  useAdminProductQuery,
  useDeleteProductMutation,
  useRestoreProductMutation,
  useUpdateProductMutation,
} from "../../services/queries/admin";
import { AdminVariantsEditor } from "./AdminVariantsEditor";
import { AdminProductLensTypesSection } from "./AdminProductLensTypesSection";

interface MeasurementsState {
  lensWidth: string;
  bridgeWidth: string;
  templeLength: string;
  lensHeight: string;
  frameWidth: string;
}

function toMeasurement(value: number | null): string {
  return value?.toString() ?? "";
}

function parseMeasurement(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

// Real Catalog Readiness §5 — plain-language, specific about what's
// actually missing (never "entity"/"asset"/"relation"). Mirrors the
// backend's own completeness rule (computeIsComplete /
// COMPLETE_PRODUCT_WHERE): at least one variant, and at least one image
// on some variant.
function completenessHelpText(variants: AdminVariantDto[]): string {
  const hasVariant = variants.length > 0;
  const hasImage = variants.some((variant) => variant.images.length > 0);
  if (!hasVariant && !hasImage) {
    return "Agregá una variante y al menos una imagen para publicar el producto.";
  }
  if (!hasVariant) {
    return "Agregá al menos una variante para que el producto pueda mostrarse.";
  }
  return "Agregá al menos una imagen para que el producto pueda mostrarse.";
}

export function AdminProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading, isError } = useAdminProductQuery(id);
  const { data: brands } = useAdminBrandsQuery();
  const { data: categories } = useAdminCategoriesQuery();
  const updateProduct = useUpdateProductMutation();
  const deleteProduct = useDeleteProductMutation();
  const restoreProduct = useRestoreProductMutation();

  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [shape, setShape] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [styles, setStyles] = useState<StylePreference[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementsState>({
    lensWidth: "",
    bridgeWidth: "",
    templeLength: "",
    lensHeight: "",
    frameWidth: "",
  });

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setBrandId(product.brand.id);
    setCategoryId(product.category.id);
    setShape(product.shape ?? "");
    setBasePrice(product.basePrice.toString());
    setStyles(product.styles);
    setMeasurements({
      lensWidth: toMeasurement(product.frameMeasurements.lensWidth),
      bridgeWidth: toMeasurement(product.frameMeasurements.bridgeWidth),
      templeLength: toMeasurement(product.frameMeasurements.templeLength),
      lensHeight: toMeasurement(product.frameMeasurements.lensHeight),
      frameWidth: toMeasurement(product.frameMeasurements.frameWidth),
    });
  }, [product]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!id) return;
    updateProduct.mutate({
      id,
      body: {
        name,
        brandId,
        categoryId,
        shape: shape.trim() === "" ? null : shape,
        basePrice: Number(basePrice),
        styles,
        lensWidth: parseMeasurement(measurements.lensWidth),
        bridgeWidth: parseMeasurement(measurements.bridgeWidth),
        templeLength: parseMeasurement(measurements.templeLength),
        lensHeight: parseMeasurement(measurements.lensHeight),
        frameWidth: parseMeasurement(measurements.frameWidth),
      },
    });
  }

  if (isLoading) return <p className="text-sm text-text-muted">Cargando…</p>;
  if (isError || !product) {
    return <StatusMessage variant="error" message="No pudimos cargar este producto." />;
  }

  const activeBrands = (brands ?? []).filter((b) => !b.deletedAt || b.id === product.brand.id);
  const activeCategories = (categories ?? []).filter(
    (c) => !c.deletedAt || c.id === product.category.id,
  );

  const errorMessage =
    updateProduct.error instanceof ApiClientError
      ? updateProduct.error.message
      : updateProduct.isError
        ? "No pudimos guardar los cambios."
        : undefined;

  return (
    <div className="max-w-3xl">
      <SeoHead title={`${product.name} — Administración`} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-text">{product.name}</h2>
            {!product.deletedAt && !product.isComplete && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                Incompleto
              </span>
            )}
          </div>
          <p className="text-sm text-text-muted">Slug: {product.slug} (no editable)</p>
        </div>
        {product.deletedAt ? (
          <button
            type="button"
            onClick={() => restoreProduct.mutate(product.id)}
            disabled={restoreProduct.isPending}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text hover:bg-surface-muted disabled:opacity-60"
          >
            Restaurar producto
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`¿Eliminar "${product.name}"? Vas a poder restaurarlo después.`)) {
                deleteProduct.mutate(product.id);
              }
            }}
            disabled={deleteProduct.isPending}
            className="rounded-md border border-danger px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60"
          >
            Eliminar producto
          </button>
        )}
      </div>

      {!product.deletedAt && !product.isComplete && (
        <p className="mt-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-text">
          {completenessHelpText(product.variants)}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <FormField
            label="Precio base (ARS)"
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
            required
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium text-text" htmlFor="brand-select">
              Marca
            </label>
            <select
              id="brand-select"
              value={brandId}
              onChange={(event) => setBrandId(event.target.value)}
              className="w-full rounded-md border border-border bg-surface-muted px-4 py-2.5 text-text"
            >
              {activeBrands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-text" htmlFor="category-select">
              Categoría
            </label>
            <select
              id="category-select"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="w-full rounded-md border border-border bg-surface-muted px-4 py-2.5 text-text"
            >
              {activeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-text" htmlFor="shape-input">
              Forma
            </label>
            <input
              id="shape-input"
              list="shape-options"
              value={shape}
              onChange={(event) => setShape(event.target.value)}
              className="w-full rounded-md border border-border bg-surface-muted px-4 py-2.5 text-text"
            />
            <datalist id="shape-options">
              {FRAME_SHAPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.label} />
              ))}
            </datalist>
          </div>
        </div>

        <div>
          <h3 className="font-display text-base font-semibold text-text">
            Medidas del armazón (opcional)
          </h3>
          <p className="mt-1 text-sm text-text-muted">
            Estas medidas suelen estar impresas en la parte interna de la patilla del armazón.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField
              label="Ancho del lente (mm)"
              type="number"
              inputMode="decimal"
              value={measurements.lensWidth}
              onChange={(e) => setMeasurements((m) => ({ ...m, lensWidth: e.target.value }))}
            />
            <FormField
              label="Ancho del puente (mm)"
              type="number"
              inputMode="decimal"
              value={measurements.bridgeWidth}
              onChange={(e) => setMeasurements((m) => ({ ...m, bridgeWidth: e.target.value }))}
            />
            <FormField
              label="Largo de patilla (mm)"
              type="number"
              inputMode="decimal"
              value={measurements.templeLength}
              onChange={(e) => setMeasurements((m) => ({ ...m, templeLength: e.target.value }))}
            />
            <FormField
              label="Altura del lente (mm)"
              type="number"
              inputMode="decimal"
              value={measurements.lensHeight}
              onChange={(e) => setMeasurements((m) => ({ ...m, lensHeight: e.target.value }))}
            />
            <FormField
              label="Ancho del armazón (mm)"
              type="number"
              inputMode="decimal"
              value={measurements.frameWidth}
              onChange={(e) => setMeasurements((m) => ({ ...m, frameWidth: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <h3 className="font-display text-base font-semibold text-text">Estilos</h3>
          <p className="mt-1 text-sm text-text-muted">
            Usado por el motor de recomendaciones para comparar contra las preferencias de estilo de
            cada cliente.
          </p>
          <div className="mt-3">
            <PreferenceChipGroup
              legend="Estilos"
              options={STYLE_PREFERENCE_OPTIONS}
              selected={styles}
              onToggle={(value) =>
                setStyles((current) =>
                  current.includes(value)
                    ? current.filter((v) => v !== value)
                    : [...current, value],
                )
              }
            />
          </div>
        </div>

        {errorMessage && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
        )}
        {updateProduct.isSuccess && !updateProduct.isPending && (
          <p role="status" className="text-sm text-success">
            Los cambios se guardaron correctamente.
          </p>
        )}

        <button
          type="submit"
          disabled={updateProduct.isPending}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
        >
          {updateProduct.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>

      <div className="mt-12">
        <AdminVariantsEditor productId={product.id} variants={product.variants} />
      </div>

      <div className="mt-12">
        <AdminProductLensTypesSection product={product} />
      </div>
    </div>
  );
}
