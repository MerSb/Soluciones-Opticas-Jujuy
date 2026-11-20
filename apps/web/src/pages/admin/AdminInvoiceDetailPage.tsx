import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SeoHead } from "../../components/ui/SeoHead";
import { StatusMessage } from "../../components/ui/StatusMessage";
import { FormField } from "../../components/forms/FormField";
import { ApiClientError } from "../../services/api-client";
import { formatPrice } from "../../lib/format-price";
import {
  downloadInvoicePdf,
  saveBlob,
  useEmitInvoiceMutation,
  useInvoiceQuery,
  useResendEmailMutation,
  useVerifyInvoiceMutation,
} from "../../services/queries/admin-invoicing";
import {
  EMAIL_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  InvoiceStatusBadge,
  formatVoucherNumber,
} from "./invoice-status";

// One online invoice (ADR-0036): its ARCA state and its email state, kept
// apart. An uncertain answer is settled by asking ARCA, never by sending
// again; resending the email never issues another voucher.

const primaryButton =
  "rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-surface hover:bg-primary-dark disabled:opacity-60";
const secondaryButton =
  "rounded-md border border-border px-3 py-2 text-sm font-medium text-text hover:bg-surface-muted disabled:opacity-60";

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

export function AdminInvoiceDetailPage() {
  const { id = "" } = useParams();
  const invoice = useInvoiceQuery(id);
  const emit = useEmitInvoiceMutation();
  const verify = useVerifyInvoiceMutation();
  const resend = useResendEmailMutation();
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");

  if (invoice.isLoading) return <p className="text-sm text-text-muted">Cargando…</p>;
  if (invoice.isError || !invoice.data) {
    return <StatusMessage variant="not-found" message="No encontramos esa factura." />;
  }
  const data = invoice.data;
  const number = formatVoucherNumber(data);
  const showVat = data.voucherType === 1;

  async function handleDownload() {
    setPdfError(null);
    try {
      saveBlob(
        await downloadInvoicePdf(data.id),
        `${data.voucherName.replaceAll(" ", "-")}-${number}.pdf`,
      );
    } catch (error) {
      setPdfError(errorText(error, "No pudimos descargar el PDF."));
    }
  }

  return (
    <div className="max-w-4xl">
      <SeoHead title={`${data.voucherName} — Facturación online`} />
      <Link to="/admin/invoicing" className="text-sm text-primary hover:underline">
        ← Facturas online
      </Link>
      <h2 className="mt-3 font-display text-xl font-semibold text-text">
        {data.voucherName} {number}
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text">
        <InvoiceStatusBadge status={data.status} />
        <span>Pedido {data.orderNumber}</span>
        <span>Fecha: {data.issueDate}</span>
        {data.environment !== "homologacion" && (
          <span className="text-text-muted">Simulado — sin validez fiscal</span>
        )}
        {data.environment === "homologacion" && (
          <span className="text-text-muted">Homologación — sin validez fiscal</span>
        )}
      </div>

      {data.cae && (
        <p className="mt-3 text-sm text-text">
          CAE <span className="font-mono">{data.cae}</span>
          {data.caeDueDate && <> · vence el {data.caeDueDate}</>}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        {data.status === "REJECTED" && (
          <button
            type="button"
            className={primaryButton}
            disabled={emit.isPending}
            onClick={() => emit.mutate(data.id)}
          >
            {emit.isPending ? "Enviando…" : "Enviar de nuevo a ARCA"}
          </button>
        )}
        {data.status === "DRAFT" && (
          <button
            type="button"
            className={primaryButton}
            disabled={emit.isPending}
            onClick={() => emit.mutate(data.id)}
          >
            {emit.isPending ? "Enviando…" : "Emitir ahora"}
          </button>
        )}
        {data.status === "UNCERTAIN" && (
          <button
            type="button"
            className={primaryButton}
            disabled={verify.isPending}
            onClick={() => verify.mutate(data.id)}
          >
            {verify.isPending ? "Consultando…" : "Verificar en ARCA"}
          </button>
        )}
        {data.status === "AUTHORIZED" && (
          <button type="button" className={secondaryButton} onClick={handleDownload}>
            Descargar PDF
          </button>
        )}
      </div>
      {data.status === "UNCERTAIN" && (
        <p className="mt-2 text-sm text-text">
          ARCA no confirmó la respuesta. No se vuelve a emitir: «Verificar en ARCA» consulta si el
          comprobante {number} quedó autorizado.
        </p>
      )}
      {data.status === "REJECTED" && (
        <p className="mt-2 text-sm text-text">
          Revisá los mensajes de ARCA antes de enviarlo de nuevo.
        </p>
      )}
      {data.status === "NEEDS_REVIEW" && (
        <p className="mt-2 text-sm text-danger">
          ARCA tiene un comprobante con ese número y datos distintos. Hay que revisarlo con el
          contador antes de seguir emitiendo en este punto de venta.
        </p>
      )}
      {[emit, verify].map(
        (mutation, index) =>
          mutation.isError && (
            <p key={index} role="alert" className="mt-2 text-sm text-danger">
              {errorText(mutation.error, "No pudimos completar la operación.")}
            </p>
          ),
      )}
      {pdfError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {pdfError}
        </p>
      )}

      {data.email && (
        <section className="mt-6" aria-labelledby="email-heading">
          <h3 id="email-heading" className="font-semibold text-text">
            Correo al comprador
          </h3>
          <p className="mt-1 text-sm text-text">
            {EMAIL_STATUS_LABELS[data.email.status]} · {data.email.recipient}
            {data.email.sentAt && (
              <> · enviado el {data.email.sentAt.slice(0, 16).replace("T", " ")}</>
            )}
            {data.email.lastError && data.email.status === "FAILED" && (
              <> · {data.email.lastError}</>
            )}
          </p>
          <form
            noValidate
            className="mt-2 flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              resend.mutate({ id: data.id, recipient: recipient.trim() || undefined });
            }}
          >
            <FormField
              label="Otra dirección (opcional)"
              type="email"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              className="w-72"
            />
            <button type="submit" className={secondaryButton} disabled={resend.isPending}>
              {resend.isPending ? "Enviando…" : "Reenviar correo"}
            </button>
          </form>
          <p className="mt-1 text-xs text-text-muted">Reenviar no emite otra factura.</p>
          {resend.isError && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {errorText(resend.error, "No pudimos reenviar el correo.")}
            </p>
          )}
        </section>
      )}

      {(data.arcaErrors.length > 0 || data.arcaObservations.length > 0) && (
        <section className="mt-6" aria-labelledby="arca-heading">
          <h3 id="arca-heading" className="font-semibold text-text">
            Mensajes de ARCA
          </h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-text">
            {[...data.arcaErrors, ...data.arcaObservations].map((message, index) => (
              <li key={index}>
                {message.code}: {message.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6" aria-labelledby="receptor-heading">
        <h3 id="receptor-heading" className="font-semibold text-text">
          Comprador
        </h3>
        <p className="mt-1 text-sm text-text">
          {data.receptorName ?? "—"}
          {data.receptorDocType !== 99 && <> · Doc. {data.receptorDocNumber}</>}
          {data.receptorAddress && <> · {data.receptorAddress}</>}
        </p>
      </section>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="py-2 pr-4 font-medium">Descripción</th>
              <th className="py-2 pr-4 font-medium">Cantidad</th>
              <th className="py-2 font-medium">{showVat ? "Neto" : "Importe"}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr key={item.position} className="border-b border-border">
                <td className="py-2 pr-4 text-text">
                  {item.description}
                  {item.variantSku && (
                    <span className="block text-xs text-text-muted">SKU {item.variantSku}</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-text">{item.quantity}</td>
                <td className="py-2 text-text">
                  {formatPrice(showVat ? item.netAmount : item.grossAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="mt-4 ml-auto w-72 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-text-muted">{showVat ? "IVA" : "IVA contenido"}</dt>
          <dd className="text-text">{formatPrice(data.vatAmount)}</dd>
        </div>
        <div className="flex justify-between font-semibold">
          <dt className="text-text">Total</dt>
          <dd className="text-text">{formatPrice(data.totalAmount)}</dd>
        </div>
      </dl>

      <section className="mt-8" aria-labelledby="history-heading">
        <h3 id="history-heading" className="font-semibold text-text">
          Historial
        </h3>
        <ol className="mt-1 space-y-1 text-sm text-text">
          {data.events.map((event, index) => (
            <li key={index}>
              <span className="text-text-muted">
                {event.createdAt.slice(0, 19).replace("T", " ")}
              </span>{" "}
              {event.toStatus ? INVOICE_STATUS_LABELS[event.toStatus] : event.action}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
