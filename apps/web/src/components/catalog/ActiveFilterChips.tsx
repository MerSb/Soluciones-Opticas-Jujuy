import type { CatalogFilters, FilterKey } from "../../lib/catalog-url-state";
import { useBrandsQuery } from "../../services/queries/brands";
import { useCategoriesQuery } from "../../services/queries/categories";
import { formatPrice } from "../../lib/format-price";

interface ActiveFilterChipsProps {
  filters: CatalogFilters;
  onRemove: (key: FilterKey) => void;
  onClearAll: () => void;
}

interface Chip {
  key: FilterKey;
  label: string;
}

// Reuses the same brand/category queries the filter fields already use
// (TanStack Query dedupes by key — this doesn't cost a second request)
// to show real names, not raw slugs, in the chips.
export function ActiveFilterChips({ filters, onRemove, onClearAll }: ActiveFilterChipsProps) {
  const { data: brands } = useBrandsQuery();
  const { data: categories } = useCategoriesQuery();

  const chips: Chip[] = [];
  if (filters.q) chips.push({ key: "q", label: `“${filters.q}”` });
  if (filters.brand) {
    const brand = brands?.find((entry) => entry.slug === filters.brand);
    chips.push({ key: "brand", label: brand?.name ?? filters.brand });
  }
  if (filters.category) {
    const category = categories?.find((entry) => entry.slug === filters.category);
    chips.push({ key: "category", label: category?.name ?? filters.category });
  }
  if (filters.shape) chips.push({ key: "shape", label: filters.shape });
  if (filters.material) chips.push({ key: "material", label: filters.material });
  if (filters.color) chips.push({ key: "color", label: filters.color });
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    const min = filters.minPrice !== undefined ? formatPrice(filters.minPrice) : "";
    const max = filters.maxPrice !== undefined ? formatPrice(filters.maxPrice) : "";
    chips.push({ key: "minPrice", label: `${min} – ${max}`.trim() });
  }

  if (chips.length === 0) return null;

  function handleRemove(key: Chip["key"]) {
    onRemove(key);
    if (key === "minPrice") onRemove("maxPrice");
  }

  return (
    <ul className="flex flex-wrap items-center gap-2" aria-label="Filtros activos">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={() => handleRemove(chip.key)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-3 py-1 text-xs text-text hover:border-primary"
          >
            {chip.label}
            <span aria-hidden="true">×</span>
            <span className="sr-only">Quitar filtro</span>
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-medium text-primary hover:underline"
        >
          Limpiar todo
        </button>
      </li>
    </ul>
  );
}
