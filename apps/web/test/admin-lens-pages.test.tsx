import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminLensTypesPage } from "../src/pages/admin/AdminLensTypesPage";
import { AdminLensTypeDetailPage } from "../src/pages/admin/AdminLensTypeDetailPage";
import { AdminLensTreatmentsPage } from "../src/pages/admin/AdminLensTreatmentsPage";
import { renderWithProviders } from "./test-utils";

// Lens catalog admin (ADR-0023). Every name is fictional test data —
// never the client's real lens names, which are still pending.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const TIMESTAMPS = { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };

function lensType(overrides: Record<string, unknown> = {}) {
  return {
    id: "lt1",
    name: "Cristal Prueba",
    slug: "cristal-prueba",
    description: null,
    basePrice: 40000,
    supportsCustomGraduation: false,
    isFeatured: true,
    sortOrder: 0,
    treatments: [{ id: "t1", name: "Tratamiento Uno", slug: "tratamiento-uno", deletedAt: null }],
    options: [
      {
        id: "o1",
        lensTypeId: "lt1",
        name: "Tono A",
        slug: "tono-a",
        description: null,
        swatchHex: "#112233",
        priceOverride: null,
        price: 40000,
        stock: null,
        sortOrder: 0,
        deletedAt: null,
        ...TIMESTAMPS,
      },
      {
        id: "o2",
        lensTypeId: "lt1",
        name: "Tono B",
        slug: "tono-b",
        description: null,
        swatchHex: null,
        priceOverride: 45000,
        price: 45000,
        stock: 0,
        sortOrder: 1,
        deletedAt: null,
        ...TIMESTAMPS,
      },
    ],
    activeOptionCount: 2,
    productCount: 3,
    deletedAt: null,
    ...TIMESTAMPS,
    ...overrides,
  };
}

const TREATMENTS = [
  {
    id: "t1",
    name: "Tratamiento Uno",
    slug: "tratamiento-uno",
    description: null,
    lensTypeCount: 1,
    deletedAt: null,
    ...TIMESTAMPS,
  },
  {
    id: "t2",
    name: "Tratamiento Dos",
    slug: "tratamiento-dos",
    description: null,
    lensTypeCount: 0,
    deletedAt: null,
    ...TIMESTAMPS,
  },
  {
    id: "t3",
    name: "Tratamiento Retirado",
    slug: "tratamiento-retirado",
    description: null,
    lensTypeCount: 0,
    deletedAt: "2026-01-02T00:00:00.000Z",
    ...TIMESTAMPS,
  },
];

type Handler = (body: unknown) => unknown;

function stubFetch(routes: Record<string, Handler>) {
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";
    const handler = routes[`${method} ${path}`];
    if (!handler) throw new Error(`Unhandled request: ${method} ${path}`);
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    return { ok: true, status: method === "POST" ? 201 : 200, json: async () => handler(body) };
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

describe("AdminLensTypesPage", () => {
  it("lists lens types with their real variety count and creates a new one", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({
      "GET /api/admin/lens-types": () => [lensType()],
      "POST /api/admin/lens-types": (body) => ({ ...lensType(), ...(body as object), id: "lt2" }),
    });
    renderWithProviders(<AdminLensTypesPage />);

    const row = (await screen.findByRole("link", { name: "Cristal Prueba" })).closest("tr")!;
    expect(within(row).getByText("Destacado")).toBeInTheDocument();
    expect(within(row).getByText("2")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nombre"), "Cristal Nuevo");
    await user.type(screen.getByLabelText("Precio base (ARS)"), "25000");
    await user.click(screen.getByRole("button", { name: "Crear cristal" }));

    expect(bodyOf(fetchMock, "POST", "/api/admin/lens-types")).toEqual({
      name: "Cristal Nuevo",
      basePrice: 25000,
    });
  });
});

describe("AdminLensTypeDetailPage", () => {
  function renderDetail() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(
      [{ path: "/admin/lens-types/:id", element: <AdminLensTypeDetailPage /> }],
      { initialEntries: ["/admin/lens-types/lt1"] },
    );
    return render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  }

  it("shows options with inherited price and untracked stock, and never offers a retired treatment", async () => {
    stubFetch({
      "GET /api/admin/lens-types/lt1": () => lensType(),
      "GET /api/admin/lens-treatments": () => TREATMENTS,
    });
    renderDetail();

    const optionA = (await screen.findByText("Tono A")).closest("tr")!;
    expect(within(optionA).getByText("Sin control")).toBeInTheDocument();
    expect(within(optionA).getByText("Precio base")).toBeInTheDocument();
    const optionB = screen.getByText("Tono B").closest("tr")!;
    expect(within(optionB).getByText("0")).toBeInTheDocument();

    expect(await screen.findByRole("checkbox", { name: "Tratamiento Uno" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Tratamiento Dos" })).not.toBeChecked();
    expect(screen.queryByText("Tratamiento Retirado")).not.toBeInTheDocument();
  });

  it("saves graduation support, featured flag and the full treatment set", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({
      "GET /api/admin/lens-types/lt1": () => lensType(),
      "GET /api/admin/lens-treatments": () => TREATMENTS,
      "PATCH /api/admin/lens-types/lt1": (body) => ({ ...lensType(), ...(body as object) }),
    });
    renderDetail();

    await user.click(
      await screen.findByRole("checkbox", { name: /Admite graduación personalizada/ }),
    );
    await user.click(screen.getByRole("checkbox", { name: "Tratamiento Dos" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(bodyOf(fetchMock, "PATCH", "/api/admin/lens-types/lt1")).toMatchObject({
      supportsCustomGraduation: true,
      isFeatured: true,
      treatmentIds: ["t1", "t2"],
    });
  });

  it("adds a variety: an empty price inherits the base price and an empty stock means untracked", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({
      "GET /api/admin/lens-types/lt1": () => lensType(),
      "GET /api/admin/lens-treatments": () => TREATMENTS,
      "POST /api/admin/lens-types/lt1/options": (body) => ({ id: "o3", ...(body as object) }),
    });
    renderDetail();

    const optionsSection = await screen.findByRole("region", { name: "Variedades" });
    await user.type(within(optionsSection).getByLabelText("Nombre"), "Tono C");
    await user.click(within(optionsSection).getByRole("button", { name: "Agregar variedad" }));

    expect(bodyOf(fetchMock, "POST", "/api/admin/lens-types/lt1/options")).toEqual({
      name: "Tono C",
      swatchHex: null,
      priceOverride: null,
      stock: null,
      sortOrder: 0,
    });
  });
});

describe("AdminLensTreatmentsPage", () => {
  it("lists treatments and creates a new one", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFetch({
      "GET /api/admin/lens-treatments": () => TREATMENTS,
      "POST /api/admin/lens-treatments": (body) => ({ ...TREATMENTS[1], ...(body as object) }),
    });
    renderWithProviders(<AdminLensTreatmentsPage />);

    expect(await screen.findByText("Tratamiento Uno")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Nombre"), "Tratamiento Nuevo");
    await user.click(screen.getByRole("button", { name: "Crear tratamiento" }));

    expect(bodyOf(fetchMock, "POST", "/api/admin/lens-treatments")).toEqual({
      name: "Tratamiento Nuevo",
      description: null,
    });
  });
});
