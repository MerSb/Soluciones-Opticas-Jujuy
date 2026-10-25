import type { InvoiceEmailStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { env } from "../lib/env.js";
import { invoiceAccessToken } from "../lib/invoice-access-token.js";
import { createMockInvoiceEmailProvider, type InvoiceEmailProvider } from "../lib/invoice-email.js";
import { voucherTypeInfo } from "../lib/arca/codes.js";
import { renderInvoicePdf } from "./invoice-pdf.service.js";

// Delivery of the invoice PDF to the buyer (ADR-0036): its own state
// (InvoiceEmailDelivery), separate from the voucher. Sending again only
// touches this row — never ARCA, never the voucher. Failures back off
// (5 min, 10, 20… up to 6 h) and stop after MAX_ATTEMPTS, waiting for a
// person to resend. No real email provider is chosen yet: "mock" only.

export const MAX_ATTEMPTS = 8;
const LEASE_MS = 5 * 60_000;

export const mockEmailProvider = createMockInvoiceEmailProvider();

function getEmailProvider(): InvoiceEmailProvider | null {
  return env.INVOICE_EMAIL_MODE === "mock" ? mockEmailProvider : null;
}

const backoffMs = (attempts: number) => Math.min(5 * 60_000 * 2 ** (attempts - 1), 6 * 3_600_000);
const pad = (value: number, length: number) => String(value).padStart(length, "0");

async function audit(documentId: string, action: string, actorId: string | null, details: object) {
  await prisma.fiscalAuditEvent.create({
    data: { documentId, action, actorId, details: details as object },
  });
}

/** Sends one invoice email if it is due. Returns the resulting status. */
export async function deliverInvoiceEmail(documentId: string): Promise<InvoiceEmailStatus | null> {
  const provider = getEmailProvider();
  if (!provider) return null;
  const now = new Date();
  // Claim: one sender at a time; a SENDING row older than the lease was
  // left by a crash and may be taken again.
  const claimed = await prisma.invoiceEmailDelivery.updateMany({
    where: {
      documentId,
      OR: [
        { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: now } },
        { status: "SENDING", updatedAt: { lt: new Date(now.getTime() - LEASE_MS) } },
      ],
    },
    data: { status: "SENDING", attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null;
  const delivery = await prisma.invoiceEmailDelivery.findUniqueOrThrow({
    where: { documentId },
    include: { document: { include: { pointOfSale: true, sale: { include: { request: true } } } } },
  });

  try {
    const pdf = await renderInvoicePdf(documentId);
    const { document } = delivery;
    const voucher = voucherTypeInfo(document.voucherType)?.name ?? "Factura";
    const number = `${pad(document.pointOfSale.number, 5)}-${pad(document.number!, 8)}`;
    const link = env.PUBLIC_WEB_URL
      ? `${env.PUBLIC_WEB_URL.replace(/\/$/, "")}/factura/${documentId}#${invoiceAccessToken(documentId)}`
      : null;
    const messageId = await provider.send({
      to: delivery.recipient,
      subject: `${voucher} ${number} — pedido ${document.sale.request.orderNumber}`,
      text: [
        "Hola,",
        "",
        `Te enviamos la factura de tu compra online (pedido ${document.sale.request.orderNumber}).`,
        `${voucher} ${number} — CAE ${document.cae}.`,
        ...(link ? ["", `También podés descargarla desde: ${link}`] : []),
        "",
        "Soluciones Ópticas Jujuy",
      ].join("\n"),
      attachment: { filename: pdf.filename, content: pdf.content, contentType: "application/pdf" },
    });
    await prisma.invoiceEmailDelivery.update({
      where: { documentId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        providerMessageId: messageId,
        lastError: null,
        nextAttemptAt: null,
      },
    });
    await audit(documentId, "EMAIL_SENT", null, {
      provider: provider.code,
      attempt: delivery.attempts,
    });
    return "SENT";
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "Error desconocido";
    const exhausted = delivery.attempts >= MAX_ATTEMPTS;
    await prisma.invoiceEmailDelivery.update({
      where: { documentId },
      data: {
        status: "FAILED",
        lastError: message,
        nextAttemptAt: exhausted ? null : new Date(Date.now() + backoffMs(delivery.attempts)),
      },
    });
    await audit(documentId, "EMAIL_FAILED", null, { attempt: delivery.attempts, exhausted });
    return "FAILED";
  }
}

export async function deliverPendingEmails(): Promise<{ sent: number; failed: number }> {
  const due = await prisma.invoiceEmailDelivery.findMany({
    where: {
      OR: [
        { status: { in: ["PENDING", "FAILED"] }, nextAttemptAt: { lte: new Date() } },
        { status: "SENDING", updatedAt: { lt: new Date(Date.now() - LEASE_MS) } },
      ],
    },
    select: { documentId: true },
    take: 50,
  });
  const result = { sent: 0, failed: 0 };
  for (const { documentId } of due) {
    const status = await deliverInvoiceEmail(documentId);
    if (status === "SENT") result.sent += 1;
    if (status === "FAILED") result.failed += 1;
  }
  return result;
}

/** Sends the same invoice again (optionally to a corrected address).
 * Never issues another voucher. */
export async function resendInvoiceEmail(
  documentId: string,
  actorId: string,
  recipient?: string,
): Promise<InvoiceEmailStatus | null> {
  const delivery = await prisma.invoiceEmailDelivery.findUnique({ where: { documentId } });
  if (!delivery) throw ApiError.conflict("Ese comprobante todavía no tiene correo para reenviar.");
  if (!getEmailProvider())
    throw new ApiError(503, "EMAIL_NOT_CONFIGURED", "El envío de correos está desactivado.");
  if (delivery.status === "SENDING") throw ApiError.conflict("El correo se está enviando ahora.");
  await prisma.invoiceEmailDelivery.update({
    where: { documentId },
    data: {
      status: "PENDING",
      nextAttemptAt: new Date(),
      attempts: 0,
      ...(recipient ? { recipient } : {}),
    },
  });
  await audit(documentId, "EMAIL_RESEND_REQUESTED", actorId, {
    recipientChanged: Boolean(recipient),
  });
  return deliverInvoiceEmail(documentId);
}
