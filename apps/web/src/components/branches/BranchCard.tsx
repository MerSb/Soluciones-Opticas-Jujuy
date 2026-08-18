import type { BranchSummary } from "@soluciones-opticas/shared";
import { buildWhatsAppUrl } from "../../lib/whatsapp";
import { buildMapsUrl } from "../../lib/maps";

// `hours` is deliberately unstructured JSON in the schema (no query
// needs to filter/sort by it) — rendered generically as whatever
// key/value pairs exist, rather than assuming a specific shape.
function renderHours(hours: unknown) {
  if (!hours || typeof hours !== "object") return null;
  const entries = Object.entries(hours as Record<string, unknown>).filter(
    ([, value]) => typeof value === "string",
  );
  if (entries.length === 0) return null;

  return (
    <dl className="mt-1 space-y-0.5 text-sm text-text-muted">
      {entries.map(([day, range]) => (
        <div key={day} className="flex gap-2">
          <dt className="font-medium text-text">{day}:</dt>
          <dd>{String(range)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BranchCard({ branch }: { branch: BranchSummary }) {
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-6 shadow-soft">
      <h3 className="font-display text-lg text-text">{branch.name}</h3>
      <p className="mt-2 text-sm text-text-muted">{branch.address}</p>
      {renderHours(branch.hours)}

      <div className="mt-4 flex flex-col gap-1 text-sm">
        {branch.phone && (
          <a
            href={`tel:${branch.phone.replace(/[^\d+]/g, "")}`}
            className="text-primary hover:underline"
          >
            {branch.phone}
          </a>
        )}
        {branch.whatsapp && (
          <a
            href={buildWhatsAppUrl(branch.whatsapp, `Hola, quería consultar sobre ${branch.name}.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            WhatsApp: {branch.whatsapp}
          </a>
        )}
        <a
          href={buildMapsUrl(branch)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          Ver en el mapa
        </a>
      </div>
    </div>
  );
}
