import { useId } from "react";
import type {
  EyewearConfigurationQuote,
  IncludedAccessoriesDto,
  IncludedAccessoryOption,
} from "@soluciones-opticas/shared";
import { getSwatchColor } from "../../lib/color-swatches";
import { formatPrice } from "../../lib/format-price";
import { ApiClientError } from "../../services/api-client";
import type { AccessoryChoice } from "../../lib/included-accessories";
import { optionDisplayName } from "../../lib/included-accessories";

// ADR-0028 Phase 2 — "Personalizá tus accesorios incluidos". Every pair
// includes one case and one standard cord at no cost; the cord can be
// replaced by a personalized one for the surcharge the API reports. Only
// what the store has set up is mentioned, and only in-stock colors can be
// chosen. Nothing here reserves stock or starts a purchase.

function OptionGroup({
  legend,
  name,
  options,
  selected,
  onSelect,
  hint,
}: {
  legend: string;
  name: string;
  options: IncludedAccessoryOption[];
  selected: string | null;
  onSelect: (variantId: string) => void;
  hint?: string;
}) {
  const hintId = useId();
  return (
    <fieldset aria-describedby={hint ? hintId : undefined}>
      <legend className="text-sm font-medium text-text">{legend}</legend>
      {hint && (
        <p id={hintId} className="mt-0.5 text-xs text-text-muted">
          {hint}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const label = optionDisplayName(option, options);
          const swatch = option.color ? getSwatchColor(option.color) : null;
          const checked = selected === option.variantId;
          return (
            <label
              key={option.variantId}
              className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-primary/40 ${
                checked
                  ? "border-primary text-primary"
                  : "border-border text-text hover:border-primary"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.variantId}
                checked={checked}
                onChange={() => onSelect(option.variantId)}
                className="sr-only"
              />
              {swatch && (
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full border border-border"
                  style={{ backgroundColor: swatch }}
                />
              )}
              {label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

type QuoteState = {
  /** The quote for exactly the current selection — undefined while it
   * loads, after an error, or when the selection is incomplete. */
  data: EyewearConfigurationQuote | undefined;
  isError: boolean;
  error: unknown;
};

function Unavailable({ what }: { what: string }) {
  return (
    <p className="text-sm text-text-muted">
      Por el momento no hay {what} disponibles. Consultanos por WhatsApp.
    </p>
  );
}

export function IncludedAccessoriesSection({
  offer,
  choice,
  onChange,
  complete,
  lensIncomplete,
  notice,
  quote,
}: {
  offer: IncludedAccessoriesDto;
  choice: AccessoryChoice;
  onChange: (choice: AccessoryChoice) => void;
  complete: boolean;
  /** A lens configuration still missing a variety: no total yet. */
  lensIncomplete: boolean;
  /** Why the last choice was dropped (an accessory sold out meanwhile). */
  notice: string | null;
  quote: QuoteState;
}) {
  const summaryId = useId();
  const surcharge = formatPrice(offer.customCord.surcharge);
  const canPersonalize = offer.customCord.options.length > 0;
  const cordsSetUp = offer.cord.configured || offer.customCord.configured;
  const cordsOnOffer = offer.cord.options.length > 0 || canPersonalize;
  const included = [offer.case.configured ? "un estuche" : null, cordsSetUp ? "un cordón" : null]
    .filter(Boolean)
    .join(" y ");

  return (
    <section aria-labelledby={`${summaryId}-title`}>
      <h2 id={`${summaryId}-title`} className="font-display text-lg font-semibold text-text">
        Personalizá tus accesorios incluidos
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        Tus anteojos incluyen {included} sin costo. Elegí los colores.
      </p>

      <div className="mt-4 space-y-5">
        {offer.case.configured &&
          (offer.case.options.length > 0 ? (
            <OptionGroup
              legend="Color del estuche"
              name="included-case"
              options={offer.case.options}
              selected={choice.caseVariantId}
              onSelect={(caseVariantId) => onChange({ ...choice, caseVariantId })}
            />
          ) : (
            <Unavailable what="estuches" />
          ))}

        {cordsSetUp &&
          (cordsOnOffer ? (
            <div className="space-y-3">
              {canPersonalize && (
                <label className="flex items-start gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={choice.personalizedCord}
                    onChange={(event) =>
                      onChange({ ...choice, personalizedCord: event.target.checked })
                    }
                    className="mt-0.5 accent-[var(--color-primary)]"
                  />
                  <span>
                    Quiero el cordón personalizado <strong>(+{surcharge})</strong>
                    <span className="block text-xs text-text-muted">
                      Reemplaza al cordón estándar incluido. El diseño del cordón personalizado se
                      acuerda por WhatsApp.
                    </span>
                  </span>
                </label>
              )}
              {choice.personalizedCord && canPersonalize ? (
                <OptionGroup
                  legend="Color del cordón personalizado"
                  name="included-custom-cord"
                  options={offer.customCord.options}
                  selected={choice.customCordVariantId}
                  onSelect={(customCordVariantId) => onChange({ ...choice, customCordVariantId })}
                  hint={`Adicional de ${surcharge}.`}
                />
              ) : offer.cord.options.length > 0 ? (
                <OptionGroup
                  legend="Color del cordón"
                  name="included-cord"
                  options={offer.cord.options}
                  selected={choice.cordVariantId}
                  onSelect={(cordVariantId) => onChange({ ...choice, cordVariantId })}
                />
              ) : (
                <Unavailable what="cordones estándar" />
              )}
            </div>
          ) : (
            <Unavailable what="cordones" />
          ))}
      </div>

      {notice && (
        <p role="alert" className="mt-5 text-sm text-danger">
          {notice} Actualizamos los colores disponibles: elegí otro.
        </p>
      )}

      <div className="mt-5" aria-live="polite">
        <Summary offer={offer} complete={complete} lensIncomplete={lensIncomplete} quote={quote} />
      </div>
    </section>
  );
}

function Summary({
  offer,
  complete,
  lensIncomplete,
  quote,
}: {
  offer: IncludedAccessoriesDto;
  complete: boolean;
  lensIncomplete: boolean;
  quote: QuoteState;
}) {
  if (!complete) {
    return (
      <p className="text-sm text-text-muted">
        Elegí los colores para ver el resumen con el total estimado.
      </p>
    );
  }
  if (lensIncomplete) {
    return (
      <p className="text-sm text-text-muted">
        Completá la elección de cristales para ver el total.
      </p>
    );
  }
  if (quote.isError) {
    // A sold-out accessory (409) is explained by the notice above, and the
    // refreshed offer has already dropped it: nothing more to say here.
    if (quote.error instanceof ApiClientError && quote.error.status === 409) return null;
    return (
      <p role="alert" className="text-sm text-danger">
        {quote.error instanceof ApiClientError && quote.error.status < 500
          ? quote.error.message
          : "No pudimos calcular el total. Probá de nuevo."}
      </p>
    );
  }
  const data = quote.data;
  if (!data?.accessories) {
    return <p className="text-sm text-text-muted">Calculando el total…</p>;
  }
  const { accessories } = data;
  const row = (label: string, value: string, detail?: string | null) => (
    <div className="mt-2 flex justify-between gap-4 first:mt-0">
      <dt className="text-text-muted">
        {label}
        {detail && <span className="block text-xs">{detail}</span>}
      </dt>
      <dd className="text-right text-text">{value}</dd>
    </div>
  );
  return (
    <dl aria-label="Resumen con accesorios" className="rounded-md border border-border p-4 text-sm">
      {row("Anteojo", formatPrice(data.framePrice))}
      {data.lens && row("Cristales", formatPrice(data.lensPrice), data.lens.lensTypeName)}
      {accessories.case &&
        row("Estuche incluido", "Gratis", optionDisplayName(accessories.case, offer.case.options))}
      {accessories.cord &&
        row("Cordón", "Gratis", optionDisplayName(accessories.cord, offer.cord.options))}
      {accessories.customCord &&
        row(
          "Cordón personalizado",
          `+${formatPrice(accessories.surcharge)}`,
          optionDisplayName(accessories.customCord, offer.customCord.options),
        )}
      <div className="mt-3 flex justify-between gap-4 border-t border-border pt-3 font-semibold">
        <dt className="text-text">Total estimado</dt>
        <dd className="text-primary">{formatPrice(data.totalWithAccessories ?? data.total)}</dd>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        Precio y disponibilidad sujetos a confirmación.
      </p>
    </dl>
  );
}
