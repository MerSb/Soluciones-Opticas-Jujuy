import { PRODUCT_SORT_VALUES, SORT_LABELS, type ProductSort } from "../../lib/product-sort";

interface SortSelectProps {
  value: ProductSort | undefined;
  hasSearch: boolean;
  onChange: (value: ProductSort | undefined) => void;
  /** ProductsPage renders this twice at once (mobile toolbar + desktop toolbar, toggled by CSS,
   * not conditional mounting) — each instance needs a distinct id or the label/select pairing breaks. */
  id: string;
}

// "Relevancia" only appears as an option while a search is active —
// selecting it without one is meaningless and the API rejects it (400).
export function SortSelect({ value, hasSearch, onChange, id }: SortSelectProps) {
  const options = PRODUCT_SORT_VALUES.filter((sort) => sort !== "relevance" || hasSearch);
  const selected = value ?? (hasSearch ? "relevance" : "newest");

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        Ordenar por
      </label>
      <select
        id={id}
        value={selected}
        onChange={(event) => {
          const next = event.target.value as ProductSort;
          onChange(next === "newest" ? undefined : next);
        }}
        className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text focus-visible:border-primary"
      >
        {options.map((sort) => (
          <option key={sort} value={sort}>
            {SORT_LABELS[sort]}
          </option>
        ))}
      </select>
    </div>
  );
}
