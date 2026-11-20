import { Prisma, type FiscalDocumentStatus } from "@prisma/client";
import type {
  FiscalDocumentDetailDto,
  FiscalDocumentSummaryDto,
  FiscalIssuerDto,
  InvoicingStatusDto,
  OnlineInvoiceRequestDto,
  OnlineInvoicingRunDto,
} from "@soluciones-opticas/shared";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { env } from "../lib/env.js";
import { AmountError, computeVoucherAmounts } from "../lib/arca/amounts.js";
import {
  CONCEPT_PRODUCTS,
  CURRENCY_PESOS,
  DOCUMENT_TYPES,
  INVOICE_VOUCHER_TYPES,
  RECEPTOR_IVA_CONDITIONS,
  VAT_RATES,
  voucherTypeInfo,
} from "../lib/arca/codes.js";
import {
  InvoicingProviderError,
  type ArcaMessage,
  type VoucherKey,
  type VoucherRequest,
} from "../lib/invoicing-provider.js";
import {
  planVoucher,
  refuseUnverifiedOrder,
  type PaidOnlineOrder,
} from "../lib/online-order-invoice.js";
import { getInvoicingProvider, isInvoicingEnabled } from "./invoicing-provider.service.js";
import type {
  CompleteRequestBody,
  ConfirmTaxConditionBody,
  ListInvoicesQuery,
  UpsertIssuerBody,
  UpsertPointOfSaleBody,
} from "../schemas/invoicing.schema.js";

// Electronic invoicing of ONLINE purchases (ADR-0036, docs/FACTURACION_
// ARCA.md). In-store sales are invoiced from ARCA's portal; nothing here
// creates a voucher by hand.
//
//   paid order (verified by the checkout) → OnlineInvoiceRequest (one per
//   order) → plan (receptor, type, VAT) or WAITING_DATA → Sale + voucher
//   → emit → AUTHORIZED → email (its own state).
//
// Emission protocol, per (point of sale, voucher type): claim the sequence
// lock → SENDING → number = FECompUltimoAutorizado + 1 (saved before
// sending) → FECAESolicitar → AUTHORIZED | REJECTED (lock released) |
// UNCERTAIN (lock kept until FECompConsultar settles it). Every step is
// idempotent, so runOnlineInvoicing() can be repeated after any crash.
// Never touches products, variants, stock, prices or users.

/** A SENDING voucher older than this is treated as uncertain (the process
 * died between saving the number and settling the answer). */
const STALE_SENDING_MS = 2 * 60_000;

type Actor = { id: string } | null;

const toNumber = (value: Prisma.Decimal | null) => (value === null ? null : value.toNumber());
const isoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const arcaDate = (isoDay: string) => isoDay.replaceAll("-", "");
const fromArcaDate = (yyyymmdd: string) =>
  new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00Z`);

function asMessages(value: Prisma.JsonValue | null): ArcaMessage[] {
  return Array.isArray(value) ? (value as unknown as ArcaMessage[]) : [];
}

async function audit(
  tx: Prisma.TransactionClient,
  refs: { documentId?: string | null; requestId?: string | null },
  action: string,
  actor: Actor,
  change: { from?: FiscalDocumentStatus | null; to?: FiscalDocumentStatus | null } = {},
  details?: Record<string, unknown>,
) {
  await tx.fiscalAuditEvent.create({
    data: {
      documentId: refs.documentId ?? null,
      requestId: refs.requestId ?? null,
      action,
      actorId: actor?.id ?? null,
      fromStatus: change.from ?? null,
      toStatus: change.to ?? null,
      details: (details ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

// ─── Configuration ──────────────────────────────────────────────────────

const issuerInclude = { pointsOfSale: { orderBy: { number: "asc" } } } as const;
type IssuerWithPos = Prisma.FiscalIssuerGetPayload<{ include: typeof issuerInclude }>;

function toIssuerDto(issuer: IssuerWithPos): FiscalIssuerDto {
  return {
    id: issuer.id,
    cuit: issuer.cuit,
    legalName: issuer.legalName,
    commercialAddress: issuer.commercialAddress,
    grossIncomeNumber: issuer.grossIncomeNumber,
    activityStartDate: isoDate(issuer.activityStartDate),
    taxConditionCode: issuer.taxConditionCode,
    taxConditionConfirmedAt: issuer.taxConditionConfirmedAt?.toISOString() ?? null,
    finalConsumerIdThreshold: toNumber(issuer.finalConsumerIdThreshold),
    frameVatRateCode: issuer.frameVatRateCode,
    lensVatRateCode: issuer.lensVatRateCode,
    accessoryVatRateCode: issuer.accessoryVatRateCode,
    pointsOfSale: issuer.pointsOfSale.map((pos) => ({
      id: pos.id,
      number: pos.number,
      enabledVoucherTypes: pos.enabledVoucherTypes,
      active: pos.active,
      forOnlineSales: pos.forOnlineSales,
    })),
  };
}

/** One issuer for the store: the oldest row. */
async function findIssuer() {
  return prisma.fiscalIssuer.findFirst({ orderBy: { createdAt: "asc" }, include: issuerInclude });
}

const onlinePointOfSale = (issuer: IssuerWithPos | null) =>
  issuer?.pointsOfSale.find((pos) => pos.forOnlineSales && pos.active) ?? null;

function blockersFor(issuer: IssuerWithPos | null): string[] {
  const blockers: string[] = [];
  if (!isInvoicingEnabled()) blockers.push("La facturación electrónica está desactivada.");
  if (!issuer) {
    blockers.push("Falta cargar los datos del emisor.");
    return blockers;
  }
  if (issuer.taxConditionCode === null) {
    blockers.push("La condición fiscal del emisor no está confirmada (la confirma el contador).");
  }
  const pos = onlinePointOfSale(issuer);
  if (!pos || pos.enabledVoucherTypes.length === 0) {
    blockers.push(
      "Falta el punto de venta para ventas online (habilitado en ARCA para Web Services) con sus tipos de comprobante.",
    );
  }
  return blockers;
}

export async function getStatus(): Promise<InvoicingStatusDto> {
  const issuer = await findIssuer();
  return {
    enabled: isInvoicingEnabled(),
    environment: env.ARCA_MODE === "off" ? null : env.ARCA_MODE,
    emailEnabled: env.INVOICE_EMAIL_MODE !== "off",
    issuer: issuer ? toIssuerDto(issuer) : null,
    blockers: blockersFor(issuer),
    catalog: {
      voucherTypes: Object.entries(INVOICE_VOUCHER_TYPES).map(([code, info]) => ({
        code: Number(code),
        name: info.name,
        class: info.class,
      })),
      receptorConditions: Object.entries(RECEPTOR_IVA_CONDITIONS).map(([code, info]) => ({
        code: Number(code),
        name: info.name,
        classes: [...info.classes],
      })),
      documentTypes: Object.entries(DOCUMENT_TYPES).map(([code, name]) => ({
        code: Number(code),
        name,
      })),
      vatRates: Object.entries(VAT_RATES).map(([code, info]) => ({
        code: Number(code),
        name: info.name,
      })),
    },
  };
}

export async function upsertIssuer(body: UpsertIssuerBody, actor: Actor): Promise<FiscalIssuerDto> {
  const existing = await findIssuer();
  const data = {
    cuit: body.cuit,
    legalName: body.legalName,
    commercialAddress: body.commercialAddress,
    grossIncomeNumber: body.grossIncomeNumber ?? null,
    activityStartDate: body.activityStartDate
      ? new Date(`${body.activityStartDate}T00:00:00Z`)
      : null,
    finalConsumerIdThreshold:
      body.finalConsumerIdThreshold === undefined || body.finalConsumerIdThreshold === null
        ? null
        : new Prisma.Decimal(body.finalConsumerIdThreshold),
    frameVatRateCode: body.frameVatRateCode ?? null,
    lensVatRateCode: body.lensVatRateCode ?? null,
    accessoryVatRateCode: body.accessoryVatRateCode ?? null,
  };
  const issuer = await prisma.$transaction(async (tx) => {
    if (!existing) {
      const created = await tx.fiscalIssuer.create({ data, include: issuerInclude });
      await audit(tx, {}, "ISSUER_CREATED", actor);
      return created;
    }
    const cuitChanged = existing.cuit !== body.cuit;
    if (cuitChanged && (await tx.sale.count({ where: { issuerId: existing.id } })) > 0) {
      throw ApiError.conflict("El CUIT no se puede cambiar: ya hay comprobantes de este emisor.");
    }
    const updated = await tx.fiscalIssuer.update({
      where: { id: existing.id },
      // Another CUIT is another taxpayer: its condition must be confirmed again.
      data: cuitChanged
        ? {
            ...data,
            taxConditionCode: null,
            taxConditionConfirmedAt: null,
            taxConditionConfirmedBy: null,
          }
        : data,
      include: issuerInclude,
    });
    await audit(tx, {}, "ISSUER_UPDATED", actor, {}, { cuitChanged });
    return updated;
  });
  return toIssuerDto(issuer);
}

export async function confirmTaxCondition(
  body: ConfirmTaxConditionBody,
  actor: Actor,
): Promise<FiscalIssuerDto> {
  const existing = await findIssuer();
  if (!existing) throw ApiError.validation("Primero cargá los datos del emisor.");
  const issuer = await prisma.$transaction(async (tx) => {
    const updated = await tx.fiscalIssuer.update({
      where: { id: existing.id },
      data: {
        taxConditionCode: body.taxConditionCode,
        taxConditionConfirmedAt: new Date(),
        taxConditionConfirmedBy: actor?.id ?? null,
      },
      include: issuerInclude,
    });
    await audit(
      tx,
      {},
      "TAX_CONDITION_CONFIRMED",
      actor,
      {},
      {
        taxConditionCode: body.taxConditionCode,
      },
    );
    return updated;
  });
  return toIssuerDto(issuer);
}

export async function upsertPointOfSale(body: UpsertPointOfSaleBody, actor: Actor) {
  const issuer = await findIssuer();
  if (!issuer) throw ApiError.validation("Primero cargá los datos del emisor.");
  const enabledVoucherTypes = [...new Set(body.enabledVoucherTypes)].sort((a, b) => a - b);
  await prisma.$transaction(async (tx) => {
    if (body.forOnlineSales) {
      // Only one point of sale serves the online store.
      await tx.fiscalPointOfSale.updateMany({
        where: { issuerId: issuer.id, number: { not: body.number } },
        data: { forOnlineSales: false },
      });
    }
    await tx.fiscalPointOfSale.upsert({
      where: { issuerId_number: { issuerId: issuer.id, number: body.number } },
      create: {
        issuerId: issuer.id,
        number: body.number,
        enabledVoucherTypes,
        active: body.active,
        forOnlineSales: body.forOnlineSales,
      },
      update: { enabledVoucherTypes, active: body.active, forOnlineSales: body.forOnlineSales },
    });
    await audit(tx, {}, "POINT_OF_SALE_SAVED", actor, {}, { ...body, enabledVoucherTypes });
  });
  return toIssuerDto((await findIssuer())!);
}

// ─── Paid orders → requests ─────────────────────────────────────────────

const requestInclude = { sale: { include: { document: true } } } as const;
type RequestWithSale = Prisma.OnlineInvoiceRequestGetPayload<{ include: typeof requestInclude }>;

function toRequestDto(request: RequestWithSale): OnlineInvoiceRequestDto {
  const snapshot = request.orderSnapshot as unknown as PaidOnlineOrder;
  return {
    id: request.id,
    orderNumber: request.orderNumber,
    status: request.status,
    blockerReason: request.blockerReason,
    buyerName: `${snapshot.customerFirstName} ${snapshot.customerLastName}`.trim(),
    buyerEmail: request.buyerEmail,
    billingTaxId: snapshot.invoiceRequested ? snapshot.billingTaxId : null,
    total: Number(snapshot.grandTotal),
    paymentProvider: request.paymentProvider,
    paymentApprovedAt: request.paymentApprovedAt.toISOString(),
    documentId: request.sale?.document?.id ?? null,
    createdAt: request.createdAt.toISOString(),
  };
}

/**
 * Entry point for the checkout: called once its payment confirmation has
 * reconciled the order with the payment provider. Idempotent per order —
 * calling it again (webhook redelivery, retry after a crash) never creates
 * a second request or voucher.
 */
export async function receivePaidOrder(order: PaidOnlineOrder): Promise<OnlineInvoiceRequestDto> {
  const refusal = refuseUnverifiedOrder(order);
  if (refusal)
    throw ApiError.validation(`No se factura el pedido ${order.orderNumber}: ${refusal}`);
  let request = await prisma.onlineInvoiceRequest.findUnique({
    where: { orderId: order.orderId },
    include: requestInclude,
  });
  if (!request) {
    try {
      request = await prisma.$transaction(async (tx) => {
        const created = await tx.onlineInvoiceRequest.create({
          data: {
            orderId: order.orderId,
            orderNumber: order.orderNumber,
            paymentProvider: order.payment.provider,
            paymentReference: order.payment.providerPaymentId,
            paymentApprovedAt: new Date(order.payment.approvedAt),
            buyerEmail: order.customerEmail,
            orderSnapshot: order as unknown as Prisma.InputJsonValue,
          },
          include: requestInclude,
        });
        await audit(
          tx,
          { requestId: created.id },
          "PAID_ORDER_RECEIVED",
          null,
          {},
          {
            orderNumber: order.orderNumber,
            paymentProvider: order.payment.provider,
          },
        );
        return created;
      });
    } catch (error) {
      // The same order delivered twice at once: the winner's request stands.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
        throw error;
      }
      request = await prisma.onlineInvoiceRequest.findUniqueOrThrow({
        where: { orderId: order.orderId },
        include: requestInclude,
      });
    }
  }
  if (request.status !== "INVOICED") await prepareVoucher(request.id);
  return toRequestDto(
    await prisma.onlineInvoiceRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: requestInclude,
    }),
  );
}

/** Builds the sale and its DRAFT voucher, or records what is missing. */
async function prepareVoucher(requestId: string, actor: Actor = null): Promise<void> {
  const request = await prisma.onlineInvoiceRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (request.status === "INVOICED") return;
  const issuer = await findIssuer();
  const wait = async (reason: string) => {
    if (request.status === "WAITING_DATA" && request.blockerReason === reason) return;
    await prisma.$transaction(async (tx) => {
      await tx.onlineInvoiceRequest.update({
        where: { id: requestId },
        data: { status: "WAITING_DATA", blockerReason: reason },
      });
      await audit(tx, { requestId }, "WAITING_DATA", actor, {}, { reason });
    });
  };
  const blockers = blockersFor(issuer);
  if (blockers.length > 0) return wait(blockers.join(" "));
  const pointOfSale = onlinePointOfSale(issuer)!;
  const order = request.orderSnapshot as unknown as PaidOnlineOrder;
  const plan = planVoucher(order, issuer!, pointOfSale.enabledVoucherTypes, request);
  if (!plan.ok) return wait(plan.reason);

  const voucherClass = voucherTypeInfo(plan.voucherType)!.class;
  let amounts;
  try {
    amounts = computeVoucherAmounts(voucherClass, plan.lines);
  } catch (error) {
    if (error instanceof AmountError) return wait(error.message);
    throw error;
  }
  const environment = getInvoicingProvider().environment;
  try {
    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          issuerId: issuer!.id,
          requestId,
          // Set again when sent: the voucher date is the day it is issued.
          saleDate: new Date(`${todayInArgentina()}T00:00:00Z`),
          receptorDocType: plan.receptor.docType,
          receptorDocNumber: plan.receptor.docNumber,
          receptorName: plan.receptor.name,
          receptorIvaConditionCode: plan.receptor.ivaConditionCode,
          receptorAddress: plan.receptor.address,
          currency: CURRENCY_PESOS,
          untaxedAmount: amounts.untaxedAmount,
          exemptAmount: amounts.exemptAmount,
          netAmount: amounts.netAmount,
          vatAmount: amounts.vatAmount,
          otherTaxAmount: amounts.otherTaxAmount,
          totalAmount: amounts.totalAmount,
          items: {
            create: plan.lines.map((line, index) => ({
              position: index + 1,
              description: line.description,
              quantity: new Prisma.Decimal(line.quantity),
              unitPrice: line.unitPrice,
              vatRateCode: line.vatRateCode,
              grossAmount: amounts.lines[index]!.grossAmount,
              netAmount: amounts.lines[index]!.netAmount,
              vatAmount: amounts.lines[index]!.vatAmount,
              variantSku: line.variantSku,
            })),
          },
        },
      });
      const document = await tx.fiscalDocument.create({
        data: {
          saleId: sale.id,
          pointOfSaleId: pointOfSale.id,
          voucherType: plan.voucherType,
          environment,
          conceptCode: CONCEPT_PRODUCTS,
          idempotencyKey: `order:${request.orderId}`,
        },
      });
      await tx.onlineInvoiceRequest.update({
        where: { id: requestId },
        data: { status: "INVOICED", blockerReason: null },
      });
      await audit(tx, { requestId, documentId: document.id }, "CREATED", actor, { to: "DRAFT" });
    });
  } catch (error) {
    // Prepared concurrently by another worker: theirs stands.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
}

export async function listRequests(status?: "RECEIVED" | "WAITING_DATA" | "INVOICED") {
  const requests = await prisma.onlineInvoiceRequest.findMany({
    where: status ? { status } : {},
    include: requestInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return requests.map(toRequestDto);
}

/** An admin completes what the order did not carry (e.g. the buyer's IVA
 * condition); the request is then prepared and sent again. */
export async function completeRequest(id: string, body: CompleteRequestBody, actor: Actor) {
  const request = await prisma.onlineInvoiceRequest.findUnique({ where: { id } });
  if (!request) throw ApiError.notFound("Pedido a facturar no encontrado.");
  if (request.status === "INVOICED") throw ApiError.conflict("Ese pedido ya tiene comprobante.");
  await prisma.$transaction(async (tx) => {
    await tx.onlineInvoiceRequest.update({
      where: { id },
      data: {
        receptorIvaConditionCode: body.receptorIvaConditionCode,
        receptorDocType: body.receptorDocType,
        status: "RECEIVED",
      },
    });
    await audit(tx, { requestId: id }, "DATA_COMPLETED", actor, {}, { ...body });
  });
  await prepareVoucher(id, actor);
  return toRequestDto(
    await prisma.onlineInvoiceRequest.findUniqueOrThrow({ where: { id }, include: requestInclude }),
  );
}

// ─── Vouchers ───────────────────────────────────────────────────────────

const documentInclude = {
  sale: { include: { items: { orderBy: { position: "asc" } }, issuer: true, request: true } },
  pointOfSale: true,
  events: { orderBy: { createdAt: "asc" } },
  email: true,
} as const;
export type DocumentWithAll = Prisma.FiscalDocumentGetPayload<{ include: typeof documentInclude }>;

function toSummaryDto(document: DocumentWithAll): FiscalDocumentSummaryDto {
  return {
    id: document.id,
    status: document.status,
    environment: document.environment as FiscalDocumentSummaryDto["environment"],
    orderNumber: document.sale.request.orderNumber,
    pointOfSale: document.pointOfSale.number,
    voucherType: document.voucherType,
    voucherName: voucherTypeInfo(document.voucherType)?.name ?? `Tipo ${document.voucherType}`,
    number: document.number,
    issueDate: isoDate(document.sale.saleDate)!,
    receptorName: document.sale.receptorName,
    receptorDocType: document.sale.receptorDocType,
    receptorDocNumber: document.sale.receptorDocNumber,
    totalAmount: document.sale.totalAmount.toNumber(),
    cae: document.cae,
    emailStatus: document.email?.status ?? null,
    createdAt: document.createdAt.toISOString(),
  };
}

function toDetailDto(document: DocumentWithAll): FiscalDocumentDetailDto {
  const { sale } = document;
  return {
    ...toSummaryDto(document),
    caeDueDate: isoDate(document.caeDueDate),
    authorizedAt: document.authorizedAt?.toISOString() ?? null,
    attempts: document.attempts,
    receptorIvaConditionCode: sale.receptorIvaConditionCode,
    receptorAddress: sale.receptorAddress,
    untaxedAmount: sale.untaxedAmount.toNumber(),
    exemptAmount: sale.exemptAmount.toNumber(),
    netAmount: sale.netAmount.toNumber(),
    vatAmount: sale.vatAmount.toNumber(),
    otherTaxAmount: sale.otherTaxAmount.toNumber(),
    items: sale.items.map((item) => ({
      position: item.position,
      description: item.description,
      quantity: item.quantity.toNumber(),
      unitPrice: item.unitPrice.toNumber(),
      vatRateCode: item.vatRateCode,
      grossAmount: item.grossAmount.toNumber(),
      netAmount: item.netAmount.toNumber(),
      vatAmount: item.vatAmount.toNumber(),
      variantSku: item.variantSku,
    })),
    arcaErrors: asMessages(document.arcaErrors),
    arcaObservations: asMessages(document.arcaObservations),
    email: document.email
      ? {
          recipient: document.email.recipient,
          status: document.email.status,
          attempts: document.email.attempts,
          lastError: document.email.lastError,
          sentAt: document.email.sentAt?.toISOString() ?? null,
          nextAttemptAt: document.email.nextAttemptAt?.toISOString() ?? null,
        }
      : null,
    events: document.events.map((event) => ({
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      createdAt: event.createdAt.toISOString(),
      details: event.details,
    })),
  };
}

export async function loadDocument(id: string): Promise<DocumentWithAll> {
  const document = await prisma.fiscalDocument.findUnique({
    where: { id },
    include: documentInclude,
  });
  if (!document) throw ApiError.notFound("Comprobante no encontrado.");
  return document;
}

export async function listInvoices(query: ListInvoicesQuery) {
  const where = query.status ? { status: query.status } : {};
  const [total, documents] = await Promise.all([
    prisma.fiscalDocument.count({ where }),
    prisma.fiscalDocument.findMany({
      where,
      include: documentInclude,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  return {
    data: documents.map(toSummaryDto),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function getInvoice(id: string): Promise<FiscalDocumentDetailDto> {
  return toDetailDto(await loadDocument(id));
}

function todayInArgentina(): string {
  // ARCA dates are Argentine calendar days (UTC−3, no daylight saving).
  return new Date(Date.now() - 3 * 60 * 60_000).toISOString().slice(0, 10);
}

function voucherKey(document: DocumentWithAll): VoucherKey {
  return {
    issuerCuit: document.sale.issuer.cuit,
    pointOfSale: document.pointOfSale.number,
    voucherType: document.voucherType,
  };
}

function buildRequest(
  document: DocumentWithAll,
  number: number,
  issueDate: string,
): VoucherRequest {
  const { sale } = document;
  const voucher = voucherTypeInfo(document.voucherType)!;
  const amounts = computeVoucherAmounts(
    voucher.class,
    sale.items.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      vatRateCode: item.vatRateCode,
    })),
  );
  const fixed = (value: Prisma.Decimal) => value.toFixed(2);
  return {
    ...voucherKey(document),
    number,
    concept: document.conceptCode,
    docType: sale.receptorDocType,
    docNumber: sale.receptorDocNumber,
    issueDate: arcaDate(issueDate),
    total: fixed(sale.totalAmount),
    untaxed: fixed(sale.untaxedAmount),
    net: fixed(sale.netAmount),
    exempt: fixed(sale.exemptAmount),
    otherTaxes: fixed(sale.otherTaxAmount),
    vat: fixed(sale.vatAmount),
    currency: sale.currency,
    exchangeRate: "1",
    receptorIvaConditionId: sale.receptorIvaConditionCode,
    vatLines: amounts.vatLines.map((line) => ({
      code: line.code,
      base: fixed(line.base),
      amount: fixed(line.amount),
    })),
  };
}

async function sequenceFor(document: DocumentWithAll) {
  return prisma.fiscalSequence.upsert({
    where: {
      pointOfSaleId_voucherType: {
        pointOfSaleId: document.pointOfSaleId,
        voucherType: document.voucherType,
      },
    },
    create: { pointOfSaleId: document.pointOfSaleId, voucherType: document.voucherType },
    update: {},
  });
}

async function releaseSequence(tx: Prisma.TransactionClient, documentId: string) {
  await tx.fiscalSequence.updateMany({
    where: { inFlightDocumentId: documentId },
    data: { inFlightDocumentId: null },
  });
}

/** Once authorized, the buyer's email is queued (its own state). */
async function queueEmail(tx: Prisma.TransactionClient, document: DocumentWithAll) {
  await tx.invoiceEmailDelivery.upsert({
    where: { documentId: document.id },
    create: {
      documentId: document.id,
      recipient: document.sale.request.buyerEmail,
      nextAttemptAt: new Date(),
    },
    update: {},
  });
}

/** Sends a DRAFT voucher (or a REJECTED one, after fixing what ARCA
 * objected to) to ARCA. Idempotent for an AUTHORIZED voucher. */
export async function emitInvoice(id: string, actor: Actor): Promise<FiscalDocumentDetailDto> {
  const document = await loadDocument(id);
  if (document.status === "AUTHORIZED") return toDetailDto(document);
  if (document.status === "UNCERTAIN" || document.status === "SENDING") {
    throw ApiError.conflict("La respuesta de ARCA quedó pendiente: usá «Verificar en ARCA».");
  }
  if (document.status === "NEEDS_REVIEW") {
    throw ApiError.conflict(
      "Este comprobante necesita revisión manual antes de volver a enviarse.",
    );
  }
  const provider = getInvoicingProvider();
  if (document.environment !== provider.environment) {
    throw ApiError.conflict("El comprobante se creó en otro ambiente de ARCA.");
  }
  const blockers = blockersFor(await findIssuer());
  if (blockers.length > 0) throw new ApiError(409, "INVOICING_NOT_READY", blockers.join(" "));

  const fromStatus = document.status;
  const sequence = await sequenceFor(document);
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.fiscalSequence.updateMany({
      where: { id: sequence.id, inFlightDocumentId: null },
      data: { inFlightDocumentId: document.id },
    });
    if (claim.count === 0) return false;
    const moved = await tx.fiscalDocument.updateMany({
      where: { id: document.id, status: fromStatus },
      data: { status: "SENDING", attempts: { increment: 1 }, arcaErrors: Prisma.DbNull },
    });
    if (moved.count === 0) {
      await releaseSequence(tx, document.id);
      return false;
    }
    await audit(tx, { documentId: document.id }, "SEND_STARTED", actor, {
      from: fromStatus,
      to: "SENDING",
    });
    return true;
  });
  if (!claimed) {
    throw ApiError.conflict(
      "Hay otra emisión en curso para este punto de venta y tipo de comprobante. Esperá a que termine.",
    );
  }

  const backOff = async (error: InvoicingProviderError): Promise<never> => {
    await prisma.$transaction(async (tx) => {
      await tx.fiscalDocument.update({
        where: { id: document.id },
        data: { status: fromStatus, number: null },
      });
      await releaseSequence(tx, document.id);
      await audit(
        tx,
        { documentId: document.id },
        "SEND_NOT_STARTED",
        actor,
        { from: "SENDING", to: fromStatus },
        { reason: error.message, errors: error.errors },
      );
    });
    throw ApiError.badGateway(`${error.message} No se envió el comprobante.`);
  };

  const key = voucherKey(document);
  let number: number;
  try {
    number = (await provider.lastAuthorized(key)) + 1;
  } catch (error) {
    if (error instanceof InvoicingProviderError) return backOff(error);
    throw error;
  }
  const issueDate = todayInArgentina();
  const request = buildRequest(document, number, issueDate);
  // Saved before sending: if the answer is lost, this is what we look up.
  try {
    await prisma.$transaction([
      prisma.fiscalDocument.update({
        where: { id: document.id },
        data: { number, requestSnapshot: request as unknown as Prisma.InputJsonValue },
      }),
      prisma.sale.update({
        where: { id: document.saleId },
        data: { saleDate: new Date(`${issueDate}T00:00:00Z`) },
      }),
    ]);
  } catch (error) {
    // ARCA's next number is already held by a local voucher (e.g. one
    // under manual review): nothing was sent; stop before sending.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return backOff(
        new InvoicingProviderError(
          `El número ${number} que informa ARCA ya figura en otro comprobante local: hay que revisarlo.`,
          { uncertain: false },
        ),
      );
    }
    throw error;
  }

  let result;
  try {
    result = await provider.authorize(request);
  } catch (error) {
    if (!(error instanceof InvoicingProviderError)) throw error;
    if (!error.uncertain) return backOff(error);
    await prisma.$transaction(async (tx) => {
      await tx.fiscalDocument.update({
        where: { id: document.id },
        data: { status: "UNCERTAIN" },
      });
      // The sequence stays locked: the next number depends on this one.
      await audit(
        tx,
        { documentId: document.id },
        "SEND_UNCERTAIN",
        actor,
        { from: "SENDING", to: "UNCERTAIN" },
        { number, reason: error.message },
      );
    });
    throw new ApiError(
      502,
      "INVOICE_UNCERTAIN",
      "ARCA no confirmó la respuesta. No vuelvas a emitir: usá «Verificar en ARCA».",
    );
  }

  await prisma.$transaction(async (tx) => {
    if (result.outcome === "AUTHORIZED") {
      await tx.fiscalDocument.update({
        where: { id: document.id },
        data: {
          status: "AUTHORIZED",
          cae: result.cae,
          caeDueDate: fromArcaDate(result.caeDueDate),
          authorizedAt: new Date(),
          arcaObservations: result.observations as unknown as Prisma.InputJsonValue,
        },
      });
      await queueEmail(tx, document);
    } else {
      await tx.fiscalDocument.update({
        where: { id: document.id },
        data: {
          status: "REJECTED",
          number: null,
          arcaErrors: result.errors as unknown as Prisma.InputJsonValue,
          arcaObservations: result.observations as unknown as Prisma.InputJsonValue,
        },
      });
    }
    await releaseSequence(tx, document.id);
    await audit(
      tx,
      { documentId: document.id },
      result.outcome,
      actor,
      { from: "SENDING", to: result.outcome },
      {
        number,
        errors: result.outcome === "REJECTED" ? result.errors : [],
        observations: result.observations,
      },
    );
  });
  return getInvoice(id);
}

const sameAmount = (a: string, b: string) => Number(a).toFixed(2) === Number(b).toFixed(2);

/** Settles an UNCERTAIN voucher (or a SENDING one left by a crash) by
 * asking ARCA for that exact number — never by sending it again. */
export async function verifyInvoice(id: string, actor: Actor): Promise<FiscalDocumentDetailDto> {
  const document = await loadDocument(id);
  const stale =
    document.status === "SENDING" && Date.now() - document.updatedAt.getTime() > STALE_SENDING_MS;
  if (document.status !== "UNCERTAIN" && !stale) {
    throw ApiError.conflict("Solo se verifican comprobantes con la respuesta de ARCA pendiente.");
  }
  const provider = getInvoicingProvider();
  const settle = async (
    to: FiscalDocumentStatus,
    data: Prisma.FiscalDocumentUpdateInput,
    details: Record<string, unknown>,
    release: boolean,
  ) => {
    await prisma.$transaction(async (tx) => {
      await tx.fiscalDocument.update({ where: { id }, data: { ...data, status: to } });
      if (release) await releaseSequence(tx, id);
      if (to === "AUTHORIZED") await queueEmail(tx, document);
      await audit(
        tx,
        { documentId: id },
        "VERIFIED",
        actor,
        { from: document.status, to },
        details,
      );
    });
    return getInvoice(id);
  };

  if (document.number === null) {
    // Died before the number was saved: nothing reached ARCA.
    return settle("DRAFT", {}, { reason: "sin número asignado" }, true);
  }
  const key = voucherKey(document);
  const request = document.requestSnapshot as unknown as VoucherRequest | null;
  try {
    const found = await provider.consult(key, document.number);
    if (!found) {
      const last = await provider.lastAuthorized(key);
      if (last < document.number) {
        return settle(
          "DRAFT",
          { number: null },
          { number: document.number, found: false, last },
          true,
        );
      }
      return settle("NEEDS_REVIEW", {}, { number: document.number, found: false, last }, false);
    }
    const matches =
      request !== null &&
      found.result === "A" &&
      found.docType === request.docType &&
      found.docNumber === request.docNumber &&
      found.issueDate === request.issueDate &&
      sameAmount(found.total, request.total);
    if (!matches) {
      return settle(
        "NEEDS_REVIEW",
        {},
        { number: document.number, found: true, matches: false },
        false,
      );
    }
    return settle(
      "AUTHORIZED",
      {
        cae: found.authorizationCode,
        caeDueDate: fromArcaDate(found.dueDate),
        authorizedAt: new Date(),
      },
      { number: document.number, found: true, matches: true },
      true,
    );
  } catch (error) {
    if (error instanceof InvoicingProviderError) {
      throw ApiError.badGateway(`${error.message} El comprobante sigue pendiente de verificación.`);
    }
    throw error;
  }
}

export async function loadAuthorizedForPdf(id: string) {
  const document = await loadDocument(id);
  if (document.status !== "AUTHORIZED" || !document.cae || document.number === null) {
    throw ApiError.conflict("El PDF solo existe para comprobantes autorizados por ARCA.");
  }
  return document;
}

// ─── Recovery ───────────────────────────────────────────────────────────

/**
 * Moves every online invoice forward one safe step: prepares received or
 * waiting requests, verifies uncertain vouchers and stale sends, emits
 * drafts, then delivers pending emails. Idempotent: safe to run from an
 * admin button or a scheduler as often as needed. REJECTED vouchers are
 * left to a person (ARCA objected to the data).
 */
export async function runOnlineInvoicing(
  deliverEmails: () => Promise<{ sent: number; failed: number }>,
  actor: Actor = null,
): Promise<OnlineInvoicingRunDto> {
  const summary: OnlineInvoicingRunDto = {
    prepared: 0,
    verified: 0,
    emitted: 0,
    failed: 0,
    emailsSent: 0,
    emailsFailed: 0,
  };
  if (!isInvoicingEnabled()) return summary;

  for (const request of await prisma.onlineInvoiceRequest.findMany({
    where: { status: { in: ["RECEIVED", "WAITING_DATA"] } },
    select: { id: true },
  })) {
    await prepareVoucher(request.id, actor);
    summary.prepared += 1;
  }
  const staleBefore = new Date(Date.now() - STALE_SENDING_MS);
  for (const document of await prisma.fiscalDocument.findMany({
    where: { OR: [{ status: "UNCERTAIN" }, { status: "SENDING", updatedAt: { lt: staleBefore } }] },
    select: { id: true },
  })) {
    try {
      await verifyInvoice(document.id, actor);
      summary.verified += 1;
    } catch {
      summary.failed += 1;
    }
  }
  for (const document of await prisma.fiscalDocument.findMany({
    where: { status: "DRAFT" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })) {
    try {
      await emitInvoice(document.id, actor);
      summary.emitted += 1;
    } catch {
      summary.failed += 1;
    }
  }
  const emails = await deliverEmails();
  summary.emailsSent = emails.sent;
  summary.emailsFailed = emails.failed;
  return summary;
}
