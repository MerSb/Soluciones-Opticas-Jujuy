import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InvalidWebhookSignatureError, WebhookSignatureValidator } from "mercadopago";

// Deterministic vectors for the webhook signature (ADR-0027): the official
// algorithm as implemented by the pinned SDK validator we call —
// HMAC-SHA256(secret, "id:<data.id>;request-id:<x-request-id>;ts:<ts>;").
// Values mirror Mercado Pago's documented example; the secret is a test
// placeholder. If the SDK ever changes its manifest, these fail loudly.

const SECRET = "test-webhook-secret-not-real";
const DATA_ID = "ORD01JYH1Z1YJN4HZ8J3Q0RB3YP6D";
const REQUEST_ID = "2066ca19-c6f1-498a-be75-1923005edd06";
const TS = "1742505638683";
const EXPECTED_V1 = "0f9e0d8504c3f1af042b7961366360e3c32958e6ebecceb4ca996c254ee155ac";
const LOWERCASED_V1 = "b12be707ef93be9fc0198b6338ef03174dbeeb5930e8dfe7e2bd82445b3e74e9";

const validate = (
  overrides: Partial<Parameters<typeof WebhookSignatureValidator.validate>[0]> = {},
) =>
  WebhookSignatureValidator.validate({
    xSignature: `ts=${TS},v1=${EXPECTED_V1}`,
    xRequestId: REQUEST_ID,
    dataId: DATA_ID,
    secret: SECRET,
    ...overrides,
  });

function reasonOf(fn: () => void): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidWebhookSignatureError);
    return (error as InvalidWebhookSignatureError).reason;
  }
  throw new Error("expected the signature to be rejected");
}

describe("Mercado Pago webhook signature (official algorithm)", () => {
  it("the fixed vector matches the documented manifest", () => {
    const manifest = `id:${DATA_ID};request-id:${REQUEST_ID};ts:${TS};`;
    expect(createHmac("sha256", SECRET).update(manifest).digest("hex")).toBe(EXPECTED_V1);
    expect(() => validate()).not.toThrow();
  });

  it("uses data.id exactly as sent — no lowercasing (current docs + SDK)", () => {
    expect(reasonOf(() => validate({ xSignature: `ts=${TS},v1=${LOWERCASED_V1}` }))).toBe(
      "SignatureMismatch",
    );
    expect(reasonOf(() => validate({ dataId: DATA_ID.toLowerCase() }))).toBe("SignatureMismatch");
  });

  it.each([
    ["missing header", { xSignature: undefined }, "MissingSignatureHeader"],
    ["garbage header", { xSignature: "nonsense" }, "MalformedSignatureHeader"],
    ["no ts", { xSignature: `v1=${EXPECTED_V1}` }, "MissingTimestamp"],
    ["no v1", { xSignature: `ts=${TS}` }, "MissingHash"],
    ["wrong secret", { secret: "another-secret" }, "SignatureMismatch"],
    ["other request id", { xRequestId: "other" }, "SignatureMismatch"],
    ["other data.id", { dataId: "ORD0000" }, "SignatureMismatch"],
    ["other ts", { xSignature: `ts=1742505638684,v1=${EXPECTED_V1}` }, "SignatureMismatch"],
  ])("rejects %s", (_label, overrides, reason) => {
    expect(reasonOf(() => validate(overrides))).toBe(reason);
  });
});
