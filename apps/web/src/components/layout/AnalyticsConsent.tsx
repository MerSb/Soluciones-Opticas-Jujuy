import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { analyticsId, loadAnalytics, setConsent, storedConsent } from "../../lib/analytics";

// Audit points 3 and 19 — the consent banner exists only when analytics
// is actually configured (VITE_GA4_MEASUREMENT_ID). Without it the site
// uses no optional cookies, so no banner is shown (see /cookies).
// Accept and reject are equally prominent; the choice can be changed
// later from the cookie policy page (AnalyticsPreference).
export function AnalyticsConsent() {
  const enabled = analyticsId() !== null;
  const [choice, setChoice] = useState(() => (enabled ? storedConsent() : null));

  useEffect(() => {
    if (enabled && choice === "granted") loadAnalytics();
  }, [enabled, choice]);

  if (!enabled || choice) return null;

  const decide = (value: "granted" | "denied") => {
    setConsent(value);
    setChoice(value);
  };

  return (
    <div
      role="region"
      aria-label="Preferencias de analítica"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface-muted px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-elevated"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 text-sm text-text sm:flex-row sm:items-center sm:justify-between">
        <p>
          ¿Nos dejás medir de forma anónima cómo se usa el sitio para mejorarlo? Usamos Google
          Analytics solo si aceptás.{" "}
          <Link to="/cookies" className="text-primary underline underline-offset-4">
            Más información
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide("denied")}
            className="min-h-11 rounded-md border border-border px-4 py-2 font-semibold text-text hover:border-primary"
          >
            Rechazar
          </button>
          <button
            type="button"
            onClick={() => decide("granted")}
            className="min-h-11 rounded-md border border-border px-4 py-2 font-semibold text-text hover:border-primary"
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}

/** On /cookies: change the analytics choice later (only when configured). */
export function AnalyticsPreference() {
  const enabled = analyticsId() !== null;
  const [choice, setChoice] = useState(() => storedConsent());
  if (!enabled) return null;
  const change = (value: "granted" | "denied") => {
    setConsent(value);
    setChoice(value);
  };
  return (
    <section aria-labelledby="analytics-pref" className="mt-10 rounded-md border border-border p-4">
      <h2 id="analytics-pref" className="font-display text-xl font-semibold text-text">
        Tu elección sobre analítica
      </h2>
      <p className="mt-2 text-sm text-text-muted" role="status">
        {choice === "granted"
          ? "Aceptaste la analítica."
          : choice === "denied"
            ? "Rechazaste la analítica."
            : "Todavía no elegiste."}
        {choice === "granted" && " Si la rechazás, deja de cargarse a partir de la próxima visita."}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => change("denied")}
          className="min-h-11 rounded-md border border-border px-4 py-2 text-sm font-semibold text-text hover:border-primary"
        >
          Rechazar analítica
        </button>
        <button
          type="button"
          onClick={() => change("granted")}
          className="min-h-11 rounded-md border border-border px-4 py-2 text-sm font-semibold text-text hover:border-primary"
        >
          Aceptar analítica
        </button>
      </div>
    </section>
  );
}
