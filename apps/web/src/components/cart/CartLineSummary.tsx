import type { CartLine } from "../../lib/cart/cart";
import { CUSTOM_GRADUATION_LABEL } from "../../lib/lens-configuration";

// What was configured, in words — shared by the cart page and the
// checkout summary so both describe a line identically.
export function CartLineDetails({ line }: { line: CartLine }) {
  const variant = [line.variantColor, line.variantMaterial].filter(Boolean).join(" · ");
  return (
    <dl className="mt-1 space-y-0.5 text-sm text-text-muted">
      {variant && (
        <div>
          <dt className="sr-only">Variante</dt>
          <dd>{variant}</dd>
        </div>
      )}
      <div>
        <dt className="sr-only">Cristales</dt>
        <dd>
          {line.lensTypeName
            ? `Cristales: ${line.lensTypeName}${line.lensOptionName ? ` — ${line.lensOptionName}` : ""}`
            : "Sin cristales (solo armazón)"}
        </dd>
      </div>
      {line.graduationMode === "CUSTOM" && (
        <div>
          <dt className="sr-only">Graduación</dt>
          <dd className="font-medium text-primary">{CUSTOM_GRADUATION_LABEL}</dd>
        </div>
      )}
    </dl>
  );
}
