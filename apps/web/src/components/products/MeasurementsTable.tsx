import type { FrameMeasurements } from "@soluciones-opticas/shared";

const LABELS: Record<keyof FrameMeasurements, string> = {
  lensWidth: "Ancho de lente",
  bridgeWidth: "Puente",
  templeLength: "Patilla",
  lensHeight: "Alto de lente",
  frameWidth: "Ancho del marco",
};

// These describe the frame, not the customer — the note at the bottom
// exists specifically so they're never mistaken for anything clinical
// or biometric (§24).
export function MeasurementsTable({ measurements }: { measurements: FrameMeasurements }) {
  const rows = (Object.keys(LABELS) as (keyof FrameMeasurements)[])
    .map((key) => ({ label: LABELS[key], value: measurements[key] }))
    .filter((row): row is { label: string; value: number } => row.value != null);

  if (rows.length === 0) return null;

  return (
    <div>
      <h2 className="font-display text-lg text-text">Medidas</h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between border-b border-border pb-1.5">
            <dt className="text-text-muted">{row.label}</dt>
            <dd className="text-text">{row.value} mm</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-text-muted">
        Medidas del armazón — no son una medición óptica personal ni reemplazan una consulta
        profesional.
      </p>
    </div>
  );
}
