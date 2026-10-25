import { readFileSync } from "node:fs";
import { env } from "../lib/env.js";
import { ApiError } from "../lib/api-error.js";
import type { InvoicingProvider } from "../lib/invoicing-provider.js";
import { createMockInvoicingProvider } from "../lib/arca/mock-provider.js";
import { createWsaaClient, WSAA_HOMOLOGATION_URL } from "../lib/arca/wsaa.js";
import { createWsfeProvider, WSFE_HOMOLOGATION_URL } from "../lib/arca/wsfe.js";

// The invoicing provider boundary (ADR-0036): the only place that decides
// which ARCA the module talks to — the one seam tests replace, same
// pattern as shipping-provider.service.ts. ARCA_MODE=off (default) turns
// the whole module off; production URLs are not configured anywhere.

let provider: InvoicingProvider | null = null;

export const mockProvider = createMockInvoicingProvider();

export function isInvoicingEnabled(): boolean {
  return env.ARCA_MODE !== "off";
}

export function getInvoicingProvider(): InvoicingProvider {
  if (env.ARCA_MODE === "off") {
    throw new ApiError(403, "FEATURE_DISABLED", "La facturación electrónica está desactivada.");
  }
  if (env.ARCA_MODE === "mock") return mockProvider;
  provider ??= createHomologationProvider();
  return provider;
}

function createHomologationProvider(): InvoicingProvider {
  if (!env.ARCA_CERT_PATH || !env.ARCA_KEY_PATH) {
    throw new ApiError(
      503,
      "INVOICING_NOT_CONFIGURED",
      "Falta el certificado de homologación de ARCA (ARCA_CERT_PATH y ARCA_KEY_PATH).",
    );
  }
  let certificatePem: string;
  let privateKeyPem: string;
  try {
    certificatePem = readFileSync(env.ARCA_CERT_PATH, "utf8");
    privateKeyPem = readFileSync(env.ARCA_KEY_PATH, "utf8");
  } catch {
    // The path is not echoed: it may reveal the server's layout.
    throw new ApiError(503, "INVOICING_NOT_CONFIGURED", "No se pudo leer el certificado de ARCA.");
  }
  const wsaa = createWsaaClient({
    url: WSAA_HOMOLOGATION_URL,
    certificatePem,
    privateKeyPem,
    service: "wsfe",
    timeoutMs: env.ARCA_TIMEOUT_MS,
  });
  return createWsfeProvider({
    url: WSFE_HOMOLOGATION_URL,
    timeoutMs: env.ARCA_TIMEOUT_MS,
    getTicket: () => wsaa.getTicket(),
  });
}
