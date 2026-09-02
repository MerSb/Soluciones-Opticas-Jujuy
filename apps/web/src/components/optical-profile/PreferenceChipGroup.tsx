interface Option<T extends string> {
  value: T;
  label: string;
}

interface PreferenceChipGroupProps<T extends string> {
  legend: string;
  options: readonly Option<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
}

// A checkmark that appears only when selected (a shape change, not just
// a color change) plus aria-pressed together carry the selected state —
// never color alone (§30/§51 of the optical-profile brief), same
// pattern as FavoriteButton's filled/outline heart. fieldset/legend
// gives the whole group its accessible name — `legend` is visually
// hidden, not omitted: the caller already renders a visible <h2> with
// the same text immediately above this component, so a plain visible
// legend would just repeat it on screen; screen-reader users still get
// the group's name from the (sr-only) legend, which is what actually
// matters for a fieldset's semantics, independent of the ancestor
// section's own heading.
export function PreferenceChipGroup<T extends string>({
  legend,
  options,
  selected,
  onToggle,
}: PreferenceChipGroupProps<T>) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onToggle(option.value)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                isSelected
                  ? "border-primary bg-primary text-surface"
                  : "border-border bg-surface text-text hover:border-primary hover:text-primary"
              }`}
            >
              {isSelected && (
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  className="h-3.5 w-3.5"
                  fill="currentColor"
                >
                  <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
                </svg>
              )}
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
