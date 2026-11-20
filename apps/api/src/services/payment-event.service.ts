import { Prisma } from "@prisma/client";
import { InvalidWebhookSignatureError, WebhookSignatureValidator } from "mercadopago";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/api-error.js";
import { env } from "../lib/env.js";
import { isPaymentsEnabled } from "../lib/payments-mode.js";
import { MERCADOPAGO_PROVIDER_CODE } from "../lib/mercadopago-payment-provider.js";
import { reconcileProviderOrder } from "./payment-reconciliation.service.js";

// Mercado Pago webhooks — Payments V1 Phase D2 (ADR-0027).
//
//   verify signature (official SDK validator) → only "order" notifications
//   → record PaymentEvent (UNIQUE(provider, providerEventId)) → claim it
//   (conditional update with a lease: exactly one worker processes)
//   → reconcile from getOrder() outside any transaction → close the event.
//
// Nothing before the signature check touches the database or the provider.
// The notification body is never trusted for state: only its id (dedupe)
// and, once signed, its data.id (which remote order to read).

export const WEBHOOK_EVENT_TYPE = "order";

/** A PROCESSING claim older than this is considered abandoned (a crashed
 * worker) and may be reclaimed. Comfortably above getOrder's 10 s timeout. */
export const EVENT_LEASE_MS = 2 * 60_000;

/** Remote order ids are opaque provider strings (e.g. ORD01J…). */
const DATA_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const EVENT_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,100}$/;

export type EventProcessingResult =
  "PROCESSED" | "FAILED_FINAL" | "FAILED_RETRYABLE" | "ALREADY_DONE" | "BUSY";

export interface WebhookRequest {
  headers: { xSignature: string | undefined; xRequestId: string | undefined };
  /** `data.id` from the query string — the signed value. */
  dataId: string | undefined;
  /** `type` from the query string, if present. */
  queryType: string | undefined;
  body: unknown;
}

export interface WebhookResult {
  httpStatus: 200 | 503;
  result: EventProcessingResult | "IGNORED";
}

function log(fields: Record<string, string | number | null | undefined>): void {
  // Ids and outcomes only — never the secret, signature, body or buyer data.
  console.info(`[payments:webhook] ${JSON.stringify(fields)}`);
}

// ---------------------------------------------------------------------------
// Event lifecycle

async function claim(eventId: string, now: Date): Promise<Date | null> {
  const { count } = await prisma.paymentEvent.updateMany({
    where: {
      id: eventId,
      signatureValid: true,
      OR: [
        { status: { in: ["RECEIVED", "FAILED_RETRYABLE"] } },
        {
          status: "PROCESSING",
          processingStartedAt: { lt: new Date(now.getTime() - EVENT_LEASE_MS) },
        },
      ],
    },
    data: { status: "PROCESSING", processingStartedAt: now, attempts: { increment: 1 } },
  });
  return count === 1 ? now : null;
}

async function finish(
  eventId: string,
  lease: Date,
  data: Prisma.PaymentEventUpdateManyMutationInput,
): Promise<void> {
  // Only the holder of this lease may close the event.
  await prisma.paymentEvent.updateMany({
    where: { id: eventId, status: "PROCESSING", processingStartedAt: lease },
    data,
  });
}

/** Processes (or retries) one stored, signature-verified event. Safe to
 * call any number of times and concurrently: only one caller holds the
 * claim; a finished event is never processed again. Exported for manual
 * reprocessing and a future scheduler — no HTTP route calls it directly. */
export async function reprocessPaymentEvent(
  eventId: string,
  now = new Date(),
): Promise<EventProcessingResult> {
  const lease = await claim(eventId, now);
  if (!lease) {
    const current = await prisma.paymentEvent.findUnique({
      where: { id: eventId },
      select: { status: true },
    });
    if (!current) throw new Error(`Payment event ${eventId} does not exist.`);
    return current.status === "PROCESSING" ? "BUSY" : "ALREADY_DONE";
  }

  const event = await prisma.paymentEvent.findUniqueOrThrow({
    where: { id: eventId },
    select: { providerOrderId: true, providerEventId: true, requestId: true },
  });
  const startedAt = Date.now();
  try {
    if (!event.providerOrderId) {
      await finish(eventId, lease, {
        status: "FAILED_FINAL",
        outcome: "MISSING_PROVIDER_ORDER_ID",
        processedAt: new Date(),
        processingStartedAt: null,
      });
      return "FAILED_FINAL";
    }
    const result = await reconcileProviderOrder(event.providerOrderId, now);
    if (!result.final) {
      await finish(eventId, lease, {
        status: "FAILED_RETRYABLE",
        lastErrorKind: result.errorKind,
        processingStartedAt: null,
      });
      log({
        eventId,
        providerOrderId: event.providerOrderId,
        result: "FAILED_RETRYABLE",
        kind: result.errorKind,
        durationMs: Date.now() - startedAt,
      });
      return "FAILED_RETRYABLE";
    }
    const failed = result.failed === true;
    await finish(eventId, lease, {
      status: failed ? "FAILED_FINAL" : "PROCESSED",
      outcome: result.outcome,
      providerPaymentId: result.providerPaymentId ?? undefined,
      processedAt: new Date(),
      processingStartedAt: null,
      lastErrorKind: null,
    });
    log({
      eventId,
      providerOrderId: event.providerOrderId,
      requestId: event.requestId,
      outcome: result.outcome,
      durationMs: Date.now() - startedAt,
    });
    return failed ? "FAILED_FINAL" : "PROCESSED";
  } catch (error) {
    // Database trouble mid-way: leave it retryable, report upstream.
    await finish(eventId, lease, {
      status: "FAILED_RETRYABLE",
      lastErrorKind: "INTERNAL",
      processingStartedAt: null,
    }).catch(() => undefined);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Webhook entry point

function readEventId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as { id?: unknown }).id;
  const value = typeof id === "number" && Number.isFinite(id) ? String(id) : id;
  return typeof value === "string" && EVENT_ID_PATTERN.test(value) ? value : null;
}

function readBodyField(body: unknown, path: "type" | "action" | "data.id"): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const value =
    path === "data.id" ? (record.data as Record<string, unknown> | undefined)?.id : record[path];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

/** POST /api/payments/mercadopago/webhook. Throws ApiError for requests
 * that must not be processed (401/400/503); returns the HTTP status for
 * everything that was authenticated. */
export async function handleMercadoPagoWebhook(request: WebhookRequest): Promise<WebhookResult> {
  const secret = env.MERCADOPAGO_WEBHOOK_SECRET;
  // PAYMENTS_MODE=off: payments are not turned on here, whatever secret is
  // set. Same answer as an unconfigured webhook — nothing stored, and
  // Mercado Pago retries.
  if (!secret || !isPaymentsEnabled()) {
    // Not an ack: Mercado Pago retries, so nothing is lost once configured.
    throw new ApiError(503, "WEBHOOK_NOT_CONFIGURED", "Webhook not configured.");
  }

  try {
    // Exactly the official algorithm (SDK): HMAC-SHA256 over
    // "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" (absent pairs
    // omitted), constant-time compare. data.id is used exactly as sent.
    WebhookSignatureValidator.validate({
      xSignature: request.headers.xSignature,
      xRequestId: request.headers.xRequestId,
      dataId: request.dataId,
      secret,
    });
  } catch (error) {
    const reason = error instanceof InvalidWebhookSignatureError ? error.reason : "Unknown";
    log({
      result: "INVALID_SIGNATURE",
      reason,
      requestId: request.headers.xRequestId?.slice(0, 64),
    });
    throw new ApiError(401, "WEBHOOK_SIGNATURE_INVALID", "Invalid signature.");
  }
  // Signed without an x-request-id is structurally valid for the SDK, but
  // every Mercado Pago notification carries one: refuse the odd request.
  if (!request.headers.xRequestId?.trim()) {
    throw new ApiError(400, "WEBHOOK_INVALID", "Invalid notification.");
  }

  const type = request.queryType ?? readBodyField(request.body, "type");
  if (type !== WEBHOOK_EVENT_TYPE) {
    // Signed but not ours (legacy payment/merchant_order topics…):
    // acknowledged so it is not retried, and nothing is touched.
    log({ result: "IGNORED", type: type?.slice(0, 40) ?? null });
    return { httpStatus: 200, result: "IGNORED" };
  }

  const dataId = request.dataId?.trim();
  const eventId = readEventId(request.body);
  const bodyDataId = readBodyField(request.body, "data.id");
  if (
    !dataId ||
    !DATA_ID_PATTERN.test(dataId) ||
    !eventId ||
    (bodyDataId !== null && bodyDataId !== dataId)
  ) {
    throw new ApiError(400, "WEBHOOK_INVALID", "Invalid notification.");
  }

  let stored: { id: string };
  try {
    stored = await prisma.paymentEvent.create({
      data: {
        provider: MERCADOPAGO_PROVIDER_CODE,
        providerEventId: eventId,
        topic: WEBHOOK_EVENT_TYPE,
        action: readBodyField(request.body, "action")?.slice(0, 60) ?? null,
        providerOrderId: dataId,
        requestId: request.headers.xRequestId.trim().slice(0, 64),
        signatureValid: true,
      },
      select: { id: true },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
      throw error;
    }
    // A redelivery (or a concurrent twin): the stored event decides.
    stored = await prisma.paymentEvent.findUniqueOrThrow({
      where: {
        provider_providerEventId: { provider: MERCADOPAGO_PROVIDER_CODE, providerEventId: eventId },
      },
      select: { id: true },
    });
  }

  const result = await reprocessPaymentEvent(stored.id);
  // Only a retryable failure asks Mercado Pago to deliver again; processed,
  // final failures (mismatch, unknown order…), duplicates and events a
  // concurrent delivery is handling are acknowledged.
  return { httpStatus: result === "FAILED_RETRYABLE" ? 503 : 200, result };
}
