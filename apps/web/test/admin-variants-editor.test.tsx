import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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

    const deleteImageButtons = screen.getAllByRole("button", { name: "Eliminar" }).slice(1);
    await userEvent.click(deleteImageButtons[0]!);
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
