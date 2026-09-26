import { afterEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { MercadoPagoPaymentProvider } from "../../src/lib/mercadopago-payment-provider.js";
import { PaymentProviderError, type CreateCheckoutInput } from "../../src/lib/payment-provider.js";

// Mercado Pago adapter (ADR-0026) against a stubbed global fetch — the
// official SDK uses it — so nothing here reaches the internet. The token
// is an obvious placeholder, never a real credential.

const FAKE_TOKEN = "TEST-not-a-real-token";

const INPUT: CreateCheckoutInput = {
  idempotencyKey: "7b1f2c1e-0000-4000-8000-000000000001",
  externalReference: "3f0c9a5e-0000-4000-8000-00000000000a",
  amount: new Prisma.Decimal("1500.50"),
  currency: "ARS",
  items: [
    {
      title: "Test Frame",
      description:
        "Negro · Cristales: Test HD · Graduación personalizada — A coordinar con la óptica",
      externalCode: "TEST-SKU-1",
      quantity: 1,
      unitPrice: new Prisma.Decimal("1500.50"),
      lineTotal: new Prisma.Decimal("1500.50"),
    },
  ],
  payer: { email: "buyer@example.test", firstName: "Test", lastName: "Buyer" },
  returnUrls: {
    success: "https://web.example.test/order/SOJ-000001/payment/success",
    pending: "https://web.example.test/order/SOJ-000001/payment/pending",
    failure: "https://web.example.test/order/SOJ-000001/payment/failure",
  },
  expiresInMinutes: 29,
};

const CREATED = {
  id: "ORDTST01TEST",
  type: "online",
  processing_mode: "manual",
  status: "created",
  status_detail: "created",
  total_amount: "1500.50",
  external_reference: INPUT.externalReference,
  checkout_url: "https://www.mercadopago.com.ar/checkout/v1/redirect?order_id=ORDTST01TEST",
  currency: "ARS",
};

function stubFetch(reply: (init: RequestInit) => Promise<Response> | Response) {
  const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => reply(init ?? {}));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
type HeadersArg = ConstructorParameters<typeof Headers>[0];
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function kindOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(PaymentProviderError);
  return (error as PaymentProviderError).kind;
}

afterEach(() => vi.unstubAllGlobals());

describe("MercadoPagoPaymentProvider", () => {
  it("is not configured without an access token and never calls out", async () => {
    const fetchMock = stubFetch(() => json(201, CREATED));
    const provider = new MercadoPagoPaymentProvider(undefined);
    expect(provider.isConfigured()).toBe(false);
    expect(await kindOf(provider.createCheckout(INPUT))).toBe("NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates a Checkout Pro order via POST /v1/orders with our idempotency key", async () => {
    const fetchMock = stubFetch(() => json(201, CREATED));
    const provider = new MercadoPagoPaymentProvider(FAKE_TOKEN);
    const checkout = await provider.createCheckout(INPUT);

    expect(checkout).toEqual({
      providerOrderId: "ORDTST01TEST",
      checkoutUrl: CREATED.checkout_url,
      providerStatus: "created",
      providerStatusDetail: "created",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.mercadopago.com/v1/orders");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers as HeadersArg);
    expect(headers.get("X-Idempotency-Key")).toBe(INPUT.idempotencyKey);
    expect(headers.get("Authorization")).toBe(`Bearer ${FAKE_TOKEN}`);

    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      type: "online",
      processing_mode: "manual",
      total_amount: "1500.50",
      external_reference: INPUT.externalReference,
      payer: { email: "buyer@example.test", first_name: "Test", last_name: "Buyer" },
      items: [
        {
          title: "Test Frame",
          description:
            "Negro · Cristales: Test HD · Graduación personalizada — A coordinar con la óptica",
          external_code: "TEST-SKU-1",
          quantity: 1,
          unit_price: "1500.50",
          unit_measure: "unit",
        },
      ],
      config: {
        online: {
          success_url: INPUT.returnUrls.success,
          pending_url: INPUT.returnUrls.pending,
          failure_url: INPUT.returnUrls.failure,
          auto_return: "approved",
        },
      },
      expiration_time: "PT29M",
    });
    // Never clinical data or fiscal identification in the payload.
    expect(JSON.stringify(body)).not.toMatch(
      /sphere|cylinder|axis|prescription|identification|phone/i,
    );
  });

  it("omits auto_return for a non-https (local) return URL", async () => {
    const fetchMock = stubFetch(() => json(201, CREATED));
    const local = "http://localhost:5173/order/SOJ-000001/payment";
    await new MercadoPagoPaymentProvider(FAKE_TOKEN).createCheckout({
      ...INPUT,
      returnUrls: {
        success: `${local}/success`,
        pending: `${local}/pending`,
        failure: `${local}/failure`,
      },
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.config.online).not.toHaveProperty("auto_return");
  });

  it.each([
    ["no id", { ...CREATED, id: undefined }],
    ["no checkout_url", { ...CREATED, checkout_url: undefined }],
    ["foreign checkout host", { ...CREATED, checkout_url: "https://evil.example/pay" }],
    ["http checkout url", { ...CREATED, checkout_url: "http://www.mercadopago.com.ar/x" }],
    ["different amount", { ...CREATED, total_amount: "1.00" }],
    ["different currency", { ...CREATED, currency: "BRL" }],
    ["different reference", { ...CREATED, external_reference: "someone-else" }],
  ])("rejects a malformed response (%s) as INVALID_RESPONSE", async (_label, body) => {
    stubFetch(() => json(201, body));
    expect(await kindOf(new MercadoPagoPaymentProvider(FAKE_TOKEN).createCheckout(INPUT))).toBe(
      "INVALID_RESPONSE",
    );
  });

  it.each([
    [400, "INVALID_INPUT"],
    [401, "AUTHENTICATION_ERROR"],
    [403, "AUTHENTICATION_ERROR"],
    [409, "IDEMPOTENCY_CONFLICT"],
    [422, "INVALID_INPUT"],
    [429, "UNAVAILABLE"],
    [500, "UNAVAILABLE"],
    [503, "UNAVAILABLE"],
  ])(
    "normalizes HTTP %i to %s without the provider's message, and never retries",
    async (status, kind) => {
      const fetchMock = stubFetch(() =>
        json(status, { message: "internal provider detail with PII", error: "x" }),
      );
      const error = (await new MercadoPagoPaymentProvider(FAKE_TOKEN).createCheckout(INPUT).then(
        () => null,
        (caught: unknown) => caught,
      )) as PaymentProviderError;
      expect(error).toBeInstanceOf(PaymentProviderError);
      expect(error.kind).toBe(kind);
      expect(error.message).not.toContain("internal provider detail");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("aborts a call that takes too long as TIMEOUT", async () => {
    stubFetch(
      (init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("This operation was aborted", "AbortError")),
          );
        }),
    );
    const provider = new MercadoPagoPaymentProvider(FAKE_TOKEN, 50);
    expect(await kindOf(provider.createCheckout(INPUT))).toBe("TIMEOUT");
  });

  it("maps a network failure to UNAVAILABLE", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));
    expect(await kindOf(new MercadoPagoPaymentProvider(FAKE_TOKEN).createCheckout(INPUT))).toBe(
      "UNAVAILABLE",
    );
  });

  it("reads a remote order with GET /v1/orders/:id", async () => {
    const fetchMock = stubFetch(() =>
      json(200, {
        ...CREATED,
        status: "processed",
        total_paid_amount: "1500.50",
        transactions: {
          payments: [
            {
              id: "PAY01",
              status: "processed",
              status_detail: "accredited",
              amount: "1500.50",
              paid_amount: "1500.50",
              payment_method: { id: "visa", type: "credit_card", token: "never-kept" },
            },
          ],
        },
      }),
    );
    const snapshot = await new MercadoPagoPaymentProvider(FAKE_TOKEN).getOrder("ORDTST01TEST");
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://api.mercadopago.com/v1/orders/ORDTST01TEST",
    );
    expect(snapshot.status).toBe("processed");
    expect(snapshot.totalPaidAmount?.toFixed(2)).toBe("1500.50");
    expect(snapshot.payments).toEqual([
      {
        id: "PAY01",
        status: "processed",
        statusDetail: "accredited",
        amount: new Prisma.Decimal("1500.50"),
        paidAmount: new Prisma.Decimal("1500.50"),
        methodType: "credit_card",
        methodId: "visa",
      },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("never-kept");

    stubFetch(() => json(404, { error: "order_not_found" }));
    expect(await kindOf(new MercadoPagoPaymentProvider(FAKE_TOKEN).getOrder("NOPE"))).toBe(
      "NOT_FOUND",
    );
  });

  it("never shares idempotency keys between calls", async () => {
    const fetchMock = stubFetch(() => json(201, CREATED));
    const provider = new MercadoPagoPaymentProvider(FAKE_TOKEN);
    await provider.createCheckout(INPUT);
    await provider.getOrder("ORDTST01TEST").catch(() => null);
    await provider.createCheckout({ ...INPUT, idempotencyKey: "second-key" });
    const keys = fetchMock.mock.calls.map(([, init]) =>
      new Headers(init?.headers as HeadersArg).get("X-Idempotency-Key"),
    );
    expect(keys[0]).toBe(INPUT.idempotencyKey);
    expect(keys[1]).not.toBe(INPUT.idempotencyKey);
    expect(keys[2]).toBe("second-key");
  });
});
