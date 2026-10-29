import type { AdminLensTypeDto } from "@soluciones-opticas/shared";

/** The lens types to tick as compatible with a frame — the list comes from
 * the API (GET /api/admin/lens-types), never hardcoded. Shared by the
 * product page and the new-product form. */
export function LensTypeChecklist({
  choices,
  selected,
  onChange,
  disabled = false,
}: {
  choices: AdminLensTypeDto[];
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      {choices.map((type) => (
        <label key={type.id} className="flex min-h-11 items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={selected.includes(type.id)}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...selected, type.id]
                  : selected.filter((value) => value !== type.id),
              )
            }
          />
          {type.name}
          {type.deletedAt && <span className="text-text-muted">(eliminado)</span>}
        </label>
      ))}
    </div>
  );
}
