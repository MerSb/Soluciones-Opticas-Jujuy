import { useId, useState } from "react";
import { FRAME_SHAPE_HELP, isOfficialShape, shapeHelp } from "../../lib/frame-shapes";

// Frame shape for the admin forms (docs/CATALOGO_NORMALIZACION.md): only
// the official shapes, or "Sin clasificar / Requiere revisión" (empty) —
// nobody has to invent a shape. An old non-official value of an existing
// product is shown as such and kept unless another option is chosen.

export function ShapeSelect({
  value,
  onChange,
  disabled,
  selectClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  selectClassName?: string;
}) {
  const id = useId();
  const [showGuide, setShowGuide] = useState(false);
  const legacy = value !== "" && !isOfficialShape(value);
  const help = shapeHelp(value);

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-text" htmlFor={`${id}-shape`}>
        Forma
      </label>
      <select
        id={`${id}-shape`}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={`${id}-help`}
        className={
          selectClassName ??
          "w-full rounded-md border border-border bg-surface-muted px-4 py-2.5 text-text disabled:opacity-60"
        }
      >
        <option value="">Sin clasificar / Requiere revisión</option>
        {legacy && <option value={value}>{value} (valor anterior, no oficial)</option>}
        {FRAME_SHAPE_HELP.map((item) => (
          <option key={item.shape} value={item.shape}>
            {item.shape}
          </option>
        ))}
      </select>
      <p id={`${id}-help`} className="mt-1.5 text-xs text-text-muted">
        {help
          ? `${help.description} También se dice: ${help.alsoCalled.join(", ")}.`
          : legacy
            ? "Este valor no está en la lista oficial. Elegí la forma que corresponda, o dejalo para revisión."
            : "Si no estás seguro de la forma, dejalo así: queda marcado para revisar."}{" "}
        <button
          type="button"
          onClick={() => setShowGuide((open) => !open)}
          aria-expanded={showGuide}
          aria-controls={`${id}-guide`}
          className="font-medium text-primary hover:underline"
        >
          {showGuide ? "Ocultar guía" : "¿Cuál elijo?"}
        </button>
      </p>
      {showGuide && (
        <dl
          id={`${id}-guide`}
          className="mt-2 grid gap-2 rounded-md border border-border bg-surface p-3 text-xs sm:grid-cols-2"
        >
          {FRAME_SHAPE_HELP.map((item) => (
            <div key={item.shape}>
              <dt className="font-semibold text-text">{item.shape}</dt>
              <dd className="text-text-muted">
                {item.description} <span className="italic">({item.alsoCalled.join(", ")})</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
