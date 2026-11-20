// Which API a build may talk to (docs/PRUEBAS_MERCADOPAGO_AISLADO.md).
//
// A Vercel Preview never writes to the production API. Without
// VITE_API_BASE_URL it calls its own origin, where the read-only preview
// proxy refuses anything but GET (apps/web/preview-api.ts). With it, it
// must point somewhere else — e.g. the isolated test API. A Preview built
// against the production API refuses to start instead of sending a
// checkout, a login or an admin change there.

/** Same host as DEFAULT_API in apps/web/middleware.ts (checked by a test). */
export const PRODUCTION_API_HOST = "soluciones-opticas-api-production.up.railway.app";

function isProductionApiHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === PRODUCTION_API_HOST ||
    host === "solucionesopticas.com.ar" ||
    host.endsWith(".solucionesopticas.com.ar")
  );
}

/** Why this build must not start, or null. Only Previews are restricted:
 * production is meant to use the production API. */
export function previewApiTargetProblem(
  vercelEnv: string | undefined,
  apiBaseUrl: string | undefined,
): string | null {
  if (vercelEnv !== "preview" || !apiBaseUrl) return null;
  let host: string;
  try {
    host = new URL(apiBaseUrl).hostname;
  } catch {
    return "VITE_API_BASE_URL is not a valid URL.";
  }
  return isProductionApiHost(host)
    ? "A Vercel Preview cannot use the production API: set VITE_API_BASE_URL (Preview, this branch only) to the isolated test API."
    : null;
}
