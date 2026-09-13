import type { ProductVariantDto, PublicLensTypeDto } from "@soluciones-opticas/shared";
import { formatPrice } from "../../lib/format-price";
import {
  availableOptionCount,
  findLensType,
  lowestLensPrice,
  selectLensType,
  toConfigurationInput,
  type LensSelection,
} from "../../lib/lens-configuration";
import { useEyewearQuoteQuery } from "../../services/queries/products";
import { ApiClientError } from "../../services/api-client";

// Cristales & Configurador V1 (ADR-0023). Rendered by ProductDetailPage
// only when the product has at least one compatible lens type. Selection
// state lives in the page (it also feeds the WhatsApp message); every
// price in the breakdown comes from the backend quote, never computed
// here. No cart, no checkout: the page's CTA stays WhatsApp.

interface LensConfiguratorProps {
  slug: string;
  lensTypes: PublicLensTypeDto[];
  variant: ProductVariantDto;
  selection: LensSelection;
  onChange: (selection: LensSelection) => void;
}

const CUSTOM_GRADUATION_NOTE =
  "Después de realizar tu pedido, nuestro equipo se comunicará con vos para asesorarte y completar los datos de tu graduación.";

const choiceClass = (selected: boolean, disabled = false) =>
  [
    "flex w-full items-start justify-between gap-3 rounded-md border px-4 py-3 text-left text-sm transition",
    selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/60",
    disabled ? "cursor-not-allowed opacity-50 hover:border-border" : "",
  ].join(" ");

export function LensConfigurator({
  slug,
  lensTypes,
  variant,
  selection,
  onChange,
}: LensConfiguratorProps) {
  const selectedType = findLensType(lensTypes, selection.lensTypeId);
  const input = toConfigurationInput(variant.id, selection, lensTypes);
  const quote = useEyewearQuoteQuery(slug, input);

  return (
    <section aria-labelledby="lens-configurator-heading" className="space-y-6">
      <div>
        <h2 id="lens-configurator-heading" className="font-display text-lg font-semibold text-text">
          Elegí tus cristales
        </h2>
        <div role="radiogroup" aria-label="Cristales" className="mt-3 space-y-2">
          <button
            type="button"
            role="radio"
            aria-checked={selectedType === null}
            onClick={() => onChange(selectLensType(selection, null))}
            className={choiceClass(selectedType === null)}
          >
            <span className="font-medium text-text">Sin cristales</span>
            <span className="text-text-muted">Solo el armazón</span>
          </button>

          {lensTypes.map((lensType) => {
            const selected = selectedType?.id === lensType.id;
            const count = availableOptionCount(lensType);
            const variedPrices = lensType.options.some(
              (o) => o.price !== lensType.options[0]?.price,
            );
            return (
              <button
                key={lensType.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!lensType.available}
                onClick={() => onChange(selectLensType(selection, lensType))}
                className={choiceClass(selected, !lensType.available)}
              >
                <span>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text">{lensType.name}</span>
                    {lensType.isFeatured && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Destacado
                      </span>
                    )}
                  </span>
                  {lensType.description && (
                    <span className="mt-1 block text-text-muted">{lensType.description}</span>
                  )}
                  {count > 1 && (
                    <span className="mt-1 block text-xs font-medium text-primary">
                      {count} variedades disponibles
                    </span>
                  )}
                  {!lensType.available && (
                    <span className="mt-1 block text-xs text-danger">Sin disponibilidad</span>
                  )}
                </span>
                <span className="shrink-0 font-medium text-text">
                  {variedPrices ? "desde " : ""}
                  {formatPrice(lowestLensPrice(lensType))}
                </span>
              </button>
            );
          })}
        </div>

        {selectedType && selectedType.treatments.length > 0 && (
          <p className="mt-3 text-sm text-text-muted">
            Incluye: {selectedType.treatments.map((treatment) => treatment.name).join(" · ")}
          </p>
        )}
      </div>

      {selectedType && selectedType.options.length > 0 && (
        <div>
          <h3 className="font-display text-base font-semibold text-text">Elegí una variedad</h3>
          <div
            role="radiogroup"
            aria-label="Variedad"
            className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"
          >
            {selectedType.options.map((option) => {
              const selected = selection.lensOptionId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!option.available}
                  onClick={() => onChange({ ...selection, lensOptionId: option.id })}
                  className={choiceClass(selected, !option.available)}
                >
                  <span className="flex items-center gap-2">
                    {option.swatchHex && (
                      <span
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 rounded-full border border-border"
                        style={{ backgroundColor: option.swatchHex }}
                      />
                    )}
                    <span className="text-text">{option.name}</span>
                  </span>
                  <span className="shrink-0 text-text-muted">
                    {option.available ? formatPrice(option.price) : "Sin stock"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedType?.supportsCustomGraduation && (
        <div>
          <h3 className="font-display text-base font-semibold text-text">Graduación</h3>
          <div role="radiogroup" aria-label="Graduación" className="mt-3 space-y-2">
            <button
              type="button"
              role="radio"
              aria-checked={selection.graduationMode === "NONE"}
              onClick={() => onChange({ ...selection, graduationMode: "NONE" })}
              className={choiceClass(selection.graduationMode === "NONE")}
            >
              <span className="text-text">Sin graduación</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={selection.graduationMode === "CUSTOM"}
              onClick={() => onChange({ ...selection, graduationMode: "CUSTOM" })}
              className={choiceClass(selection.graduationMode === "CUSTOM")}
            >
              <span className="text-text">Quiero graduación personalizada</span>
            </button>
          </div>
          {selection.graduationMode === "CUSTOM" && (
            <p className="mt-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-text">
              {CUSTOM_GRADUATION_NOTE}
            </p>
          )}
        </div>
      )}

      <PriceBreakdown quote={quote} incomplete={input === null} />
    </section>
  );
}

function PriceBreakdown({
  quote,
  incomplete,
}: {
  quote: ReturnType<typeof useEyewearQuoteQuery>;
  incomplete: boolean;
}) {
  if (incomplete) {
    return <p className="text-sm text-text-muted">Elegí una variedad para ver el total.</p>;
  }
  if (quote.isError) {
    return (
      <p role="alert" className="text-sm text-danger">
        {quote.error instanceof ApiClientError
          ? quote.error.message
          : "No pudimos calcular el precio. Probá de nuevo."}
      </p>
    );
  }
  if (!quote.data) return <p className="text-sm text-text-muted">Calculando…</p>;

  const { framePrice, lensPrice, total, lens, graduation } = quote.data;
  return (
    <dl aria-label="Resumen de precio" className="rounded-md border border-border p-4 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-text-muted">Armazón</dt>
        <dd className="text-text">{formatPrice(framePrice)}</dd>
      </div>
      <div className="mt-2 flex justify-between gap-4">
        <dt className="text-text-muted">
          Cristales
          {lens && (
            <span className="block text-xs">
              {lens.lensTypeName}
              {lens.lensOptionName ? ` — ${lens.lensOptionName}` : ""}
            </span>
          )}
        </dt>
        <dd className="text-text">{lens ? formatPrice(lensPrice) : "Sin cristales"}</dd>
      </div>
      {graduation.requiresOpticalConsultation && (
        <div className="mt-2 flex justify-between gap-4">
          <dt className="text-text-muted">Graduación personalizada</dt>
          <dd className="text-right text-text">A coordinar con la óptica</dd>
        </div>
      )}
      <div className="mt-3 flex justify-between gap-4 border-t border-border pt-3 font-semibold">
        <dt className="text-text">Total</dt>
        <dd className="text-primary">{formatPrice(total)}</dd>
      </div>
    </dl>
  );
}
