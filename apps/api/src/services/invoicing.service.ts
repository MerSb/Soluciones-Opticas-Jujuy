import { createHash } from "node:crypto";
import { Prisma, type FiscalDocumentStatus } from "@prisma/client";
import type {
  FiscalDocumentDetailDto,
  FiscalDocumentSummaryDto,
  FiscalIssuerDto,
  InvoicingStatusDto,
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
  UNIDENTIFIED_DOC_TYPE,
  VAT_RATES,
  receptorCondition,
  voucherTypeInfo,
} from "../lib/arca/codes.js";
import {
  InvoicingProviderError,
  type ArcaMessage,
  type VoucherKey,
  type VoucherRequest,
} from "../lib/invoicing-provider.js";
import { getInvoicingProvider, isInvoicingEnabled } from "./invoicing-provider.service.js";
import type {
  ConfirmTaxConditionBody,
  CreateInvoiceBody,
  ListInvoicesQuery,
  UpsertIssuerBody,
  UpsertPointOfSaleBody,
} from "../schemas/invoicing.schema.js";

// Electronic invoicing (ADR-0036, docs/FACTURACION_ARCA.md). Emission
// protocol, per (point of sale, voucher type):
//   claim the sequence lock → SENDING → number = FECompUltimoAutorizado + 1
//   (saved before sending) → FECAESolicitar →
//   AUTHORIZED | REJECTED (lock released) | UNCERTAIN (lock kept until
//   FECompConsultar settles it).
// Never touches products, variants, stock or users.

/** A SENDING voucher older than this is treated as uncertain (the process
 * died between saving the number and settling the answer). */
const STALE_SENDING_MS = 2 * 60_000;
/** CbteFch window for concept 1 (manual v4.8): up to 5 days either side. */
const ISSUE_DATE_WINDOW_DAYS = 5;

type Actor = { id: string };

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
  documentId: string | null,
  action: string,
  actor: Actor | null,
  change: { from?: FiscalDocumentStatus | null; to?: FiscalDocumentStatus | null } = {},
  details?: Record<string, unknown>,
) {
  await tx.fiscalAuditEvent.create({
    data: {
      documentId,
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

function toIssuerDto(
  issuer: Prisma.FiscalIssuerGetPayload<{ include: typeof issuerInclude }>,
): FiscalIssuerDto {
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
    pointsOfSale: issuer.pointsOfSale.map((pos) => ({
      id: pos.id,
      number: pos.number,
      enabledVoucherTypes: pos.enabledVoucherTypes,
      active: pos.active,
    })),
  };
}

/** One issuer for the store: the oldest row. */
async function findIssuer() {
  return prisma.fiscalIssuer.findFirst({ orderBy: { createdAt: "asc" }, include: issuerInclude });
}

function blockersFor(issuer: Awaited<ReturnType<typeof findIssuer>>): string[] {
  const blockers: string[] = [];
  if (!isInvoicingEnabled()) blockers.push("La facturación electrónica está desactivada.");
  if (!issuer) {
    blockers.push("Falta cargar los datos del emisor.");
    return blockers;
  }
  if (issuer.taxConditionCode === null) {
    blockers.push("La condición fiscal del emisor no está confirmada (la confirma el contador).");
  }
  const usable = issuer.pointsOfSale.filter((pos) => pos.active && pos.enabledVoucherTypes.length);
  if (usable.length === 0) {
    blockers.push("No hay un punto de venta activo con tipos de comprobante habilitados.");
  }
  return blockers;
}

export async function getStatus(): Promise<InvoicingStatusDto> {
  const issuer = await findIssuer();
  return {
    enabled: isInvoicingEnabled(),
    environment: env.ARCA_MODE === "off" ? null : env.ARCA_MODE,
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
  };
  const issuer = await prisma.$transaction(async (tx) => {
    if (!existing) {
      const created = await tx.fiscalIssuer.create({ data, include: issuerInclude });
      await audit(tx, null, "ISSUER_CREATED", actor);
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
    await audit(tx, null, "ISSUER_UPDATED", actor, {}, { cuitChanged });
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
        taxConditionConfirmedBy: actor.id,
      },
      include: issuerInclude,
    });
    await audit(
      tx,
      null,
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
    await tx.fiscalPointOfSale.upsert({
      where: { issuerId_number: { issuerId: issuer.id, number: body.number } },
      create: {
        issuerId: issuer.id,
        number: body.number,
        enabledVoucherTypes,
        active: body.active,
      },
      update: { enabledVoucherTypes, active: body.active },
    });
    await audit(
      tx,
      null,
      "POINT_OF_SALE_SAVED",
      actor,
      {},
      {
        number: body.number,
        enabledVoucherTypes,
        active: body.active,
      },
    );
  });
  return toIssuerDto((await findIssuer())!);
}

// ─── Vouchers ───────────────────────────────────────────────────────────

const documentInclude = {
  sale: { include: { items: { orderBy: { position: "asc" } }, issuer: true } },
  pointOfSale: true,
  events: { orderBy: { createdAt: "asc" } },
} as const;
type DocumentWithAll = Prisma.FiscalDocumentGetPayload<{ include: typeof documentInclude }>;

function toSummaryDto(document: DocumentWithAll): FiscalDocumentSummaryDto {
  return {
    id: document.id,
    status: document.status,
    environment: document.environment as FiscalDocumentSummaryDto["environment"],
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
      netAmount: item.netAmount.toNumber(),
      vatAmount: item.vatAmount.toNumber(),
      variantSku: item.variantSku,
    })),
    arcaErrors: asMessages(document.arcaErrors),
    arcaObservations: asMessages(document.arcaObservations),
    events: document.events.map((event) => ({
      action: event.action,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      createdAt: event.createdAt.toISOString(),
      details: event.details,
    })),
  };
}

async function loadDocument(id: string): Promise<DocumentWithAll> {
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

function payloadHash(body: CreateInvoiceBody): string {
  return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

function todayInArgentina(): string {
  // ARCA dates are Argentine calendar days (UTC−3, no daylight saving).
  return new Date(Date.now() - 3 * 60 * 60_000).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** Checks that need the issuer and point of sale; shared by create and emit. */
function assertCanIssue(
  issuer: NonNullable<Awaited<ReturnType<typeof findIssuer>>> | null,
  pointOfSaleId: string,
  voucherType: number,
) {
  const blockers = blockersFor(issuer);
  if (blockers.length > 0) throw new ApiError(409, "INVOICING_NOT_READY", blockers.join(" "));
  const pointOfSale = issuer!.pointsOfSale.find((pos) => pos.id === pointOfSaleId);
  if (!pointOfSale || !pointOfSale.active) {
    throw ApiError.validation("El punto de venta no existe o no está activo.");
  }
  if (!pointOfSale.enabledVoucherTypes.includes(voucherType)) {
    throw ApiError.validation(
      "Ese tipo de comprobante no está habilitado para este punto de venta (lo confirma el contador).",
    );
  }
  return pointOfSale;
}

export async function createInvoice(
  body: CreateInvoiceBody,
  idempotencyKey: string,
  actor: Actor,
): Promise<{ created: boolean; invoice: FiscalDocumentDetailDto }> {
  const hash = payloadHash(body);
  const previous = await prisma.fiscalDocument.findUnique({
    where: { idempotencyKey },
    include: documentInclude,
  });
  if (previous) {
    const created = previous.events.find((event) => event.action === "CREATED");
    if ((created?.details as { payloadHash?: string } | null)?.payloadHash !== hash) {
      throw ApiError.conflict("Esa clave de idempotencia ya se usó con otros datos.");
    }
    return { created: false, invoice: toDetailDto(previous) };
  }

  const issuer = await findIssuer();
  getInvoicingProvider(); // refuses when the module is off or unconfigured
  assertCanIssue(issuer, body.pointOfSaleId, body.voucherType);
  const voucher = voucherTypeInfo(body.voucherType)!;

  const condition = receptorCondition(body.receptor.ivaConditionCode)!;
  if (!(condition.classes as readonly string[]).includes(voucher.class)) {
    throw ApiError.validation(
      `Un receptor «${condition.name}» no puede recibir un comprobante clase ${voucher.class} (anexo de condición frente al IVA, manual WSFEv1 v4.8).`,
    );
  }
  const { docType, docNumber } = body.receptor;
  if (docType === UNIDENTIFIED_DOC_TYPE && docNumber !== "0") {
    throw ApiError.validation("Un receptor sin identificar va con número de documento 0.");
  }
  if (docType !== UNIDENTIFIED_DOC_TYPE && /^0+$/.test(docNumber)) {
    throw ApiError.validation("Falta el número de documento del receptor.");
  }
  if ((docType === 80 || docType === 86) && docNumber.length !== 11) {
    throw ApiError.validation("El CUIT o CUIL tiene 11 dígitos.");
  }
  const offset = daysBetween(body.issueDate, todayInArgentina());
  if (Math.abs(offset) > ISSUE_DATE_WINDOW_DAYS) {
    throw ApiError.validation(
      "La fecha del comprobante puede ser hasta 5 días antes o después de hoy.",
    );
  }

  let amounts;
  try {
    amounts = computeVoucherAmounts(voucher.class, body.items);
  } catch (error) {
    if (error instanceof AmountError) throw ApiError.validation(error.message);
    throw error;
  }
  if (docType === UNIDENTIFIED_DOC_TYPE) {
    const threshold = issuer!.finalConsumerIdThreshold;
    if (threshold === null) {
      throw ApiError.validation(
        "Falta configurar desde qué monto hay que identificar al consumidor final; mientras tanto, identificá al receptor.",
      );
    }
    if (amounts.totalAmount.gte(threshold)) {
      throw ApiError.validation("Por el monto, hay que identificar al receptor con su documento.");
    }
  }

  // Variants are read only to copy their SKU; stock is never touched.
  const variantIds = body.items.map((item) => item.variantId).filter((id): id is string => !!id);
  const variants = variantIds.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, sku: true },
      })
    : [];
  const skuById = new Map(variants.map((variant) => [variant.id, variant.sku]));
  if (skuById.size !== new Set(variantIds).size) {
    throw ApiError.validation("Uno de los productos vinculados no existe.");
  }

  try {
    const documentId = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          issuerId: issuer!.id,
          saleDate: new Date(`${body.issueDate}T00:00:00Z`),
          receptorDocType: docType,
          receptorDocNumber: docNumber,
          receptorName: body.receptor.name ?? null,
          receptorIvaConditionCode: body.receptor.ivaConditionCode,
          receptorAddress: body.receptor.address ?? null,
          currency: CURRENCY_PESOS,
          untaxedAmount: amounts.untaxedAmount,
          exemptAmount: amounts.exemptAmount,
          netAmount: amounts.netAmount,
          vatAmount: amounts.vatAmount,
          otherTaxAmount: amounts.otherTaxAmount,
          totalAmount: amounts.totalAmount,
          createdById: actor.id,
          items: {
            create: body.items.map((item, index) => ({
              position: index + 1,
              description: item.description,
              quantity: new Prisma.Decimal(item.quantity),
              unitPrice: new Prisma.Decimal(item.unitPrice),
              vatRateCode: item.vatRateCode,
              netAmount: amounts.items[index]!.netAmount,
              vatAmount: amounts.items[index]!.vatAmount,
              variantId: item.variantId ?? null,
              variantSku: item.variantId ? (skuById.get(item.variantId) ?? null) : null,
            })),
          },
        },
      });
      const document = await tx.fiscalDocument.create({
        data: {
          saleId: sale.id,
          pointOfSaleId: body.pointOfSaleId,
          voucherType: body.voucherType,
          environment: getInvoicingProvider().environment,
          conceptCode: CONCEPT_PRODUCTS,
          idempotencyKey,
        },
      });
      await audit(tx, document.id, "CREATED", actor, { to: "DRAFT" }, { payloadHash: hash });
      return document.id;
    });
    return { created: true, invoice: await getInvoice(documentId) };
  } catch (error) {
    // Two identical requests at once: the loser returns the winner's voucher.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return createInvoice(body, idempotencyKey, actor);
    }
    throw error;
  }
}

function voucherKey(document: DocumentWithAll): VoucherKey {
  return {
    issuerCuit: document.sale.issuer.cuit,
    pointOfSale: document.pointOfSale.number,
    voucherType: document.voucherType,
  };
}

function buildRequest(document: DocumentWithAll, number: number): VoucherRequest {
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
    issueDate: arcaDate(isoDate(sale.saleDate)!),
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

/** Sends a DRAFT (or a REJECTED one, after fixing what ARCA objected to)
 * voucher to ARCA. Idempotent for an AUTHORIZED voucher. */
export async function emitInvoice(id: string, actor: Actor): Promise<FiscalDocumentDetailDto> {
  let document = await loadDocument(id);
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
  assertCanIssue(await findIssuer(), document.pointOfSaleId, document.voucherType);

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
    await audit(tx, document.id, "SEND_STARTED", actor, { from: fromStatus, to: "SENDING" });
    return true;
  });
  if (!claimed) {
    throw ApiError.conflict(
      "Hay otra emisión en curso para este punto de venta y tipo de comprobante. Esperá a que termine.",
    );
  }

  const backOff = async (error: InvoicingProviderError) => {
    await prisma.$transaction(async (tx) => {
      await tx.fiscalDocument.update({
        where: { id: document.id },
        data: { status: fromStatus, number: null },
      });
      await releaseSequence(tx, document.id);
      await audit(
        tx,
        document.id,
        "SEND_NOT_STARTED",
        actor,
        { from: "SENDING", to: fromStatus },
        {
          reason: error.message,
          errors: error.errors,
        },
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
  const request = buildRequest(document, number);
  // Saved before sending: if the answer is lost, this is what we look up.
  try {
    await prisma.fiscalDocument.update({
      where: { id: document.id },
      data: { number, requestSnapshot: request as unknown as Prisma.InputJsonValue },
    });
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
      await tx.fiscalDocument.update({ where: { id: document.id }, data: { status: "UNCERTAIN" } });
      // The sequence stays locked: the next number depends on this one.
      await audit(
        tx,
        document.id,
        "SEND_UNCERTAIN",
        actor,
        { from: "SENDING", to: "UNCERTAIN" },
        {
          number,
          reason: error.message,
        },
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
      document.id,
      result.outcome === "AUTHORIZED" ? "AUTHORIZED" : "REJECTED",
      actor,
      {
        from: "SENDING",
        to: result.outcome,
      },
      {
        number,
        errors: result.outcome === "REJECTED" ? result.errors : [],
        observations: result.observations,
      },
    );
  });
  document = await loadDocument(id);
  return toDetailDto(document);
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
      await audit(tx, id, "VERIFIED", actor, { from: document.status, to }, details);
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
