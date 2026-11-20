import { useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { Container } from "../components/ui/Container";
import { SeoHead } from "../components/ui/SeoHead";
import { WhatsAppButton } from "../components/ui/WhatsAppButton";
import { downloadBuyerInvoicePdf, saveBlob } from "../services/queries/admin-invoicing";

// The buyer's download of their online invoice (ADR-0036), from the link
// in the email. The token travels in the URL fragment (#…), which the
// browser never sends to a server, and goes to the API in a header.

export function InvoiceDownloadPage() {
  const { id = "" } = useParams();
  const { hash } = useLocation();
  const token = hash.replace(/^#/, "");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  async function handleDownload() {
    setState("loading");
    try {
      saveBlob(await downloadBuyerInvoicePdf(id, token), "factura.pdf");
      setState("idle");
    } catch {
      // Wrong token, unknown or not yet authorized: the API answers the same 404.
      setState("error");
    }
  }

  return (
    <Container>
      <SeoHead title="Tu factura — Soluciones Ópticas Jujuy" />
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="font-display text-2xl font-semibold text-text">Tu factura</h1>
        {token ? (
          <>
            <p className="mt-3 text-text-muted">
              Descargá la factura electrónica de tu compra online.
            </p>
            <button
              type="button"
              onClick={handleDownload}
              disabled={state === "loading"}
              className="mt-6 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60"
            >
              {state === "loading" ? "Descargando…" : "Descargar factura (PDF)"}
            </button>
          </>
        ) : null}
        {(!token || state === "error") && (
          <div role="alert" className="mt-6 text-text">
            <p>No pudimos encontrar esa factura. Revisá que el enlace del correo esté completo.</p>
            <div className="mt-4 flex justify-center">
              <WhatsAppButton message="Hola, no puedo descargar la factura de mi compra online.">
                Consultar por WhatsApp
              </WhatsAppButton>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
