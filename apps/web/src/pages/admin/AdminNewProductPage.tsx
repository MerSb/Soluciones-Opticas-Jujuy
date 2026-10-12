import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { AccessoryRole, ProductKind } from "@soluciones-opticas/shared";
import { SeoHead } from "../../components/ui/SeoHead";
import { FormField } from "../../components/forms/FormField";
import { ApiClientError } from "../../services/api-client";
import { FRAME_SHAPE_OPTIONS } from "../../lib/optical-profile-taxonomy";
import { ACCESSORY_ROLE_OPTIONS, accessoryRoleUsage } from "../../lib/accessories";
import { useIncludedAccessoriesQuery } from "../../services/queries/products";
import { isIncludedAccessoriesDto } from "../../lib/included-accessories";
import { formatPrice } from "../../lib/format-price";
import {
  useAdminBrandsQuery,
  useAdminCategoriesQuery,
  useCreateProductMutation,
} from "../../services/queries/admin";

export function AdminNewProductPage() {
  const navigate = useNavigate();
  // "Nuevo accesorio" in the products list links here with ?tipo=accesorio.
  const [searchParams] = useSearchParams();
  const { data: brands } = useAdminBrandsQuery();
  const { data: categories } = useAdminCategoriesQuery();
  const createProduct = useCreateProductMutation();
  // ADR-0028 Phase 2 — the personalized-cord surcharge, from the API.
  const includedOffer = useIncludedAccessoriesQuery();
  const includedSurchargeText = isIncludedAccessoriesDto(includedOffer.data)
    ? formatPrice(includedOffer.data.customCord.surcharge)
    : null;

  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [shape, setShape] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [kind, setKind] = useState<ProductKind>(
    searchParams.get("tipo") === "accesorio" ? "ACCESSORY" : "FRAME",
  );
  const [accessoryRole, setAccessoryRole] = useState<AccessoryRole | "">("");
  const [soldIndividually, setSoldIndividually] = useState(true);
  const isAccessory = kind === "ACCESSORY";

  const activeBrands = brands?.filter((b) => !b.deletedAt) ?? [];
  const activeCategories = categories?.filter((c) => !c.deletedAt) ?? [];

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    createProduct.mutate(
      isAccessory
        ? {
            name,
            brandId,
            categoryId,
            kind: "ACCESSORY",
            accessoryRole: accessoryRole || undefined,
            soldIndividually,
            basePrice: Number(basePrice),
          }
        : {
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
      <h2 className="font-display text-lg font-semibold text-text">
        {isAccessory ? "Nuevo accesorio" : "Nuevo producto"}
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        {isAccessory
          ? "Cargá los datos básicos. Los colores o presentaciones, su precio, stock y fotos se cargan después de crearlo."
          : "Cargá los datos básicos. Vas a poder agregar variantes, imágenes y estilos después de crearlo."}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <fieldset>
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
                  kind === value ? "border-primary text-primary" : "border-border text-text"
                }`}
              >
                <input
                  type="radio"
                  name="product-kind"
                  value={value}
                  checked={kind === value}
                  onChange={() => setKind(value)}
                  className="accent-[var(--color-primary)]"
                />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-text-muted">No se puede cambiar después de crearlo.</p>
        </fieldset>

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

        {isAccessory ? (
          <>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text" htmlFor="role-select">
                Tipo de accesorio
              </label>
              <select
                id="role-select"
                value={accessoryRole}
                onChange={(event) => setAccessoryRole(event.target.value as AccessoryRole)}
                required
                className="w-full rounded-md border border-border bg-surface-muted px-4 py-2.5 text-text"
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
                {accessoryRoleUsage(accessoryRole || null, includedSurchargeText)}
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={soldIndividually}
                onChange={(event) => setSoldIndividually(event.target.checked)}
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
        )}

        <FormField
          label={isAccessory ? "Precio (ARS)" : "Precio base (ARS)"}
          hint={isAccessory ? "Cada color o presentación puede tener su propio precio." : undefined}
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
          disabled={
            createProduct.isPending ||
            !name ||
            !brandId ||
            !categoryId ||
            !basePrice ||
            (isAccessory && !accessoryRole)
          }
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
        >
          {createProduct.isPending
            ? "Creando…"
            : isAccessory
              ? "Crear accesorio"
              : "Crear producto"}
        </button>
      </form>
    </div>
  );
}
