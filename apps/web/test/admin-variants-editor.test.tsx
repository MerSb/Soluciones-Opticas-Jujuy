import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminVariantsEditor } from "../src/pages/admin/AdminVariantsEditor";
import { renderWithProviders } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const VARIANT_NO_IMAGES = {
  id: "v1",
  productId: "p1",
  color: "Negro",
  material: "Metal",
  label: null,
  colorTones: [],
  sku: "SKU-1",
  stock: 5,
  priceOverride: null,
  images: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const VARIANT_WITH_TWO_IMAGES = {
  ...VARIANT_NO_IMAGES,
  images: [
    {
      id: "img1",
      variantId: "v1",
      cloudinaryPublicId: "test/img1",
      alt: "Foto 1",
      sortOrder: 0,
      isPrimary: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "img2",
      variantId: "v1",
      cloudinaryPublicId: "test/img2",
      alt: "Foto 2",
      sortOrder: 1,
      isPrimary: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

function stubFetch(handlers: {
  onDeleteVariant?: () => void;
  onDeleteImage?: (imageId: string) => void;
  onUpdateVariantFails?: boolean;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/admin/products/p1/variants/v1" && method === "DELETE") {
        handlers.onDeleteVariant?.();
        return { ok: true, status: 204, json: async () => undefined };
      }
      if (path === "/api/admin/products/p1/variants/v1" && method === "PATCH") {
        if (handlers.onUpdateVariantFails) {
          return {
            ok: false,
            status: 400,
            json: async () => ({
              error: { code: "VALIDATION_ERROR", message: "El stock no puede ser negativo." },
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ ...VARIANT_NO_IMAGES, stock: 9 }) };
      }
      const imageMatch = path.match(/\/api\/admin\/products\/p1\/variants\/v1\/images\/(.+)$/);
      if (imageMatch && method === "DELETE") {
        handlers.onDeleteImage?.(imageMatch[1]!);
        return { ok: true, status: 204, json: async () => undefined };
      }
      throw new Error(`Unhandled request: ${method} ${path}`);
    }),
  );
}

describe("AdminVariantsEditor — destructive action confirmation", () => {
  it("cancelling the confirm dialog never deletes the variant", async () => {
    const onDeleteVariant = vi.fn();
    stubFetch({ onDeleteVariant });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(onDeleteVariant).not.toHaveBeenCalled();
  });

  it("confirming the dialog deletes the variant", async () => {
    const onDeleteVariant = vi.fn();
    stubFetch({ onDeleteVariant });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(onDeleteVariant).toHaveBeenCalled());
  });

  it("the confirm message mentions the exact image count and warns it's irreversible", async () => {
    stubFetch({});
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithProviders(
      <AdminVariantsEditor productId="p1" variants={[VARIANT_WITH_TWO_IMAGES]} />,
    );

    // The variant's own "Eliminar" is the first of the three (variant +
    // its two images).
    await userEvent.click(screen.getAllByRole("button", { name: "Eliminar" })[0]!);
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("2 imágenes cargadas"));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("no se puede deshacer"));
    expect(confirmSpy.mock.calls[0]![0]).not.toMatch(/cloudinary/i);
  });

  it("a variant with no images gets a message that never mentions images", async () => {
    stubFetch({});
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(confirmSpy.mock.calls[0]![0]).toContain("información de stock");
    expect(confirmSpy.mock.calls[0]![0]).not.toContain("imagen");
  });

  it("deleting an image requires confirmation too", async () => {
    const onDeleteImage = vi.fn();
    stubFetch({ onDeleteImage });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderWithProviders(
      <AdminVariantsEditor productId="p1" variants={[VARIANT_WITH_TWO_IMAGES]} />,
    );

    // Each photo's delete button names the photo it deletes.
    await userEvent.click(screen.getAllByRole("button", { name: /^Eliminar «/ })[0]!);
    expect(window.confirm).toHaveBeenCalled();
    expect(onDeleteImage).not.toHaveBeenCalled();
  });
});

describe("AdminVariantsEditor — stock update error handling", () => {
  it("shows a visible error when saving stock fails, and keeps the typed value", async () => {
    stubFetch({ onUpdateVariantFails: true });
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);

    const stockInput = screen.getByLabelText("Stock de SKU-1");
    await userEvent.clear(stockInput);
    await userEvent.type(stockInput, "-1");
    await userEvent.click(screen.getByRole("button", { name: "Guardar stock" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El stock no puede ser negativo.");
    // The admin's typed value must survive a failed save — never
    // silently reset to the last-saved server value.
    expect(stockInput).toHaveValue(-1);
  });

  it("the save button stays enabled after a failure, so retrying is just clicking it again", async () => {
    stubFetch({ onUpdateVariantFails: true });
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);

    const stockInput = screen.getByLabelText("Stock de SKU-1");
    await userEvent.clear(stockInput);
    await userEvent.type(stockInput, "8");
    const saveButton = screen.getByRole("button", { name: "Guardar stock" });
    await userEvent.click(saveButton);

    await screen.findByRole("alert");
    expect(saveButton).not.toBeDisabled();
  });
});

describe("AdminVariantsEditor — adding a variant is folded away", () => {
  function stubCreate(conflict = false) {
    const calls: { method: string; path: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        const path = new URL(url).pathname;
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
        calls.push({ method, path, body });
        if (method === "POST" && path === "/api/admin/products/p1/variants") {
          if (conflict) {
            return {
              ok: false,
              status: 409,
              json: async () => ({
                error: { code: "CONFLICT", message: 'El SKU "SKU-1" ya está en uso.' },
              }),
            };
          }
          return {
            ok: true,
            status: 201,
            json: async () => ({ ...VARIANT_NO_IMAGES, id: "v2", ...body }),
          };
        }
        return { ok: true, status: 200, json: async () => [] };
      }),
    );
    return calls;
  }
  const section = () => screen.getByText("Agregar otro color o variante").closest("details")!;
  const writes = <T extends { method: string }>(calls: T[]) =>
    calls.filter((c) => c.method !== "GET");
  const colors = () =>
    within(within(section()).getByRole("radiogroup", { name: "Color de la variante nueva" }));
  const field = (name: string) => within(section()).getByLabelText(name);
  const add = () => within(section()).getByRole("button", { name: "Agregar variante" });

  async function addVariant(
    user: ReturnType<typeof userEvent.setup>,
    data: { color: string; material?: string; sku: string; stock: string },
  ) {
    await user.click(colors().getByRole("radio", { name: data.color }));
    if (data.material) await user.type(field("Material"), data.material);
    await user.type(field("SKU"), data.sku);
    await user.clear(field("Stock"));
    await user.type(field("Stock"), data.stock);
    await user.click(add());
  }

  it("with variants loaded: the cards (and 'Corregir datos') come first, the add form is closed", () => {
    stubCreate();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);
    expect(section()).not.toHaveAttribute("open");
    const fix = screen.getByRole("button", { name: "Corregir datos de Negro" });
    expect(section().contains(fix)).toBe(false);
    expect(fix.compareDocumentPosition(section()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The simple form: one palette (one color), material, SKU and stock.
    expect(within(section()).getAllByRole("radiogroup")).toHaveLength(1);
    expect(colors().getAllByRole("radio")).toHaveLength(20);
    expect(colors().queryByRole("radio", { name: "Rosado" })).toBeNull(); // accessories only
    expect(within(section()).queryByRole("checkbox")).toBeNull();
    expect(within(section()).queryByRole("button", { name: /Negro|Rojo/ })).toBeNull();
    for (const name of ["Material", "SKU", "Stock"]) expect(field(name)).toBeInTheDocument();
  });

  it("with no variants yet, it starts open", () => {
    stubCreate();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[]} />);
    expect(section()).toHaveAttribute("open");
  });

  it("opening/closing it and choosing a color write nothing", async () => {
    const user = userEvent.setup();
    const calls = stubCreate();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);
    await user.click(screen.getByText("Agregar otro color o variante"));
    expect(section()).toHaveAttribute("open");
    await user.click(colors().getByRole("radio", { name: "Rojo" }));
    await user.click(colors().getByRole("radio", { name: "Azul" }));
    expect(colors().getByRole("radio", { name: "Rojo" })).not.toBeChecked();
    await user.click(screen.getByText("Agregar otro color o variante"));
    expect(section()).not.toHaveAttribute("open");
    expect(writes(calls)).toEqual([]);
  });

  it("adds Negro with its material, SKU and stock in one step (the existing variant is untouched)", async () => {
    const user = userEvent.setup();
    const calls = stubCreate();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);
    await user.click(screen.getByText("Agregar otro color o variante"));
    await addVariant(user, { color: "Negro", material: "Acetato", sku: "SKU-2", stock: "3" });
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toEqual({
      method: "POST",
      path: "/api/admin/products/p1/variants",
      body: { color: "Negro", material: "Acetato", colorTones: ["NEGRO"], sku: "SKU-2", stock: 3 },
    });
    expect(await within(section()).findByRole("status")).toHaveTextContent(
      "Variante agregada: Negro (SKU SKU-2).",
    );
    // Empty again for the next one.
    expect(field("SKU")).toHaveValue("");
    expect(field("Material")).toHaveValue("");
    expect(colors().getByRole("radio", { name: "Negro" })).not.toBeChecked();
  });

  it("Celeste, Amarillo and Naranja are three separate operations, one variant each", async () => {
    const user = userEvent.setup();
    const calls = stubCreate();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);
    await user.click(screen.getByText("Agregar otro color o variante"));
    for (const [color, sku] of [
      ["Celeste", "SKU-C"],
      ["Amarillo", "SKU-A"],
      ["Naranja", "SKU-O"],
    ] as const) {
      await addVariant(user, { color, sku, stock: "1" });
      await waitFor(() => expect(field("SKU")).toHaveValue(""));
    }
    expect(writes(calls).map((c) => c.body)).toEqual([
      { color: "Celeste", material: null, colorTones: ["CELESTE"], sku: "SKU-C", stock: 1 },
      { color: "Amarillo", material: null, colorTones: ["AMARILLO"], sku: "SKU-A", stock: 1 },
      { color: "Naranja", material: null, colorTones: ["NARANJA"], sku: "SKU-O", stock: 1 },
    ]);
  });

  it("«Combinado» shows only its tones: Plateado + Azul is ONE variant with one SKU and stock", async () => {
    const user = userEvent.setup();
    const calls = stubCreate();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);
    await user.click(screen.getByText("Agregar otro color o variante"));
    const fields = () => section().querySelectorAll("input:not([type=radio])").length;
    const before = fields();
    await user.click(colors().getByRole("radio", { name: "Combinado" }));
    // One extra row of tones; no other palette, checkbox or field.
    const tones = within(
      within(section()).getByRole("group", { name: "Tonos de la pieza combinada" }),
    );
    expect(fields()).toBe(before);
    expect(within(section()).getAllByRole("radiogroup")).toHaveLength(1);
    expect(within(section()).queryByRole("checkbox")).toBeNull();
    expect(tones.queryByRole("button", { name: /Multicolor|Combinado/ })).toBeNull();
    await user.type(field("Material"), "Metal");
    await user.type(field("SKU"), "MOD-125");
    await user.clear(field("Stock"));
    await user.type(field("Stock"), "4");
    await user.click(tones.getByRole("button", { name: /^Plateado/ }));
    expect(add()).toBeDisabled();
    expect(
      within(section()).getByText("Elegí al menos dos tonos de la pieza combinada."),
    ).toBeInTheDocument();
    await user.click(tones.getByRole("button", { name: /^Azul/ }));
    expect(
      within(section()).getByText(/Se guarda como una sola variante: «Plateado y azul»/),
    ).toBeInTheDocument();
    await user.click(add());
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]!.body).toEqual({
      color: "Plateado y azul",
      material: "Metal",
      colorTones: ["PLATEADO", "AZUL"],
      sku: "MOD-125",
      stock: 4,
    });
  });

  it("«Combinado» with three tones keeps their order; a tone clicked again is removed", async () => {
    const user = userEvent.setup();
    const calls = stubCreate();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);
    await user.click(screen.getByText("Agregar otro color o variante"));
    await user.click(colors().getByRole("radio", { name: "Combinado" }));
    const tones = within(
      within(section()).getByRole("group", { name: "Tonos de la pieza combinada" }),
    );
    for (const tone of ["Negro", "Rojo", "Verde", "Dorado"]) {
      await user.click(tones.getByRole("button", { name: new RegExp(`^${tone}`) }));
    }
    await user.click(tones.getByRole("button", { name: /^Verde/ }));
    await user.type(field("SKU"), "MOD-3T");
    await user.click(add());
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]!.body).toMatchObject({
      color: "Negro, Rojo y dorado",
      colorTones: ["NEGRO", "ROJO", "DORADO"],
      sku: "MOD-3T",
      stock: 0,
    });
  });

  it("«Otro color…» asks only for its name and saves it as typed, without tones", async () => {
    const user = userEvent.setup();
    const calls = stubCreate();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);
    await user.click(screen.getByText("Agregar otro color o variante"));
    const before = section().querySelectorAll("input:not([type=radio])").length;
    await user.click(colors().getByRole("radio", { name: "Otro color…" }));
    expect(section().querySelectorAll("input:not([type=radio])")).toHaveLength(before + 1);
    expect(within(section()).getAllByRole("radiogroup")).toHaveLength(1);
    await user.type(field("SKU"), "SKU-GG");
    expect(add()).toBeDisabled();
    expect(within(section()).getByText("Escribí el nombre del color.")).toBeInTheDocument();
    await user.type(field("Nombre del color"), "Gris gun");
    await user.type(field("Material"), "Metal");
    await user.click(add());
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]!.body).toEqual({
      color: "Gris gun",
      material: "Metal",
      sku: "SKU-GG",
      stock: 0,
    });
    await waitFor(() => expect(within(section()).queryByLabelText("Nombre del color")).toBeNull());
  });

  it("needs the color and the SKU; a repeated SKU shows the API's reason and keeps what was typed", async () => {
    const user = userEvent.setup();
    const calls = stubCreate(true);
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);
    await user.click(screen.getByText("Agregar otro color o variante"));
    expect(add()).toBeDisabled();
    expect(within(section()).getByText("Elegí el color en la paleta.")).toBeInTheDocument();
    await user.type(field("SKU"), "SKU-1");
    expect(add()).toBeDisabled();
    await user.click(colors().getByRole("radio", { name: "Rojo" }));
    await user.type(field("Material"), "Metal");
    await user.click(add());
    expect(await within(section()).findByRole("alert")).toHaveTextContent(
      'El SKU "SKU-1" ya está en uso.',
    );
    expect(field("SKU")).toHaveValue("SKU-1");
    expect(field("Material")).toHaveValue("Metal");
    expect(colors().getByRole("radio", { name: "Rojo" })).toBeChecked();
    expect(writes(calls)).toHaveLength(1);
  });
});
