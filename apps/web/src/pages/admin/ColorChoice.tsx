import { useId } from "react";
import type { ColorTone } from "@soluciones-opticas/shared";
import { ColorToneDot } from "../../components/products/ColorToneDot";
import { ACCESSORY_COLOR_PALETTE, colorKey } from "../../lib/accessories";
import { getSwatchColor } from "../../lib/color-swatches";
import { COLOR_TONE_OPTIONS } from "../../lib/color-tones";

/** The «Otro color…» choice: its name is typed in the one field it shows. */
export const OTHER_COLOR = "__otro__";

/** Accessory color names that were offered before and are not a palette
 * color by that name («Rosado»): still offered for accessories, saved by
 * their name as before (no tone is assumed for them). */
export const ACCESSORY_EXTRA_COLORS: readonly string[] = ACCESSORY_COLOR_PALETTE.filter(
  (name) => !COLOR_TONE_OPTIONS.some((option) => colorKey(option.label) === colorKey(name)),
);

/** What a choice saves: the name the customer reads and its palette tone —
 * none for a name outside the palette, never an invented equivalence. */
export function chosenColor(
  choice: string | null,
  otherName: string,
): { color: string; tones: ColorTone[] } | null {
  if (choice === null) return null;
  if (choice === OTHER_COLOR) {
    const name = otherName.trim().replace(/\s+/g, " ");
    return name === "" ? null : { color: name, tones: [] };
  }
  const option = COLOR_TONE_OPTIONS.find((o) => o.tone === choice);
  return option ? { color: option.label, tones: [option.tone] } : { color: choice, tones: [] };
}

/**
 * The color of ONE variant, chosen on the palette (docs/COLORES.md): one
 * dot, never several. «Combinado» is a piece of several colors whose tones
 * are not chosen. «Otro color…» (when offered) shows only a field for its
 * name. Another color of the model is another variant.
 */
export function ColorChoice({
  value,
  onChange,
  label,
  disabled = false,
  extraNames = [],
  otherName,
  onOtherName,
}: {
  /** A tone, one of `extraNames`, OTHER_COLOR, or nothing chosen. */
  value: string | null;
  onChange: (choice: string) => void;
  label: string;
  disabled?: boolean;
  extraNames?: readonly string[];
  /** Offers «Otro color…» when given. */
  otherName?: string;
  onOtherName?: (name: string) => void;
}) {
  const name = useId();
  const options = [
    ...COLOR_TONE_OPTIONS.map(({ tone, label: text }) => ({
      value: tone as string,
      text,
      dot: <ColorToneDot tones={[tone]} />,
    })),
    ...extraNames.map((extra) => ({
      value: extra,
      text: extra,
      dot: (
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 shrink-0 rounded-full border border-border"
          style={{ backgroundColor: getSwatchColor(extra) ?? undefined }}
        />
      ),
    })),
    ...(onOtherName
      ? [
          {
            value: OTHER_COLOR,
            text: "Otro color…",
            dot: (
              <span
                aria-hidden="true"
                className="inline-block h-4 w-4 shrink-0 rounded-full border border-dashed border-text-muted"
              />
            ),
          },
        ]
      : []),
  ];
  return (
    <div>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option.value} className={disabled ? "cursor-not-allowed" : "cursor-pointer"}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-3 text-sm text-text transition-colors peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:font-semibold peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-disabled:opacity-50 hover:border-primary">
              {option.dot}
              {option.text}
            </span>
          </label>
        ))}
      </div>
      {onOtherName && value === OTHER_COLOR && (
        <div className="mt-3 max-w-xs">
          <label htmlFor={`${name}-other`} className="mb-1 block text-xs font-medium text-text">
            Nombre del color
          </label>
          <input
            id={`${name}-other`}
            value={otherName ?? ""}
            maxLength={60}
            disabled={disabled}
            onChange={(event) => onOtherName(event.target.value)}
            className="w-full rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-text disabled:opacity-60"
          />
        </div>
      )}
    </div>
  );
}
