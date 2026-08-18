import { useState } from "react";
import type { CatalogFilters, FilterUpdate } from "../../lib/catalog-url-state";
import { isValidPriceRange } from "../../lib/catalog-url-state";
import { useBrandsQuery } from "../../services/queries/brands";
import { useCategoriesQuery } from "../../services/queries/categories";

interface FilterFieldsProps {
  filters: CatalogFilters;
  onChange: (partial: FilterUpdate) => void;
  /** FilterSidebar (desktop) and FilterDrawer (mobile) both mount this
   * at the same time (CSS, not conditional rendering, decides which is
   * visible) — every field id needs a prefix unique to its instance. */
  idPrefix: string;
}

const inputClassName =
  "mt-1 block w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:border-primary";
const labelClassName = "text-sm font-medium text-text";

// Shared by the desktop sidebar and the mobile drawer — one set of
// fields, two layout contexts. Brand/category are real dropdowns backed
// by GET /api/brands and GET /api/categories (a handful of rows each,
// cheap to load in full). Shape/material/color are plain text inputs,
// not dropdowns — see the architectural note below.
export function FilterFields({ filters, onChange, idPrefix }: FilterFieldsProps) {
  const { data: brands } = useBrandsQuery();
  const { data: categories } = useCategoriesQuery();

  const id = (field: string) => `${idPrefix}-${field}`;

  return (
    <fieldset className="space-y-6">
      <legend className="sr-only">Filtros</legend>

      <div>
        <label htmlFor={id("brand")} className={labelClassName}>
          Marca
        </label>
        <select
          id={id("brand")}
          value={filters.brand ?? ""}
          onChange={(event) => onChange({ brand: event.target.value || undefined })}
          className={inputClassName}
        >
          <option value="">Todas las marcas</option>
          {brands?.map((brand) => (
            <option key={brand.slug} value={brand.slug}>
              {brand.name} {brand.productCount > 0 ? `(${brand.productCount})` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={id("category")} className={labelClassName}>
          Categoría
        </label>
        <select
          id={id("category")}
          value={filters.category ?? ""}
          onChange={(event) => onChange({ category: event.target.value || undefined })}
          className={inputClassName}
        >
          <option value="">Todas las categorías</option>
          {categories?.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name} {category.productCount > 0 ? `(${category.productCount})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/*
        Shape/material/color are free-text, not dropdowns backed by a
        facet list — GET /api/products accepts these as arbitrary
        strings, but there is no endpoint exposing the *distinct*
        values that actually exist in the catalog (unlike brand/
        category, which have real summary endpoints). Building a
        checkbox/dropdown list here would mean either fetching the
        entire product catalog client-side just to derive unique
        values — exactly what §11 says not to do — or hardcoding a
        guessed list that could disagree with the database. A text
        input needs neither. See docs/API.md "Known limitations" for
        the minimal facets-endpoint addition this would unlock later.
      */}
      <div>
        <label htmlFor={id("shape")} className={labelClassName}>
          Forma
        </label>
        <input
          id={id("shape")}
          type="text"
          value={filters.shape ?? ""}
          onChange={(event) => onChange({ shape: event.target.value || undefined })}
          placeholder="Ej: aviador"
          className={inputClassName}
        />
      </div>

      <div>
        <label htmlFor={id("material")} className={labelClassName}>
          Material
        </label>
        <input
          id={id("material")}
          type="text"
          value={filters.material ?? ""}
          onChange={(event) => onChange({ material: event.target.value || undefined })}
          placeholder="Ej: Metal"
          className={inputClassName}
        />
      </div>

      <div>
        <label htmlFor={id("color")} className={labelClassName}>
          Color
        </label>
        <input
          id={id("color")}
          type="text"
          value={filters.color ?? ""}
          onChange={(event) => onChange({ color: event.target.value || undefined })}
          placeholder="Ej: Negro"
          className={inputClassName}
        />
      </div>

      <PriceRangeFields filters={filters} onChange={onChange} idPrefix={idPrefix} />
    </fieldset>
  );
}

function PriceRangeFields({ filters, onChange, idPrefix }: FilterFieldsProps) {
  const [error, setError] = useState<string | null>(null);

  function handleChange(key: "minPrice" | "maxPrice", raw: string) {
    const value = raw === "" ? undefined : Math.max(0, Number(raw));
    const next =
      key === "minPrice"
        ? { min: value, max: filters.maxPrice }
        : { min: filters.minPrice, max: value };

    if (!isValidPriceRange(next.min, next.max)) {
      setError("El precio mínimo no puede ser mayor al máximo.");
      return;
    }
    setError(null);
    onChange({ [key]: value });
  }

  return (
    <div>
      <span className={labelClassName}>Precio</span>
      <div className="mt-1 flex items-center gap-2">
        <label htmlFor={`${idPrefix}-min-price`} className="sr-only">
          Precio mínimo
        </label>
        <input
          id={`${idPrefix}-min-price`}
          type="number"
          min={0}
          inputMode="numeric"
          value={filters.minPrice ?? ""}
          onChange={(event) => handleChange("minPrice", event.target.value)}
          placeholder="Mín."
          className={inputClassName}
        />
        <span aria-hidden="true" className="text-text-muted">
          –
        </span>
        <label htmlFor={`${idPrefix}-max-price`} className="sr-only">
          Precio máximo
        </label>
        <input
          id={`${idPrefix}-max-price`}
          type="number"
          min={0}
          inputMode="numeric"
          value={filters.maxPrice ?? ""}
          onChange={(event) => handleChange("maxPrice", event.target.value)}
          placeholder="Máx."
          className={inputClassName}
        />
      </div>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
