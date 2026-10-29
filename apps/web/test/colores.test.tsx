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

describe("admin — tones of an existing variant", () => {
  it("classifies it in place, in click order, sending only the tones", async () => {
    const calls = stubApi();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT]} />);
    expect(screen.getByText("Tonos: sin clasificar")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Editar tonos de Negro" }));
    const group = screen.getByRole("group", { name: "Tonos de Negro" });
    await userEvent.click(within(group).getByRole("button", { name: /^Rojo/ }));
    await userEvent.click(within(group).getByRole("button", { name: /^Negro/ }));
    expect(within(group).getByRole("button", { name: /^Rojo/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: "Guardar tonos" }));
    await waitFor(() =>
      expect(calls).toEqual([
        {
          method: "PATCH",
          path: "/api/admin/products/p1/variants/v1",
          body: { colorTones: ["ROJO", "NEGRO"] },
        },
      ]),
    );
  });

  it("keeps multicolor alone and cancels without sending", async () => {
    const calls = stubApi();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT]} />);
    await userEvent.click(screen.getByRole("button", { name: "Editar tonos de Negro" }));
    const group = screen.getByRole("group", { name: "Tonos de Negro" });
    await userEvent.click(within(group).getByRole("button", { name: /^Rojo/ }));
    await userEvent.click(within(group).getByRole("button", { name: /^Multicolor/ }));
    expect(within(group).getByRole("button", { name: /^Rojo/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(calls).toEqual([]);
    expect(screen.getByText("Tonos: sin clasificar")).toBeInTheDocument();
  });

  it("names a classified two-tone piece as one piece", () => {
    stubApi();
    renderWithProviders(
      <AdminVariantsEditor
        productId="p1"
        variants={[{ ...VARIANT, colorTones: ["ROJO", "NEGRO"] }]}
      />,
    );
    expect(screen.getByText("Tonos: Rojo y negro (una sola pieza combinada)")).toBeInTheDocument();
  });
});

describe("admin — loading a frame's colors", () => {
  it("picks several palette colors, each its own variant with its tone, nothing locked", async () => {
    const calls = stubApi();
    renderWithProviders(
      <AdminVariantsEditor productId="p1" productSlug="gatito" variants={[VARIANT]} />,
    );
    const palette = screen.getByRole("group", { name: "Paleta de colores" });
    expect(within(palette).getAllByRole("button")).toHaveLength(15);
    // Negro is already loaded, and can still be chosen (another tint).
    expect(within(palette).getByRole("button", { name: "Negro" })).toBeEnabled();
    await userEvent.click(within(palette).getByRole("button", { name: "Rojo" }));
    await userEvent.click(within(palette).getByRole("button", { name: "Carey" }));
    await userEvent.type(screen.getByLabelText("Stock de Rojo"), "2");
    await userEvent.type(screen.getByLabelText("Stock de Carey"), "0");
    await userEvent.click(screen.getByRole("button", { name: "Guardar 2 colores" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.path).toBe("/api/admin/products/p1/variants/batch");
    expect(calls[0]!.body).toEqual({
      variants: [
        { color: "Rojo", colorTones: ["ROJO"], stock: 2, sku: expect.any(String) },
        { color: "Carey", colorTones: ["CAREY"], stock: 0, sku: expect.any(String) },
      ],
    });
  });

  it("registers one two-tone piece, named after its tones", async () => {
    const calls = stubApi();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[]} />);
    const group = screen.getByRole("group", { name: "Tonos de la variante nueva" });
    await userEvent.click(within(group).getByRole("button", { name: /^Rojo/ }));
    await userEvent.click(within(group).getByRole("button", { name: /^Negro/ }));
    await userEvent.type(screen.getByLabelText("SKU"), "RN-1");
    await userEvent.click(screen.getByRole("button", { name: "Agregar variante" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body).toMatchObject({
      color: "Rojo y negro",
      colorTones: ["ROJO", "NEGRO"],
      sku: "RN-1",
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

  it("keeps the URL shareable: ?colors= round-trips, unknown names are dropped, ?color= still read", () => {
    const filters = parseCatalogSearchParams(
      new URLSearchParams("colors=Rojo,marrón,fucsia,rojo&color=Negro mate"),
    );
    expect(filters.colors).toEqual(["ROJO", "MARRON"]);
    expect(filters.color).toBe("Negro mate");
    expect(catalogFiltersToSearchParams(filters).get("colors")).toBe("rojo,marron");
    expect(parseCatalogSearchParams(new URLSearchParams("colors=fucsia")).colors).toBeUndefined();
  });
});
