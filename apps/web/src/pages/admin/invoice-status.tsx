import type {
  FiscalDocumentStatus,
  FiscalDocumentSummaryDto,
  InvoiceEmailStatus,
} from "@soluciones-opticas/shared";

// Plain-language labels for the voucher and email states (ADR-0036).
export const INVOICE_STATUS_LABELS: Record<FiscalDocumentStatus, string> = {
  DRAFT: "Por emitir",
  SENDING: "Enviando a ARCA",
  AUTHORIZED: "Autorizado",
  REJECTED: "Rechazado por ARCA",
  UNCERTAIN: "Respuesta pendiente",
  NEEDS_REVIEW: "Revisión manual",
};

export const EMAIL_STATUS_LABELS: Record<InvoiceEmailStatus, string> = {
  PENDING: "Pendiente",
  SENDING: "Enviando",
  SENT: "Enviado",
  FAILED: "Falló",
};

const TONES: Record<FiscalDocumentStatus, string> = {
  DRAFT: "bg-surface-muted text-text",
  SENDING: "bg-primary/10 text-primary",
  AUTHORIZED: "bg-success/10 text-success",
  REJECTED: "bg-danger/10 text-danger",
  UNCERTAIN: "bg-accent/10 text-text",
  NEEDS_REVIEW: "bg-danger/10 text-danger",
};

export function InvoiceStatusBadge({ status }: { status: FiscalDocumentStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONES[status]}`}>
      {INVOICE_STATUS_LABELS[status]}
    </span>
  );
}

export function formatVoucherNumber(
  invoice: Pick<FiscalDocumentSummaryDto, "number" | "pointOfSale">,
) {
  return invoice.number
    ? `${String(invoice.pointOfSale).padStart(5, "0")}-${String(invoice.number).padStart(8, "0")}`
    : "(sin número)";
}
