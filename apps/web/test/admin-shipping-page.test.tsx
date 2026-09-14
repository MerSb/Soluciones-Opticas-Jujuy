import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminShippingPage } from "../src/pages/admin/AdminShippingPage";
import { ALL_PROVINCES_LISTED, ARGENTINE_PROVINCES } from "../src/lib/argentina-provinces";
import { renderWithProviders } from "./test-utils";

// Shipping V1 — Phase A admin (ADR-0024). Measures and postal codes are
// fictional test values, not the store's real data.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const TIMESTAMPS = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };

const PROFILES = [
  {
    id: "p1",
    name: "Caja estándar",
    weightGrams: 400,
    lengthCm: 20,
    widthCm: 10,
    heightCm: 8,
    isDefault: true,
    deletedAt: null,
    ...TIMESTAMPS,
  },
  {
    id: "p2",
    name: "Caja grande",
    weightGrams: 900,
    lengthCm: 30,
    widthCm: 20,
    heightCm: 12,
    isDefault: false,
    deletedAt: null,
    ...TIMESTAMPS,
  },
];

function simulationResult(overrides: Record<string, unknown> = {}) {
  return {
    status: "NOT_CONFIGURED",
    missingConfiguration: ["ORIGIN_POSTAL_CODE", "PROVIDER"],
    policyCode: "FREE_NATIONAL_V1",
    customerShippingPrice: 0,
    providerShippingCost: null,
    absorbedShippingCost: null,
    provider: null,
    service: null,
    estimatedDaysMin: null,
    estimatedDaysMax: null,
    validUntil: null,
    errorCode: null,
    origin: { branchName: "Sucursal", postalCode: null },
    package: {
      profileName: "Caja estándar",
      weightGrams: 400,
      lengthCm: 20,
      widthCm: 10,
      heightCm: 8,
    },
    destination: { postalCode: "9998", provinceCode: "Y" },
    quoteLogId: null,
    ...overrides,
  };
}

type Handler = (body: unknown) => unknown;

function stubFetch(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";
    const handler = routes[`${method} ${path}`];
    if (!handler) throw new Error(`Unhandled request: ${method} ${path}`);
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    return { ok: true, status: 200, json: async () => handler(body) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function bodyOf(fetchMock: ReturnType<typeof stubFetch>, method: string, path: string) {
  const call = fetchMock.mock.calls.find(
    ([url, init]) => new URL(String(url)).pathname === path && init?.method === method,
  );
  return call ? JSON.parse(call[1]!.body as string) : undefined;
}

describe("Argentine provinces (web)", () => {
  it("lists the 24 jurisdictions once each", () => {
    expect(ARGENTINE_PROVINCES).toHaveLength(24);
    expect(new Set(ARGENTINE_PROVINCES.map((p) => p.code)).size).toBe(24);
    expect(ALL_PROVINCES_LISTED).toBe(true);
  });
});

describe("AdminShippingPage — package profiles", () => {
  it("marks the default profile and creates a new one with whole-number measures", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({
      "GET /api/admin/shipping/package-profiles": () => PROFILES,
      "POST /api/admin/shipping/package-profiles": (body) => ({
        ...PROFILES[1],
        ...(body as object),
        id: "p3",
      }),
    });
    renderWithProviders(<AdminShippingPage />);

    const defaultRow = (await screen.findByText("Caja estándar")).closest("tr")!;
    expect(within(defaultRow).getByText("Predeterminado")).toBeInTheDocument();
    const otherRow = screen.getByText("Caja grande").closest("tr")!;
    expect(within(otherRow).queryByText("Predeterminado")).not.toBeInTheDocument();

    const section = screen.getByRole("region", { name: "Perfiles de paquete" });
    await user.type(within(section).getByLabelText("Nombre"), "Caja nueva");
    await user.type(within(section).getByLabelText("Peso (g)"), "450");
    await user.type(within(section).getByLabelText("Largo (cm)"), "21");
    await user.type(within(section).getByLabelText("Ancho (cm)"), "11");
    await user.type(within(section).getByLabelText("Alto (cm)"), "9");
    await user.click(within(section).getByLabelText("Usar como predeterminado"));
    await user.click(within(section).getByRole("button", { name: "Crear perfil" }));

    expect(bodyOf(fetchMock, "POST", "/api/admin/shipping/package-profiles")).toEqual({
      name: "Caja nueva",
      weightGrams: 450,
      lengthCm: 21,
      widthCm: 11,
      heightCm: 9,
      isDefault: true,
    });
  });

  it("marks another profile as default through its own endpoint", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({
      "GET /api/admin/shipping/package-profiles": () => PROFILES,
      "POST /api/admin/shipping/package-profiles/p2/default": () => ({
        ...PROFILES[1],
        isDefault: true,
      }),
    });
    renderWithProviders(<AdminShippingPage />);

    const otherRow = (await screen.findByText("Caja grande")).closest("tr")!;
    await user.click(within(otherRow).getByRole("button", { name: "Marcar como predeterminado" }));
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          new URL(String(url)).pathname === "/api/admin/shipping/package-profiles/p2/default" &&
          init?.method === "POST",
      ),
    ).toBe(true);
  });
});

describe("AdminShippingPage — simulator", () => {
  it("without a provider: free for the customer, carrier cost 'No disponible' (never $0), and what is missing", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({
      "GET /api/admin/shipping/package-profiles": () => PROFILES,
      "POST /api/admin/shipping/simulations": () => simulationResult(),
    });
    renderWithProviders(<AdminShippingPage />);

    const simulator = await screen.findByRole("region", { name: "Simulador de costos de envío" });
    await user.type(within(simulator).getByLabelText("Código postal de destino"), "9998");
    await user.click(within(simulator).getByRole("button", { name: "Simular" }));

    const result = await screen.findByLabelText("Resultado de la simulación");
    expect(within(result).getByText("Gratis")).toBeInTheDocument();
    expect(within(result).getAllByText("No disponible")).toHaveLength(2);
    expect(within(result).queryByText("$ 0")).not.toBeInTheDocument();
    expect(within(result).getByText("Proveedor logístico no configurado.")).toBeInTheDocument();
    expect(
      within(result).getByText("Falta el código postal de la sucursal de origen."),
    ).toBeInTheDocument();

    // Ids/codes only — never a cost or a total.
    expect(bodyOf(fetchMock, "POST", "/api/admin/shipping/simulations")).toEqual({
      destinationPostalCode: "9998",
      destinationProvinceCode: "Y",
    });
  });

  it("once a carrier quotes: shows its real cost and the cost absorbed, still free for the customer", async () => {
    const user = userEvent.setup();
    stubFetch({
      "GET /api/admin/shipping/package-profiles": () => PROFILES,
      "POST /api/admin/shipping/simulations": () =>
        simulationResult({
          status: "QUOTED",
          missingConfiguration: [],
          provider: "FAKE",
          providerShippingCost: 12000,
          absorbedShippingCost: 12000,
          origin: { branchName: "Sucursal", postalCode: "9999" },
        }),
    });
    renderWithProviders(<AdminShippingPage />);

    const simulator = await screen.findByRole("region", { name: "Simulador de costos de envío" });
    await user.selectOptions(within(simulator).getByLabelText("Provincia de destino"), "B");
    await user.type(within(simulator).getByLabelText("Código postal de destino"), "1704");
    await user.click(within(simulator).getByRole("button", { name: "Simular" }));

    const result = await screen.findByLabelText("Resultado de la simulación");
    expect(within(result).getByText("Gratis")).toBeInTheDocument();
    expect(within(result).getAllByText("$ 12.000")).toHaveLength(2);
    expect(
      within(result).queryByText("Proveedor logístico no configurado."),
    ).not.toBeInTheDocument();
  });
});
