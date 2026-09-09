import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { SeoHead } from "../../components/ui/SeoHead";
import { FormField } from "../../components/forms/FormField";
import { ApiClientError } from "../../services/api-client";
import { FRAME_SHAPE_OPTIONS } from "../../lib/optical-profile-taxonomy";
import {
  useAdminBrandsQuery,
  useAdminCategoriesQuery,
  useCreateProductMutation,
} from "../../services/queries/admin";

export function AdminNewProductPage() {
  const navigate = useNavigate();
  const { data: brands } = useAdminBrandsQuery();
  const { data: categories } = useAdminCategoriesQuery();
  const createProduct = useCreateProductMutation();

  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [shape, setShape] = useState("");
  const [basePrice, setBasePrice] = useState("");

  const activeBrands = brands?.filter((b) => !b.deletedAt) ?? [];
  const activeCategories = categories?.filter((c) => !c.deletedAt) ?? [];

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    createProduct.mutate(
      {
        name,
        brandId,
        categoryId,
        shape: shape.trim() === "" ? null : shape,
        basePrice: Number(basePrice),
      },
      { onSuccess: (product) => navigate(`/admin/products/${product.id}`, { replace: true }) },
    );
  }

  const errorMessage =
    createProduct.error instanceof ApiClientError
      ? createProduct.error.message
      : createProduct.isError
        ? "No pudimos crear el producto."
        : undefined;

  return (
    <div className="max-w-xl">
      <SeoHead title="Nuevo producto — Administración" />
      <h2 className="font-display text-lg font-semibold text-text">Nuevo producto</h2>
      <p className="mt-1 text-sm text-text-muted">
        Cargá los datos básicos. Vas a poder agregar variantes, imágenes y estilos después de
        crearlo.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <FormField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-text" htmlFor="brand-select">
            Marca
          </label>
          <select
            id="brand-select"
            value={brandId}
            onChange={(event) => setBrandId(event.target.value)}
            required
            className="w-full rounded-md border border-border bg-surface-muted px-4 py-2.5 text-text"
          >
            <option value="" disabled>
              Seleccioná una marca
            </option>
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
            required
            className="w-full rounded-md border border-border bg-surface-muted px-4 py-2.5 text-text"
          >
            <option value="" disabled>
              Seleccioná una categoría
            </option>
            {activeCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-text" htmlFor="shape-input">
            Forma (opcional)
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

        {errorMessage && (
          <p role="alert" className="text-sm text-danger">
            {errorMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={createProduct.isPending || !name || !brandId || !categoryId || !basePrice}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
        >
          {createProduct.isPending ? "Creando…" : "Crear producto"}
        </button>
      </form>
    </div>
  );
}
