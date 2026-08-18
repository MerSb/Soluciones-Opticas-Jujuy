import type { CatalogFilters, FilterUpdate } from "../../lib/catalog-url-state";
import { FilterFields } from "./FilterFields";

interface FilterSidebarProps {
  filters: CatalogFilters;
  onChange: (partial: FilterUpdate) => void;
}

// Desktop only (hidden below lg — see ProductsPage) — mobile uses
// FilterDrawer instead of forcing this sidebar into a narrow viewport.
export function FilterSidebar({ filters, onChange }: FilterSidebarProps) {
  return (
    <aside className="hidden w-64 shrink-0 lg:block">
      <h2 className="font-display text-lg text-text">Filtros</h2>
      <div className="mt-4">
        <FilterFields filters={filters} onChange={onChange} idPrefix="filter-desktop" />
      </div>
    </aside>
  );
}
