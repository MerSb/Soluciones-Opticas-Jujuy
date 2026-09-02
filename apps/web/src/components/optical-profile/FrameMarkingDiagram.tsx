// A lightweight explanatory diagram — plain inline SVG, no charting/
// visualization library (§27/§53 of the optical-profile brief). Explains
// where the three measurements come from without requiring a photo
// upload; "52 □ 18 140" is explicitly an example, never presented as
// this customer's own values.
export function FrameMarkingDiagram() {
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-4 sm:p-5">
      <p className="text-sm text-text">
        Buscá una numeración similar a esta en la parte interna de la patilla de tus anteojos:
      </p>

      <div className="mt-3 flex items-center justify-center gap-1 font-display text-2xl font-semibold text-primary sm:text-3xl">
        <span>52</span>
        <span aria-hidden="true" className="text-lg text-text-muted sm:text-xl">
          □
        </span>
        <span>18</span>
        <span className="text-lg text-text-muted sm:text-xl">–</span>
        <span>140</span>
      </div>
      <p className="mt-1 text-center text-xs text-text-muted">
        Ejemplo — no son tus medidas reales.
      </p>

      <svg
        viewBox="0 0 200 60"
        aria-hidden="true"
        className="mx-auto mt-4 h-auto w-full max-w-xs text-text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="55" cy="30" r="22" />
        <circle cx="145" cy="30" r="22" />
        <path d="M77 30h46" />
        <path d="M23 22 5 15" />
        <path d="M177 22l18-7" />
      </svg>

      <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="font-medium text-text">52 → Ancho del lente</dt>
        </div>
        <div>
          <dt className="font-medium text-text">18 → Puente</dt>
        </div>
        <div>
          <dt className="font-medium text-text">140 → Largo de patilla</dt>
        </div>
      </dl>
    </div>
  );
}
