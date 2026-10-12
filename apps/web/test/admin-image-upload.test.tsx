import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminVariantDto } from "@soluciones-opticas/shared";
import { AdminVariantsEditor } from "../src/pages/admin/AdminVariantsEditor";
import { renderWithProviders } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

const PRODUCT_ID = "product-1";
const VARIANT: AdminVariantDto = {
  id: "variant-1",
  productId: PRODUCT_ID,
  color: "Negro",
  material: "Metal",
  label: null,
  sku: "SKU-1",
  stock: 5,
  priceOverride: null,
  images: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File([new Uint8Array(sizeBytes)], name, { type });
  return file;
}

// userEvent.upload() silently filters out files that don't match the
// input's `accept` attribute, which would make the "wrong file type"
// test pass for the wrong reason (no file ever attached at all, rather
// than the app's own validateImageFile rejecting it). Attaching the
// file directly bypasses that filtering, exercising the real
// application-level validation instead.
function attachFile(input: HTMLElement, file: File) {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
}

function mockThreeStepUploadFetch({
  cloudinaryOk = true,
  confirmOk = true,
  networkDown = false,
} = {}) {
  return vi.fn().mockImplementation((rawUrl: string | URL, init?: RequestInit) => {
    const url = String(rawUrl);
    if (networkDown) return Promise.reject(new TypeError("Failed to fetch"));
    if (url.includes("/images/sign-upload")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          cloudName: "demo-cloud",
          apiKey: "demo-key",
          timestamp: 123,
          signature: "sig",
          publicId: "soluciones-opticas/test/products/product-1/variant-1/uuid",
          allowedFormats: "jpg,jpeg,png,webp",
          maxFileSizeBytes: 8 * 1024 * 1024,
        }),
      });
    }
    if (url.startsWith("https://api.cloudinary.com/")) {
      if (!cloudinaryOk) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ error: { message: "Invalid image file" } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          public_id: "soluciones-opticas/test/products/product-1/variant-1/uuid",
        }),
      });
    }
    if (url.includes("/images") && init?.method === "POST") {
      if (!confirmOk) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: { code: "INTERNAL_ERROR", message: "No se pudo guardar." } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 201,
        json: async () => ({
          id: "image-1",
          variantId: VARIANT.id,
          cloudinaryPublicId: "soluciones-opticas/test/products/product-1/variant-1/uuid",
          alt: JSON.parse(init.body as string).alt,
          sortOrder: 0,
          isPrimary: JSON.parse(init.body as string).isPrimary,
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      });
    }
    return Promise.reject(new Error(`Unhandled request: ${init?.method ?? "GET"} ${url}`));
  });
}

function fileInput() {
  return screen.getByLabelText("Seleccionar imagen");
}

function stubObjectUrls() {
  // jsdom has no createObjectURL/revokeObjectURL; assigning onto the real
  // URL keeps `new URL(...)` (used by api-client.ts) working.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
}

function renderEditor(variant: AdminVariantDto = VARIANT) {
  return renderWithProviders(<AdminVariantsEditor productId={PRODUCT_ID} variants={[variant]} />);
}

const EXISTING_IMAGE = {
  id: "image-0",
  variantId: VARIANT.id,
  cloudinaryPublicId: "soluciones-opticas/test/products/product-1/variant-1/existing",
  alt: "Foto existente",
  sortOrder: 0,
  isPrimary: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("Admin product image upload", () => {
  it("shows a clear upload zone whose visible button is the real file input's label", () => {
    renderEditor();

    expect(screen.getByText("Agregá fotos de este producto")).toBeInTheDocument();
    const input = fileInput();
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(input).toHaveAccessibleDescription(
      expect.stringMatching(/Agregá fotos de este producto.*JPEG, PNG o WebP · hasta 8 MB/),
    );
  });

  it("opens the native file picker when the visible button is clicked", async () => {
    renderEditor();
    const onPickerClick = vi.fn();
    fileInput().addEventListener("click", onPickerClick);

    await userEvent.click(screen.getByText("Seleccionar imagen"));

    expect(onPickerClick).toHaveBeenCalledTimes(1);
  });

  it("is reachable with the keyboard (the real input takes focus)", async () => {
    renderEditor();
    const input = fileInput();
    for (let i = 0; i < 20 && document.activeElement !== input; i += 1) {
      await userEvent.tab();
    }
    expect(input).toHaveFocus();
  });

  it("rejects an invalid file type client-side, before any network call", async () => {
    const fetchMock = mockThreeStepUploadFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderEditor();

    attachFile(fileInput(), makeFile("doc.pdf", "application/pdf", 1000));

    expect(await screen.findByRole("alert")).toHaveTextContent(/formato de imagen no admitido/i);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Subir imagen" })).not.toBeInTheDocument();
  });

  it("rejects an oversized file client-side, before any network call", async () => {
    const fetchMock = mockThreeStepUploadFetch();
    vi.stubGlobal("fetch", fetchMock);
    renderEditor();

    attachFile(fileInput(), makeFile("huge.jpg", "image/jpeg", 9 * 1024 * 1024));

    expect(await screen.findByRole("alert")).toHaveTextContent(/supera el tamaño permitido/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("previews the selected image with its name and size, and keeps it if the picker is cancelled", async () => {
    stubObjectUrls();
    renderEditor();

    attachFile(fileInput(), makeFile("frente-negro.jpg", "image/jpeg", 300 * 1024));

    expect(await screen.findByAltText("Vista previa de la imagen seleccionada")).toHaveAttribute(
      "src",
      "blob:preview",
    );
    expect(screen.getByText("frente-negro.jpg")).toBeInTheDocument();
    expect(screen.getByText("300 KB")).toBeInTheDocument();
    // Same real input, now named for what clicking it does next.
    expect(screen.getByLabelText("Cambiar imagen")).toHaveAttribute("type", "file");

    // Cancelling the native picker fires `change` with no file.
    Object.defineProperty(screen.getByLabelText("Cambiar imagen"), "files", {
      value: [],
      configurable: true,
    });
    fireEvent.change(screen.getByLabelText("Cambiar imagen"));
    expect(screen.getByText("frente-negro.jpg")).toBeInTheDocument();
  });

  it("'Quitar' clears the selection", async () => {
    stubObjectUrls();
    renderEditor();
    attachFile(fileInput(), makeFile("frame.jpg", "image/jpeg", 1000));

    await userEvent.click(await screen.findByRole("button", { name: "Quitar" }));

    expect(screen.queryByText("frame.jpg")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Seleccionar imagen")).toHaveValue("");
  });

  it("completes sign → Cloudinary → register, confirms success and clears the selection", async () => {
    const user = userEvent.setup();
    const fetchMock = mockThreeStepUploadFetch();
    vi.stubGlobal("fetch", fetchMock);
    stubObjectUrls();
    renderEditor();

    attachFile(fileInput(), makeFile("frame.jpg", "image/jpeg", 1000));
    await user.type(await screen.findByLabelText("Descripción de la foto"), "Foto frontal");
    await user.click(screen.getByRole("button", { name: "Subir imagen" }));

    expect(await screen.findByText("Imagen subida correctamente.")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Estado de la carga" })).toHaveTextContent(
      "Imagen subida correctamente.",
    );
    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes("/images/sign-upload"))).toBe(true);
    expect(urls.some((url) => url.startsWith("https://api.cloudinary.com/"))).toBe(true);
    const register = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/images") && call[1]?.method === "POST",
    );
    expect(JSON.parse(register![1].body as string)).toEqual({
      cloudinaryPublicId: "soluciones-opticas/test/products/product-1/variant-1/uuid",
      alt: "Foto frontal",
      isPrimary: true,
    });
    expect(screen.queryByText("frame.jpg")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Descripción de la foto")).not.toBeInTheDocument();
    expect(fileInput()).toHaveValue("");
  });

  it("does not mark later images as primary", async () => {
    const user = userEvent.setup();
    const fetchMock = mockThreeStepUploadFetch();
    vi.stubGlobal("fetch", fetchMock);
    stubObjectUrls();
    renderEditor({ ...VARIANT, images: [EXISTING_IMAGE] });

    attachFile(fileInput(), makeFile("lateral.jpg", "image/jpeg", 1000));
    await user.type(await screen.findByLabelText("Descripción de la foto"), "Vista lateral");
    await user.click(screen.getByRole("button", { name: "Subir imagen" }));

    await screen.findByText("Imagen subida correctamente.");
    const register = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/images") && call[1]?.method === "POST",
    );
    expect(JSON.parse(register![1].body as string).isPrimary).toBe(false);
  });

  it("needs a photo description before uploading", async () => {
    stubObjectUrls();
    renderEditor();
    attachFile(fileInput(), makeFile("frame.jpg", "image/jpeg", 1000));

    const submit = await screen.findByRole("button", { name: "Subir imagen" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Descripción de la foto"), "   ");
    expect(submit).toBeDisabled();
  });

  it("shows a Spanish error (never Cloudinary's own text) and a retry that keeps the form", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", mockThreeStepUploadFetch({ cloudinaryOk: false }));
    stubObjectUrls();
    renderEditor();

    attachFile(fileInput(), makeFile("frame.jpg", "image/jpeg", 1000));
    await user.type(await screen.findByLabelText("Descripción de la foto"), "Foto frontal");
    await user.click(screen.getByRole("button", { name: "Subir imagen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos subir la imagen. Probá de nuevo o elegí otra foto (JPEG, PNG o WebP).",
    );
    expect(screen.queryByText(/invalid image file/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
    expect(screen.getByLabelText("Descripción de la foto")).toHaveValue("Foto frontal");
    expect(screen.getByText("frame.jpg")).toBeInTheDocument();
  });

  it("never shows a 5xx body when registering the image fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", mockThreeStepUploadFetch({ confirmOk: false }));
    stubObjectUrls();
    renderEditor();

    attachFile(fileInput(), makeFile("frame.jpg", "image/jpeg", 1000));
    await user.type(await screen.findByLabelText("Descripción de la foto"), "Foto frontal");
    await user.click(screen.getByRole("button", { name: "Subir imagen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/No pudimos subir la imagen/);
  });

  it("explains a connection problem", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", mockThreeStepUploadFetch({ networkDown: true }));
    stubObjectUrls();
    renderEditor();

    attachFile(fileInput(), makeFile("frame.jpg", "image/jpeg", 1000));
    await user.type(await screen.findByLabelText("Descripción de la foto"), "Foto frontal");
    await user.click(screen.getByRole("button", { name: "Subir imagen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos conectarnos para subir la imagen. Revisá tu conexión e intentá de nuevo.",
    );
  });

  it("shows a loading state and starts a single upload on a double submit", async () => {
    const user = userEvent.setup();
    let releaseSign: () => void = () => {};
    const base = mockThreeStepUploadFetch();
    const fetchMock = vi.fn((url: string | URL, init?: RequestInit) =>
      String(url).includes("sign-upload")
        ? new Promise((resolve) => {
            releaseSign = () => resolve(base(url, init));
          })
        : base(url, init),
    );
    vi.stubGlobal("fetch", fetchMock);
    stubObjectUrls();
    renderEditor();

    attachFile(fileInput(), makeFile("frame.jpg", "image/jpeg", 1000));
    await user.type(await screen.findByLabelText("Descripción de la foto"), "Foto frontal");
    await user.dblClick(screen.getByRole("button", { name: "Subir imagen" }));
    fireEvent.submit(screen.getByRole("button", { name: "Subiendo…" }).closest("form")!);

    expect(screen.getByRole("button", { name: "Subiendo…" })).toBeDisabled();
    expect(screen.getByRole("status", { name: "Estado de la carga" })).toHaveTextContent(
      "Subiendo imagen…",
    );
    expect(screen.getByLabelText("Cambiar imagen")).toBeDisabled();
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).includes("sign-upload")),
    ).toHaveLength(1);

    releaseSign();
    expect(await screen.findByText("Imagen subida correctamente.")).toBeInTheDocument();
  });

  it("accepts a dropped image", async () => {
    stubObjectUrls();
    renderEditor();
    const zone = screen.getByText("Agregá fotos de este producto").closest("label")!;

    fireEvent.drop(zone, {
      dataTransfer: { files: [makeFile("arrastrada.png", "image/png", 2000)] },
    });

    expect(await screen.findByText("arrastrada.png")).toBeInTheDocument();
  });
});
