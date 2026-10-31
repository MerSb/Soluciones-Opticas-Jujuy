import { useId } from "react";
import type { ColorTone } from "@soluciones-opticas/shared";
import { ColorToneDot } from "../../components/products/ColorToneDot";
import { ACCESSORY_COLOR_PALETTE, colorKey } from "../../lib/accessories";
import { getSwatchColor } from "../../lib/color-swatches";
import { COLOR_TONE_OPTIONS, tonesName } from "../../lib/color-tones";

/** The «Otro color…» choice: its name is typed in the one field it shows. */
export const OTHER_COLOR = "__otro__";

/** Accessory color names that were offered before and are not a palette
 * color by that name («Rosado»): still offered for accessories, saved by
 * their name as before (no tone is assumed for them). */
export const ACCESSORY_EXTRA_COLORS: readonly string[] = ACCESSORY_COLOR_PALETTE.filter(
  (name) => !COLOR_TONE_OPTIONS.some((option) => colorKey(option.label) === colorKey(name)),
);

/** «Combinado»: one piece of two or more real tones, chosen in order. */
export const COMBINED = "COMBINADO";
/** Same limit as the API (admin-products.schema.ts). */
export const MAX_COMBINED_TONES = 4;
// The tones a combined piece can have: the palette colors themselves
// (multicolor already says "several" and stands alone).
const COMBINED_TONE_OPTIONS = COLOR_TONE_OPTIONS.filter(
  (option) => option.tone !== "MULTICOLOR" && option.tone !== "COMBINADO",
);

/** What a choice saves: the name the customer reads and its palette tones —
 * none for a name outside the palette, never an invented equivalence. A
 * combined piece is ONE variant with its tones in order («Plateado y
 * azul», ["PLATEADO", "AZUL"]), never one variant per tone. */
export function chosenColor(
  choice: string | null,
  otherName: string,
  combinedTones: readonly ColorTone[] = [],
): { color: string; tones: ColorTone[] } | null {
  if (choice === null) return null;
  if (choice === OTHER_COLOR) {
    const name = otherName.trim().replace(/\s+/g, " ");
    return name === "" ? null : { color: name, tones: [] };
  }
  if (choice === COMBINED) {
    return combinedTones.length >= 2
      ? { color: tonesName(combinedTones), tones: [...combinedTones] }
      : null;
  }
  const option = COLOR_TONE_OPTIONS.find((o) => o.tone === choice);
  return option ? { color: option.label, tones: [option.tone] } : { color: choice, tones: [] };
}

/** Why a choice can't be saved yet, in plain words (null when it can). */
export function colorChoiceProblem(
  choice: string | null,
  otherName: string,
  combinedTones: readonly ColorTone[],
): string | null {
  if (choice === null) return "Elegí el color en la paleta.";
  if (choice === OTHER_COLOR && otherName.trim() === "") return "Escribí el nombre del color.";
  if (choice === COMBINED && combinedTones.length < 2) {
    return "Elegí al menos dos tonos de la pieza combinada.";
  }
  return null;
}

/**
 * The color of ONE variant, chosen on the palette (docs/COLORES.md): one
 * dot, never several. «Combinado» shows a single extra row: the real tones
 * of that one piece (two or more, in order). «Otro color…» (when offered)
 * shows only a field for its name. Another color of the model is another
 * variant.
 */
export function ColorChoice({
  value,
  onChange,
  label,
  disabled = false,
  extraNames = [],
  otherName,
  onOtherName,
  combinedTones = [],
  onCombinedTones,
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
  /** The tones of a «Combinado» piece, in the order clicked. */
  combinedTones?: readonly ColorTone[];
  onCombinedTones?: (tones: ColorTone[]) => void;
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
      {onCombinedTones && value === COMBINED && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-text">
            Tonos de la pieza: elegí dos o más, el principal primero
          </p>
          <div
            role="group"
            aria-label="Tonos de la pieza combinada"
            className="flex flex-wrap gap-2"
          >
            {COMBINED_TONE_OPTIONS.map(({ tone, label: text }) => {
              const position = combinedTones.indexOf(tone);
              const selected = position >= 0;
              const full = !selected && combinedTones.length >= MAX_COMBINED_TONES;
              return (
                <button
                  key={tone}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled || full}
                  onClick={() =>
                    onCombinedTones(
                      selected ? combinedTones.filter((t) => t !== tone) : [...combinedTones, tone],
                    )
                  }
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition-colors disabled:opacity-50 ${
                    selected
                      ? "border-primary bg-primary/10 font-semibold text-primary"
                      : "border-border text-text hover:border-primary"
                  }`}
                >
                  <ColorToneDot tones={[tone]} />
                  {text}
                  {selected && (
                    <span className="text-xs font-normal" aria-label={`tono ${position + 1}`}>
                      {position + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {combinedTones.length >= 2 && (
            <p className="mt-1.5 text-xs text-text-muted">
              Se guarda como una sola variante: «{tonesName(combinedTones)}».
            </p>
          )}
        </div>
      )}
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
