import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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

function mockThreeStepUploadFetch({ cloudinaryOk = true, confirmOk = true } = {}) {
  return vi.fn().mockImplementation((rawUrl: string | URL, init?: RequestInit) => {
    const url = String(rawUrl);
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
          json: async () => ({ error: { message: "Formato inválido según Cloudinary." } }),
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

describe("Admin product image upload", () => {
  it("rejects an invalid file type client-side, before any network call", async () => {
    const fetchMock = mockThreeStepUploadFetch();
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<AdminVariantsEditor productId={PRODUCT_ID} variants={[VARIANT]} />);

    const input = screen.getByLabelText(/JPEG, PNG o WebP/i);
    const badFile = makeFile("doc.pdf", "application/pdf", 1000);
    attachFile(input, badFile);

    expect(await screen.findByText(/formato de imagen no admitido/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized file client-side, before any network call", async () => {
    const fetchMock = mockThreeStepUploadFetch();
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<AdminVariantsEditor productId={PRODUCT_ID} variants={[VARIANT]} />);

    const input = screen.getByLabelText(/JPEG, PNG o WebP/i);
    const hugeFile = makeFile("huge.jpg", "image/jpeg", 9 * 1024 * 1024);
    attachFile(input, hugeFile);

    expect(await screen.findByText(/supera el tamaño permitido/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a local preview for a valid file, and completes sign → upload → confirm", async () => {
    const user = userEvent.setup();
    const fetchMock = mockThreeStepUploadFetch();
    vi.stubGlobal("fetch", fetchMock);
    // Assigning directly onto the real URL constructor (jsdom has no
    // createObjectURL/revokeObjectURL of its own) rather than stubbing
    // the whole global — replacing `URL` itself would break every
    // `new URL(...)` call the app's own api-client.ts makes.
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();

    renderWithProviders(<AdminVariantsEditor productId={PRODUCT_ID} variants={[VARIANT]} />);

    const input = screen.getByLabelText(/JPEG, PNG o WebP/i);
    const goodFile = makeFile("frame.jpg", "image/jpeg", 1000);
    attachFile(input, goodFile);

    // Local preview appears immediately, before any upload starts.
    expect(await screen.findByAltText("")).toHaveAttribute("src", "blob:preview");

    await user.type(screen.getByLabelText("Texto alternativo"), "Foto frontal");
    await user.click(screen.getByRole("button", { name: "Subir imagen" }));

    await waitFor(() => {
      const signCall = fetchMock.mock.calls.find((call) => String(call[0]).includes("sign-upload"));
      expect(signCall).toBeDefined();
    });
    await waitFor(() => {
      const cloudinaryCall = fetchMock.mock.calls.find((call) =>
        String(call[0]).startsWith("https://api.cloudinary.com/"),
      );
      expect(cloudinaryCall).toBeDefined();
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Texto alternativo")).toHaveValue("");
    });
  });

  it("shows a friendly error and a manual retry button when the Cloudinary upload itself fails", async () => {
    const user = userEvent.setup();
    const fetchMock = mockThreeStepUploadFetch({ cloudinaryOk: false });
    vi.stubGlobal("fetch", fetchMock);
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();

    renderWithProviders(<AdminVariantsEditor productId={PRODUCT_ID} variants={[VARIANT]} />);

    attachFile(
      screen.getByLabelText(/JPEG, PNG o WebP/i),
      makeFile("frame.jpg", "image/jpeg", 1000),
    );
    await user.type(screen.getByLabelText("Texto alternativo"), "Foto frontal");
    await user.click(screen.getByRole("button", { name: "Subir imagen" }));

    expect(await screen.findByText(/formato inválido según cloudinary/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();

    // Alt text and the selected file are preserved across the failure —
    // a real admin shouldn't have to redo the whole form to retry (§70:
    // manual retry, not automatic, is enough for V1).
    expect(screen.getByLabelText("Texto alternativo")).toHaveValue("Foto frontal");
  });
});
