import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminVariantDto, ProductVariantDto } from "@soluciones-opticas/shared";
import { AdminVariantsEditor } from "../src/pages/admin/AdminVariantsEditor";
import { VariantSelector } from "../src/components/products/VariantSelector";
import { ColorSwatchList } from "../src/components/products/ColorSwatchList";
import { FilterFields } from "../src/components/catalog/FilterFields";
import {
  catalogFiltersToSearchParams,
  parseCatalogSearchParams,
} from "../src/lib/catalog-url-state";
import { tonesBackground, tonesName } from "../src/lib/color-tones";
import { renderWithProviders } from "./test-utils";

// Palette colors (docs/COLORES.md) in the admin and the shop.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const VARIANT: AdminVariantDto = {
  id: "v1",
  productId: "p1",
  color: "Negro",
  material: "Metal",
  label: null,
  colorTones: [],
  sku: "SKU-1",
  stock: 5,
  priceOverride: 18000,
  images: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

// Records every write; answers with what the API would.
function stubApi() {
  const calls: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const path = new URL(input).pathname;
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      if (method !== "GET") calls.push({ method, path, body });
      const reply =
        method === "PATCH"
          ? { ...VARIANT, ...body }
          : path.endsWith("/batch")
            ? body.variants.map((row: object, i: number) => ({ ...VARIANT, id: `n${i}`, ...row }))
            : method === "POST"
              ? { ...VARIANT, id: "n", ...body }
              : [];
      return {
        ok: true,
        status: method === "GET" || method === "PATCH" ? 200 : 201,
        json: async () => reply,
      };
    }),
  );
  return calls;
}

describe("admin — palette color of an existing variant", () => {
  it("classifies it in place with one color, sending only its tone", async () => {
    const calls = stubApi();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT]} />);
    expect(screen.getByText("Color de la paleta: sin clasificar")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Cambiar el color de la paleta de Negro" }),
    );
    const group = screen.getByRole("radiogroup", { name: "Color de la paleta de Negro" });
    expect(within(group).getAllByRole("radio")).toHaveLength(19);
    await userEvent.click(within(group).getByRole("radio", { name: "Rojo" }));
    await userEvent.click(within(group).getByRole("radio", { name: "Negro" }));
    expect(within(group).getByRole("radio", { name: "Rojo" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Guardar color" }));
    await waitFor(() =>
      expect(calls).toEqual([
        {
          method: "PATCH",
          path: "/api/admin/products/p1/variants/v1",
          body: { colorTones: ["NEGRO"] },
        },
      ]),
    );
  });

  it("offers «Combinado» as one more choice, and cancels without sending", async () => {
    const calls = stubApi();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT]} />);
    await userEvent.click(
      screen.getByRole("button", { name: "Cambiar el color de la paleta de Negro" }),
    );
    const group = screen.getByRole("radiogroup", { name: "Color de la paleta de Negro" });
    await userEvent.click(within(group).getByRole("radio", { name: "Combinado" }));
    expect(within(group).getByRole("radio", { name: "Combinado" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(calls).toEqual([]);
    expect(screen.getByText("Color de la paleta: sin clasificar")).toBeInTheDocument();
  });

  it("keeps a two-tone piece loaded before as it is until another color is chosen", async () => {
    const calls = stubApi();
    renderWithProviders(
      <AdminVariantsEditor
        productId="p1"
        variants={[{ ...VARIANT, colorTones: ["ROJO", "NEGRO"] }]}
      />,
    );
    expect(
      screen.getByText("Color de la paleta: Rojo y negro (una sola pieza de varios tonos)"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Cambiar el color de la paleta de Negro" }),
    );
    const group = screen.getByRole("radiogroup", { name: "Color de la paleta de Negro" });
    expect(within(group).queryByRole("radio", { checked: true })).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar color" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(calls).toEqual([]);
  });
});

describe("admin — variants loaded before the simple form", () => {
  it("are listed as they are — names outside the palette, two tones, no tones — and nothing is written", () => {
    const calls = stubApi();
    renderWithProviders(
      <AdminVariantsEditor
        productId="p1"
        variants={[
          { ...VARIANT, id: "a", color: "Animal print", sku: "OLD-AP", colorTones: [] },
          {
            ...VARIANT,
            id: "b",
            color: "Rojo y negro",
            sku: "OLD-RN",
            colorTones: ["ROJO", "NEGRO"],
          },
          { ...VARIANT, id: "c", color: "Celeste", sku: "OLD-CE", colorTones: [] },
        ]}
      />,
    );
    expect(screen.getByText("Animal print · Metal")).toBeInTheDocument();
    expect(screen.getByText("Rojo y negro · Metal")).toBeInTheDocument();
    expect(screen.getAllByText("Color de la paleta: sin clasificar")).toHaveLength(2);
    expect(
      screen.getByText("Color de la paleta: Rojo y negro (una sola pieza de varios tonos)"),
    ).toBeInTheDocument();
    for (const name of ["Animal print", "Rojo y negro", "Celeste"]) {
      expect(screen.getByRole("button", { name: `Corregir datos de ${name}` })).toBeInTheDocument();
    }
    expect(calls).toEqual([]);
  });
});

describe("admin — adding a frame's variant", () => {
  it("may repeat a color already loaded (another material), as its own variant", async () => {
    const calls = stubApi();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT]} />);
    const add = within(
      screen.getByText("Agregar otro color o variante").closest("details") as HTMLElement,
    );
    await userEvent.click(add.getByRole("radio", { name: "Negro" }));
    await userEvent.type(add.getByLabelText("Material"), "Acetato");
    await userEvent.type(add.getByLabelText("SKU"), "SKU-2");
    await userEvent.click(add.getByRole("button", { name: "Agregar variante" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/api/admin/products/p1/variants",
      body: { color: "Negro", material: "Acetato", colorTones: ["NEGRO"], sku: "SKU-2", stock: 0 },
    });
  });
});

describe("shop — swatches and variants", () => {
  const variant = (id: string, color: string, colorTones: ProductVariantDto["colorTones"]) =>
    ({
      id,
      color,
      material: null,
      label: null,
      colorTones,
      sku: id,
      price: 1000,
      inStock: true,
      images: [],
    }) satisfies ProductVariantDto;

  it("tells apart variants that share a color name, never merging them", () => {
    const variants = [
      variant("a", "Negro", ["NEGRO"]),
      variant("b", "Negro", ["NEGRO"]),
      variant("c", "Rojo y negro", ["ROJO", "NEGRO"]),
    ];
    renderWithProviders(
      <VariantSelector variants={variants} selected={variants[0]!} onSelect={() => {}} />,
    );
    const group = screen.getByRole("group", { name: "Elegir color" });
    expect(within(group).getAllByRole("button")).toHaveLength(3);
    // Told apart by their own SKU, each one still selectable on its own.
    expect(within(group).getByRole("button", { name: "Negro, código a" })).toHaveTextContent(
      "Negro· a",
    );
    expect(within(group).getByRole("button", { name: "Negro, código b" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Rojo y negro" })).toBeInTheDocument();
  });

  it("names the material too when two variants share a color", () => {
    const variants = [
      { ...variant("a", "Negro", ["NEGRO"]), material: "Acetato" },
      { ...variant("b", "Negro", ["NEGRO"]), material: "Metal" },
      variant("c", "Combinado", ["COMBINADO"]),
    ];
    renderWithProviders(
      <VariantSelector variants={variants} selected={variants[0]!} onSelect={() => {}} />,
    );
    const group = screen.getByRole("group", { name: "Elegir color" });
    expect(
      within(group).getByRole("button", { name: "Negro, Acetato, código a" }),
    ).toHaveTextContent("Negro· Acetato · a");
    expect(
      within(group).getByRole("button", { name: "Negro, Metal, código b" }),
    ).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "Combinado" })).toBeInTheDocument();
  });

  it("selecting one of two same-color variants picks exactly that one", async () => {
    const variants = [variant("a", "Negro", ["NEGRO"]), variant("b", "Negro", ["NEGRO"])];
    const onSelect = vi.fn();
    renderWithProviders(
      <VariantSelector variants={variants} selected={variants[0]!} onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Negro, código b" }));
    expect(onSelect).toHaveBeenCalledWith(variants[1]);
  });

  it("without palette circles, never draws two identical circles side by side", () => {
    const { container } = renderWithProviders(
      <ColorSwatchList colors={["Beige", "Gris Gun", "Lila", "Negro", "negro", "Rosa Añejo"]} />,
    );
    // Every name is still announced.
    expect(
      screen.getByLabelText("Colores disponibles: Beige, Gris Gun, Lila, Negro, negro, Rosa Añejo"),
    ).toBeInTheDocument();
    // Beige (palette), negro (one, any case), one neutral circle for the rest.
    expect(screen.getByTitle("Beige")).toBeInTheDocument();
    expect(screen.getByTitle("Negro, negro")).toBeInTheDocument();
    expect(screen.getByTitle("Gris Gun, Lila, Rosa Añejo")).toBeInTheDocument();
    expect(container.querySelectorAll("[title]")).toHaveLength(3);
  });

  it("draws a two-tone piece as one split circle", () => {
    renderWithProviders(
      <ColorSwatchList
        colors={["Rojo", "Rojo y negro"]}
        swatches={[["ROJO"], ["ROJO", "NEGRO"]]}
      />,
    );
    expect(screen.getByLabelText("Colores disponibles: Rojo, Rojo y negro")).toBeInTheDocument();
    expect(screen.getByTitle("Rojo y negro")).toBeInTheDocument();
    expect(tonesBackground(["ROJO", "NEGRO"])).toBe(
      "linear-gradient(90deg,#dc2626 0% 50%,#1a1a1a 50% 100%)",
    );
    expect(tonesName(["NEGRO", "DORADO", "ROJO"])).toBe("Negro, Dorado y rojo");
  });

  it("falls back to names for variants loaded before the palette", () => {
    renderWithProviders(<ColorSwatchList colors={["Negro", "Fucsia"]} swatches={[]} />);
    expect(screen.getByLabelText("Colores disponibles: Negro, Fucsia")).toBeInTheDocument();
  });
});

describe("shop — color filter", () => {
  it("offers the tones with frames as circles and ORs the chosen ones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const path = new URL(input).pathname;
        const json =
          path === "/api/products/colors"
            ? [
                { tone: "NEGRO", count: 9 },
                { tone: "ROJO", count: 3 },
              ]
            : [];
        return { ok: true, status: 200, json: async () => json };
      }),
    );
    const onChange = vi.fn();
    renderWithProviders(
      <FilterFields filters={{ page: 1, colors: ["NEGRO"] }} onChange={onChange} idPrefix="t" />,
    );
    const group = await screen.findByRole("group", { name: "Filtrar por color" });
    expect(within(group).getByRole("button", { name: "Negro (9)" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(within(group).getByRole("button", { name: "Rojo (3)" }));
    expect(onChange).toHaveBeenLastCalledWith({ colors: ["NEGRO", "ROJO"] });
    await userEvent.click(within(group).getByRole("button", { name: "Negro (9)" }));
    expect(onChange).toHaveBeenLastCalledWith({ colors: undefined });
  });

  it("offers the new colors and «Combinado» as circles of their own", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const path = new URL(input).pathname;
        const json =
          path === "/api/products/colors"
            ? [
                { tone: "AZUL", count: 4 },
                { tone: "CELESTE", count: 2 },
                { tone: "AMARILLO", count: 1 },
                { tone: "NARANJA", count: 1 },
                { tone: "COMBINADO", count: 3 },
              ]
            : [];
        return { ok: true, status: 200, json: async () => json };
      }),
    );
    const onChange = vi.fn();
    renderWithProviders(<FilterFields filters={{ page: 1 }} onChange={onChange} idPrefix="t" />);
    const group = await screen.findByRole("group", { name: "Filtrar por color" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label") ?? b.textContent),
    ).toEqual(
      expect.arrayContaining([
        "Azul (4)",
        "Celeste (2)",
        "Amarillo (1)",
        "Naranja (1)",
        "Combinado (3)",
      ]),
    );
    await userEvent.click(within(group).getByRole("button", { name: "Combinado (3)" }));
    expect(onChange).toHaveBeenLastCalledWith({ colors: ["COMBINADO"] });
  });

  it("keeps the URL shareable: ?colors= round-trips, unknown names are dropped, ?color= still read", () => {
    expect(
      parseCatalogSearchParams(new URLSearchParams("colors=celeste,AMARILLO,naranja,combinado"))
        .colors,
    ).toEqual(["CELESTE", "AMARILLO", "NARANJA", "COMBINADO"]);
    const filters = parseCatalogSearchParams(
      new URLSearchParams("colors=Rojo,marrón,fucsia,rojo&color=Negro mate"),
    );
    expect(filters.colors).toEqual(["ROJO", "MARRON"]);
    expect(filters.color).toBe("Negro mate");
    expect(catalogFiltersToSearchParams(filters).get("colors")).toBe("rojo,marron");
    expect(parseCatalogSearchParams(new URLSearchParams("colors=fucsia")).colors).toBeUndefined();
  });
});
