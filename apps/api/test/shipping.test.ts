import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { ShippingProviderError, type ShippingProvider } from "../src/lib/shipping-provider.js";
import { quoteShipping } from "../src/services/shipping-quote.service.js";
import { getShippingProvider } from "../src/services/shipping-provider.service.js";
import { createAdminAgent } from "./admin/helpers.js";

// Shipping V1 — Phase A (ADR-0024). The provider seam keeps its real
// behavior (never configured) unless a test swaps in a fake for exactly
// one call — no network, no credentials.
vi.mock("../src/services/shipping-provider.service.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/services/shipping-provider.service.js")>();
  return { ...actual, getShippingProvider: vi.fn(actual.getShippingProvider) };
});

// Everything shipping depends on is global state (the origin branch's
// postal code, the single default package profile), so every test that
// touches it lives in this one file — Vitest runs a file's tests
// sequentially — and the original state is restored in afterAll. Values
// are format-valid test data, never the store's real postal code.
const app = createApp();
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PREFIX = `Test Shipping ${RUN_ID}`;
const TEST_ORIGIN_CP = "9999";
const TEST_DESTINATION_CP = "9998";
const adminEmail = `admin-shipping-${RUN_ID}@example.com`;
const customerEmail = `customer-shipping-${RUN_ID}@example.com`;
const rateLimitEmail = `admin-shipping-rl-${RUN_ID}@example.com`;

let adminAgent: ReturnType<typeof request.agent>;
let customerAgent: ReturnType<typeof request.agent>;
let originBranchId: string;
let createdBranch = false;
let originalOriginPostalCode: string | null = null;
let originalDefaultProfileIds: string[] = [];
const quoteLogIds: string[] = [];

async function setOriginPostalCode(postalCode: string | null) {
  await prisma.branch.update({ where: { id: originBranchId }, data: { postalCode } });
}

async function clearDefaultProfiles() {
  await prisma.shippingPackageProfile.updateMany({
    where: { isDefault: true },
    data: { isDefault: false },
  });
}

async function createProfile(overrides: Record<string, unknown> = {}) {
  const response = await adminAgent.post("/api/admin/shipping/package-profiles").send({
    name: `${PREFIX} Perfil`,
    weightGrams: 400,
    lengthCm: 20,
    widthCm: 10,
    heightCm: 8,
    ...overrides,
  });
  return response;
}

function simulate(body: Record<string, unknown>, agent = adminAgent) {
  return agent.post("/api/admin/shipping/simulations").send(body);
}

function fakeProvider(quote: ShippingProvider["quote"]): ShippingProvider {
  return { code: "FAKE", isConfigured: () => true, quote };
}

beforeAll(async () => {
  adminAgent = await createAdminAgent(app, adminEmail);
  customerAgent = request.agent(app);
  await customerAgent
    .post("/api/auth/register")
    .send({ firstName: "Cust", lastName: "Test", email: customerEmail, password: "password123" });

  // Same rule as the service's resolveOrigin (createdAt, then id).
  const origin = await prisma.branch.findFirst({
    where: { deletedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (origin) {
    originBranchId = origin.id;
    originalOriginPostalCode = origin.postalCode;
  } else {
    const branch = await prisma.branch.create({
      data: { name: `${PREFIX} Branch`, address: "Dirección de prueba" },
    });
    originBranchId = branch.id;
    createdBranch = true;
  }

  const defaults = await prisma.shippingPackageProfile.findMany({ where: { isDefault: true } });
  originalDefaultProfileIds = defaults.map((profile) => profile.id);
  await clearDefaultProfiles();
});

afterAll(async () => {
  await prisma.shippingQuoteLog.deleteMany({ where: { id: { in: quoteLogIds } } });
  await prisma.shippingPackageProfile.deleteMany({ where: { name: { startsWith: PREFIX } } });
  if (originalDefaultProfileIds.length > 0) {
    await prisma.shippingPackageProfile.updateMany({
      where: { id: { in: originalDefaultProfileIds } },
      data: { isDefault: true },
    });
  }
  if (createdBranch) {
    await prisma.branch.delete({ where: { id: originBranchId } });
  } else {
    await setOriginPostalCode(originalOriginPostalCode);
  }
  await prisma.user.deleteMany({
    where: { email: { in: [adminEmail, customerEmail, rateLimitEmail] } },
  });
});

describe("admin shipping — access", () => {
  it("requires authentication", async () => {
    expect((await request(app).get("/api/admin/shipping/package-profiles")).status).toBe(401);
    const simulation = await request(app)
      .post("/api/admin/shipping/simulations")
      .send({ destinationPostalCode: TEST_DESTINATION_CP, destinationProvinceCode: "Y" });
    expect(simulation.status).toBe(401);
  });

  it("requires the ADMIN role — a customer is forbidden", async () => {
    expect((await customerAgent.get("/api/admin/shipping/package-profiles")).status).toBe(403);
    const simulation = await simulate(
      { destinationPostalCode: TEST_DESTINATION_CP, destinationProvinceCode: "Y" },
      customerAgent,
    );
    expect(simulation.status).toBe(403);
  });
});

describe("admin shipping — package profiles", () => {
  beforeEach(clearDefaultProfiles);

  it("creates a profile (not default unless asked) and lists it", async () => {
    const response = await createProfile({ name: `${PREFIX} Basico` });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: `${PREFIX} Basico`,
      weightGrams: 400,
      lengthCm: 20,
      widthCm: 10,
      heightCm: 8,
      isDefault: false,
      deletedAt: null,
    });
    const list = await adminAgent.get("/api/admin/shipping/package-profiles");
    expect(list.body.some((p: { id: string }) => p.id === response.body.id)).toBe(true);
  });

  it("rejects zero, negative or fractional measures", async () => {
    const zero = await createProfile({ weightGrams: 0 });
    expect(zero.status).toBe(400);
    expect(zero.body.error.message).toBe("El peso debe ser mayor que 0.");
    expect((await createProfile({ lengthCm: -1 })).status).toBe(400);
    expect((await createProfile({ widthCm: 1.5 })).status).toBe(400);
    expect((await createProfile({ heightCm: 0 })).status).toBe(400);
  });

  it("the database itself refuses a non-positive measure (CHECK constraint)", async () => {
    await expect(
      prisma.shippingPackageProfile.create({
        data: { name: `${PREFIX} Invalid`, weightGrams: 0, lengthCm: 1, widthCm: 1, heightCm: 1 },
      }),
    ).rejects.toThrow();
  });

  it("keeps at most one active default profile", async () => {
    const first = await createProfile({ name: `${PREFIX} Default A`, isDefault: true });
    expect(first.body.isDefault).toBe(true);
    const second = await createProfile({ name: `${PREFIX} Default B`, isDefault: true });
    expect(second.body.isDefault).toBe(true);

    const defaults = await prisma.shippingPackageProfile.findMany({
      where: { isDefault: true, deletedAt: null },
    });
    expect(defaults.map((p) => p.id)).toEqual([second.body.id]);

    const switched = await adminAgent
      .post(`/api/admin/shipping/package-profiles/${first.body.id}/default`)
      .send({});
    expect(switched.status).toBe(200);
    expect(switched.body.isDefault).toBe(true);
    const after = await prisma.shippingPackageProfile.findMany({
      where: { isDefault: true, deletedAt: null },
    });
    expect(after.map((p) => p.id)).toEqual([first.body.id]);
  });

  it("updates name and measures but never the default flag through PATCH", async () => {
    const created = await createProfile({ name: `${PREFIX} Editable` });
    const updated = await adminAgent
      .patch(`/api/admin/shipping/package-profiles/${created.body.id}`)
      .send({ name: `${PREFIX} Editado`, weightGrams: 350, isDefault: true });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      name: `${PREFIX} Editado`,
      weightGrams: 350,
      isDefault: false,
    });
  });

  it("soft-deleting the default leaves no default; a deleted profile can't be made default; restore keeps it non-default", async () => {
    const created = await createProfile({ name: `${PREFIX} Borrable`, isDefault: true });
    const path = `/api/admin/shipping/package-profiles/${created.body.id}`;

    const deleted = await adminAgent.delete(path);
    expect(deleted.status).toBe(200);
    expect(deleted.body.deletedAt).not.toBeNull();
    expect(deleted.body.isDefault).toBe(false);
    expect(
      await prisma.shippingPackageProfile.count({ where: { isDefault: true, deletedAt: null } }),
    ).toBe(0);

    const makeDefault = await adminAgent.post(`${path}/default`).send({});
    expect(makeDefault.status).toBe(409);

    const restored = await adminAgent.post(`${path}/restore`).send({});
    expect(restored.body.deletedAt).toBeNull();
    expect(restored.body.isDefault).toBe(false);
  });

  it("404s for an unknown profile", async () => {
    const response = await adminAgent
      .patch("/api/admin/shipping/package-profiles/00000000-0000-4000-8000-000000000000")
      .send({ name: "x" });
    expect(response.status).toBe(404);
  });
});

describe("admin shipping simulator — no provider configured (Phase A)", () => {
  beforeEach(clearDefaultProfiles);

  it("with no origin postal code and no default profile: NOT_CONFIGURED, nothing invented, nothing logged", async () => {
    await setOriginPostalCode(null);
    const before = await prisma.shippingQuoteLog.count({
      where: { destinationPostalCode: TEST_DESTINATION_CP },
    });

    const response = await simulate({
      destinationPostalCode: TEST_DESTINATION_CP,
      destinationProvinceCode: "Y",
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "NOT_CONFIGURED",
      missingConfiguration: ["ORIGIN_POSTAL_CODE", "PACKAGE_PROFILE", "PROVIDER"],
      policyCode: "FREE_NATIONAL_V1",
      customerShippingPrice: 0,
      providerShippingCost: null,
      absorbedShippingCost: null,
      package: null,
      quoteLogId: null,
    });
    expect(response.body.origin.postalCode).toBeNull();

    const after = await prisma.shippingQuoteLog.count({
      where: { destinationPostalCode: TEST_DESTINATION_CP },
    });
    expect(after).toBe(before);
  });

  it("a branch without a postal code is handled safely even with a default profile", async () => {
    await setOriginPostalCode(null);
    await createProfile({ name: `${PREFIX} Sim Default`, isDefault: true });

    const response = await simulate({
      destinationPostalCode: TEST_DESTINATION_CP,
      destinationProvinceCode: "B",
    });
    expect(response.status).toBe(200);
    expect(response.body.missingConfiguration).toEqual(["ORIGIN_POSTAL_CODE", "PROVIDER"]);
    expect(response.body.providerShippingCost).toBeNull();
    expect(response.body.quoteLogId).toBeNull();
  });

  it("an origin postal code that isn't a valid Argentine code is treated as missing", async () => {
    await setOriginPostalCode("abc");
    await createProfile({ name: `${PREFIX} Sim Default 2`, isDefault: true });
    const response = await simulate({
      destinationPostalCode: TEST_DESTINATION_CP,
      destinationProvinceCode: "B",
    });
    expect(response.body.missingConfiguration).toEqual(["ORIGIN_POSTAL_CODE", "PROVIDER"]);
    expect(response.body.origin.postalCode).toBeNull();
  });

  it("with origin and default profile: logs a NOT_CONFIGURED attempt with the package snapshot and policy code", async () => {
    await setOriginPostalCode(` ${TEST_ORIGIN_CP} `);
    const profile = await createProfile({
      name: `${PREFIX} Snapshot`,
      isDefault: true,
      weightGrams: 480,
      lengthCm: 22,
      widthCm: 11,
      heightCm: 9,
    });

    const response = await simulate({
      destinationPostalCode: " y4600abc ",
      destinationProvinceCode: "Y",
      providerShippingCost: 0,
      customerShippingPrice: 999,
      total: 1,
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "NOT_CONFIGURED",
      missingConfiguration: ["PROVIDER"],
      provider: null,
      customerShippingPrice: 0,
      providerShippingCost: null,
      absorbedShippingCost: null,
      destination: { postalCode: "Y4600ABC", provinceCode: "Y" },
      origin: { postalCode: TEST_ORIGIN_CP },
      package: { profileName: `${PREFIX} Snapshot`, weightGrams: 480 },
    });
    expect(response.body.quoteLogId).toEqual(expect.any(String));
    quoteLogIds.push(response.body.quoteLogId);

    const log = await prisma.shippingQuoteLog.findUniqueOrThrow({
      where: { id: response.body.quoteLogId },
    });
    expect(log).toMatchObject({
      source: "ADMIN_SIMULATOR",
      status: "NOT_CONFIGURED",
      provider: "NONE",
      originPostalCode: TEST_ORIGIN_CP,
      destinationPostalCode: "Y4600ABC",
      destinationProvinceCode: "Y",
      weightGrams: profile.body.weightGrams,
      lengthCm: 22,
      widthCm: 11,
      heightCm: 9,
      providerCost: null,
      policyCode: "FREE_NATIONAL_V1",
      currency: "ARS",
    });
  });

  it("validates the destination before doing anything", async () => {
    const badProvince = await simulate({
      destinationPostalCode: "4600",
      destinationProvinceCode: "O",
    });
    expect(badProvince.status).toBe(400);
    const badPostal = await simulate({ destinationPostalCode: "46", destinationProvinceCode: "Y" });
    expect(badPostal.status).toBe(400);
    expect(badPostal.body.error.message).toBe(
      "El código postal de destino no tiene un formato válido.",
    );
  });

  it("rate-limits the simulator per admin", async () => {
    await setOriginPostalCode(null);
    const limitedAgent = await createAdminAgent(app, rateLimitEmail);
    const body = { destinationPostalCode: TEST_DESTINATION_CP, destinationProvinceCode: "Y" };
    for (let i = 0; i < 30; i++) {
      expect((await simulate(body, limitedAgent)).status).toBe(200);
    }
    const limited = await simulate(body, limitedAgent);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    // Another admin is unaffected.
    expect((await simulate(body)).status).toBe(200);
  });
});

describe("quote service — provider outcomes (mocked seam, no network)", () => {
  let defaultProfileWeight: number;

  beforeAll(async () => {
    await clearDefaultProfiles();
    await setOriginPostalCode(TEST_ORIGIN_CP);
    const profile = await createProfile({ name: `${PREFIX} Provider Default`, isDefault: true });
    defaultProfileWeight = profile.body.weightGrams;
  });

  beforeEach(() => {
    vi.mocked(getShippingProvider).mockClear();
  });

  const delivery = {
    deliveryMethod: "DELIVERY" as const,
    source: "CHECKOUT" as const,
    destination: { postalCode: TEST_DESTINATION_CP, provinceCode: "X" as const },
  };

  async function logOf(id: string | null) {
    expect(id).toEqual(expect.any(String));
    quoteLogIds.push(id!);
    return prisma.shippingQuoteLog.findUniqueOrThrow({ where: { id: id! } });
  }

  it("QUOTED: stores the real carrier cost, the customer still pays 0, the business absorbs it", async () => {
    const validUntil = new Date("2030-01-01T00:00:00.000Z");
    vi.mocked(getShippingProvider).mockImplementationOnce(() =>
      fakeProvider(async (input) => {
        expect(input.package.weightGrams).toBe(defaultProfileWeight);
        expect(input.originPostalCode).toBe(TEST_ORIGIN_CP);
        return {
          service: "Servicio de prueba",
          cost: new Prisma.Decimal("12345.67"),
          currency: "ARS",
          estimatedDaysMin: 2,
          estimatedDaysMax: 5,
          validUntil,
          providerReference: "ref-test",
          // Anything beyond the contract must never be persisted.
          rawResponse: { authorization: "Bearer secret-token" },
        } as never;
      }),
    );

    const outcome = await quoteShipping(delivery);
    if (outcome.deliveryMethod !== "DELIVERY") throw new Error("expected DELIVERY");
    expect(outcome.status).toBe("QUOTED");
    expect(outcome.missingConfiguration).toEqual([]);
    expect(outcome.charges.providerShippingCost?.toString()).toBe("12345.67");
    expect(outcome.charges.customerShippingPrice.toString()).toBe("0");
    expect(outcome.charges.absorbedShippingCost?.toString()).toBe("12345.67");

    const log = await logOf(outcome.quoteLogId);
    expect(log).toMatchObject({
      source: "CHECKOUT",
      status: "QUOTED",
      provider: "FAKE",
      service: "Servicio de prueba",
      estimatedDaysMin: 2,
      estimatedDaysMax: 5,
      providerReference: "ref-test",
      policyCode: "FREE_NATIONAL_V1",
      weightGrams: defaultProfileWeight,
      errorCode: null,
    });
    expect(log.providerCost?.toString()).toBe("12345.67");
    expect(log.validUntil?.toISOString()).toBe(validUntil.toISOString());
    expect(log.latencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(log)).not.toMatch(/secret|Bearer/i);
  });

  it("the admin simulator shows the real carrier cost and the absorbed cost once a provider quotes", async () => {
    vi.mocked(getShippingProvider).mockImplementationOnce(() =>
      fakeProvider(async () => ({
        service: null,
        cost: new Prisma.Decimal("8000.50"),
        currency: "ARS",
      })),
    );
    const response = await simulate({
      destinationPostalCode: TEST_DESTINATION_CP,
      destinationProvinceCode: "X",
    });
    expect(response.body).toMatchObject({
      status: "QUOTED",
      provider: "FAKE",
      customerShippingPrice: 0,
      providerShippingCost: 8000.5,
      absorbedShippingCost: 8000.5,
    });
    quoteLogIds.push(response.body.quoteLogId);
  });

  it("TIMEOUT → FAILED with no cost", async () => {
    vi.mocked(getShippingProvider).mockImplementationOnce(() =>
      fakeProvider(() => new Promise(() => undefined)),
    );
    const outcome = await quoteShipping(delivery, { timeoutMs: 30 });
    if (outcome.deliveryMethod !== "DELIVERY") throw new Error("expected DELIVERY");
    expect(outcome.status).toBe("FAILED");
    expect(outcome.errorCode).toBe("TIMEOUT");
    expect(outcome.charges.providerShippingCost).toBeNull();
    expect(outcome.charges.customerShippingPrice.toString()).toBe("0");
    const log = await logOf(outcome.quoteLogId);
    expect(log).toMatchObject({ status: "FAILED", errorCode: "TIMEOUT", providerCost: null });
  });

  it("an unexpected provider error → FAILED/UNAVAILABLE, and its message is never stored", async () => {
    vi.mocked(getShippingProvider).mockImplementationOnce(() =>
      fakeProvider(async () => {
        throw new Error("upstream said: Authorization Bearer secret-token");
      }),
    );
    const outcome = await quoteShipping(delivery);
    if (outcome.deliveryMethod !== "DELIVERY") throw new Error("expected DELIVERY");
    expect(outcome.status).toBe("FAILED");
    expect(outcome.errorCode).toBe("UNAVAILABLE");
    const log = await logOf(outcome.quoteLogId);
    expect(JSON.stringify(log)).not.toMatch(/secret|Bearer/i);
  });

  it("a destination the carrier doesn't cover → NOT_COVERED", async () => {
    vi.mocked(getShippingProvider).mockImplementationOnce(() =>
      fakeProvider(async () => {
        throw new ShippingProviderError("NOT_COVERED", "not covered");
      }),
    );
    const outcome = await quoteShipping(delivery);
    if (outcome.deliveryMethod !== "DELIVERY") throw new Error("expected DELIVERY");
    expect(outcome.status).toBe("NOT_COVERED");
    expect(outcome.charges.absorbedShippingCost).toBeNull();
    const log = await logOf(outcome.quoteLogId);
    expect(log).toMatchObject({ status: "NOT_COVERED", errorCode: "NOT_COVERED" });
  });

  it("a negative cost from the provider is rejected as INVALID_RESPONSE, never stored", async () => {
    vi.mocked(getShippingProvider).mockImplementationOnce(() =>
      fakeProvider(async () => ({
        service: null,
        cost: new Prisma.Decimal("-1"),
        currency: "ARS",
      })),
    );
    const outcome = await quoteShipping(delivery);
    if (outcome.deliveryMethod !== "DELIVERY") throw new Error("expected DELIVERY");
    expect(outcome.status).toBe("FAILED");
    expect(outcome.errorCode).toBe("INVALID_RESPONSE");
    const log = await logOf(outcome.quoteLogId);
    expect(log.providerCost).toBeNull();
  });

  it("PICKUP is 0/0/0 without touching the provider or the log", async () => {
    const before = await prisma.shippingQuoteLog.count();
    const outcome = await quoteShipping({ deliveryMethod: "PICKUP" });
    expect(outcome.charges.providerShippingCost?.toString()).toBe("0");
    expect(outcome.charges.customerShippingPrice.toString()).toBe("0");
    expect(outcome.charges.absorbedShippingCost?.toString()).toBe("0");
    expect(vi.mocked(getShippingProvider)).not.toHaveBeenCalled();
    // Only this file writes shipping logs, so the global count is stable here.
    expect(await prisma.shippingQuoteLog.count()).toBe(before);
  });

  it("rejects an invalid destination at the service level too", async () => {
    await expect(
      quoteShipping({ ...delivery, destination: { postalCode: "12", provinceCode: "X" } }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

// B2: the origin must not depend on PostgreSQL's physical row order when
// branches tie on createdAt (local seed data has two such branches).
describe("shipping origin — deterministic branch selection", () => {
  it("with branches sharing the earliest createdAt, always picks the lowest id", async () => {
    // No default package → the attempt stops before the provider: nothing is logged.
    await clearDefaultProfiles();
    const [lowId, highId] = [randomUUID(), randomUUID()].sort() as [string, string];
    const createdAt = new Date("2000-01-01T00:00:00.000Z");
    try {
      // The higher id is inserted first, so insertion order disagrees with the rule.
      await prisma.branch.create({
        data: {
          id: highId,
          name: `${PREFIX} Origin High`,
          address: "Dirección de prueba",
          postalCode: "9002",
          createdAt,
        },
      });
      await prisma.branch.create({
        data: {
          id: lowId,
          name: `${PREFIX} Origin Low`,
          address: "Dirección de prueba",
          postalCode: "9001",
          createdAt,
        },
      });

      for (let attempt = 0; attempt < 5; attempt++) {
        // Rewriting a row moves its tuple, reshuffling physical order.
        await prisma.branch.update({
          where: { id: attempt % 2 === 0 ? lowId : highId },
          data: { address: `Dirección de prueba ${attempt}` },
        });
        const outcome = await quoteShipping({
          deliveryMethod: "DELIVERY",
          source: "ADMIN_SIMULATOR",
          destination: { postalCode: TEST_DESTINATION_CP, provinceCode: "Y" },
        });
        if (outcome.deliveryMethod !== "DELIVERY") throw new Error("expected DELIVERY");
        expect(outcome.origin).toEqual({ branchName: `${PREFIX} Origin Low`, postalCode: "9001" });
        expect(outcome.quoteLogId).toBeNull();
      }
    } finally {
      await prisma.branch.deleteMany({ where: { id: { in: [lowId, highId] } } });
    }
  });
});
