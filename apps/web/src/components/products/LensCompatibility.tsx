import type { PublicLensTypeDto } from "@soluciones-opticas/shared";

/**
 * Which lens types this frame takes (monofocal, bifocal, progresivo…), as
 * the admin set them. Information only: no prices, no quote — lenses are
 * arranged with the shop. With nothing set it says so; it never means the
 * frame takes no lenses.
 */
export function LensCompatibility({ lensTypes }: { lensTypes: PublicLensTypeDto[] }) {
  return (
    <section aria-labelledby="lens-compatibility-title">
      <h2 id="lens-compatibility-title" className="text-sm font-medium text-text">
        Cristales compatibles
      </h2>
      {lensTypes.length === 0 ? (
        <p className="mt-1 text-sm text-text-muted">Compatibilidad por consultar.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {lensTypes.map((type) => (
            <li
              key={type.id}
              className="rounded-full border border-border px-3 py-1 text-sm text-text"
              title={type.description ?? undefined}
            >
              {type.name}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-text-muted">
        La graduación y el precio de los cristales se coordinan con la óptica.
      </p>
    </section>
  );
}
