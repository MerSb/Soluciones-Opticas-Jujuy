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
  const writes = (calls: { method: string }[]) => calls.filter((c) => c.method !== "GET");
  const combineBox = () =>
    within(section()).getByRole("checkbox", { name: /Este armazón combina varios colores/ });
  const tones = () =>
    within(within(section()).getByRole("group", { name: "Tonos de la variante nueva" }));

  it("with variants loaded: the cards (and 'Corregir datos') come first, the add form is closed", () => {
    stubCreate();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);
    expect(section()).not.toHaveAttribute("open");
    const fix = screen.getByRole("button", { name: "Corregir datos de Negro" });
    expect(section().contains(fix)).toBe(false);
    expect(fix.compareDocumentPosition(section()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // One palette ("Cargar colores"); the combined-piece form only behind its checkbox.
    expect(within(section()).getByRole("group", { name: "Paleta de colores" })).toBeInTheDocument();
    expect(combineBox()).not.toBeChecked();
    expect(
      within(section()).queryByRole("group", { name: "Tonos de la variante nueva" }),
    ).toBeNull();
  });

  it("with no variants yet, it starts open", () => {
    stubCreate();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[]} />);
    expect(section()).toHaveAttribute("open");
  });

  it("opening/closing it, and ticking/unticking the checkbox, write nothing", async () => {
    const user = userEvent.setup();
    const calls = stubCreate();
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);
    await user.click(screen.getByText("Agregar otro color o variante"));
    expect(section()).toHaveAttribute("open");
    await user.click(combineBox());
    await user.type(within(section()).getByLabelText("SKU"), "SKU-2");
    // Unticking with data typed asks first; cancelling keeps everything.
    await user.click(combineBox());
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(combineBox()).toBeChecked();
    expect(within(section()).getByLabelText("SKU")).toHaveValue("SKU-2");
    await user.click(combineBox());
    expect(combineBox()).not.toBeChecked();
    expect(within(section()).queryByLabelText("SKU")).toBeNull();
    await user.click(screen.getByText("Agregar otro color o variante"));
    expect(section()).not.toHaveAttribute("open");
    expect(writes(calls)).toEqual([]);
  });

  it("ticked, it adds one combined piece with its tones (the existing variant is untouched)", async () => {
    const user = userEvent.setup();
    const calls = stubCreate();
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);
    await user.click(screen.getByText("Agregar otro color o variante"));
    await user.click(combineBox());
    await user.click(tones().getByRole("button", { name: /Rojo/ }));
    await user.click(tones().getByRole("button", { name: /^Negro/ }));
    await user.type(within(section()).getByLabelText("Material"), "Acetato");
    await user.type(within(section()).getByLabelText("SKU"), "SKU-2");
    await user.clear(within(section()).getByLabelText("Stock"));
    await user.type(within(section()).getByLabelText("Stock"), "3");
    await user.click(within(section()).getByRole("button", { name: "Agregar pieza combinada" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toEqual({
      method: "POST",
      path: "/api/admin/products/p1/variants",
      body: {
        color: "Rojo y negro",
        material: "Acetato",
        colorTones: ["ROJO", "NEGRO"],
        sku: "SKU-2",
        stock: 3,
      },
    });
  });

  it("keeps the validations: two tones and a SKU; a repeated SKU shows the API's reason", async () => {
    const user = userEvent.setup();
    stubCreate(true);
    renderWithProviders(<AdminVariantsEditor productId="p1" variants={[VARIANT_NO_IMAGES]} />);
    await user.click(screen.getByText("Agregar otro color o variante"));
    await user.click(combineBox());
    const add = () => within(section()).getByRole("button", { name: "Agregar pieza combinada" });
    await user.type(within(section()).getByLabelText("SKU"), "SKU-1");
    await user.click(tones().getByRole("button", { name: /Rojo/ }));
    expect(add()).toBeDisabled(); // one tone is not a combination
    expect(within(section()).getByText("Elegí al menos dos tonos.")).toBeInTheDocument();
    await user.click(tones().getByRole("button", { name: /Azul/ }));
    await user.click(add());
    expect(await within(section()).findByRole("alert")).toHaveTextContent(
      'El SKU "SKU-1" ya está en uso.',
    );
    expect(within(section()).getByLabelText("SKU")).toHaveValue("SKU-1");
  });
});
