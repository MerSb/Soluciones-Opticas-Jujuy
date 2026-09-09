import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminBrandsPage } from "../src/pages/admin/AdminBrandsPage";
import { renderWithProviders } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const EXISTING_BRAND = {
  id: "b1",
  name: "Andina Eyewear",
  slug: "andina-eyewear",
  logoPublicId: null,
  description: null,
  productCount: 2,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("AdminBrandsPage", () => {
  it("lists existing brands and creates a new one", async () => {
    const user = userEvent.setup();
    let brands = [EXISTING_BRAND];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((rawUrl: string | URL, init?: RequestInit) => {
        const url = String(rawUrl);
        const method = init?.method ?? "GET";
        if (url.includes("/api/admin/brands") && method === "GET") {
          return Promise.resolve({ ok: true, status: 200, json: async () => brands });
        }
        if (url.includes("/api/admin/brands") && method === "POST") {
          const body = JSON.parse(init!.body as string);
          const created = {
            id: "b2",
            name: body.name,
            slug: "nueva-marca",
            logoPublicId: null,
            description: body.description ?? null,
            productCount: 0,
            deletedAt: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          };
          brands = [...brands, created];
          return Promise.resolve({ ok: true, status: 201, json: async () => created });
        }
        return Promise.reject(new Error(`Unhandled request: ${method} ${url}`));
      }),
    );

    renderWithProviders(<AdminBrandsPage />);

    expect(await screen.findByText("Andina Eyewear")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Nombre"), "Nueva Marca");
    await user.click(screen.getByRole("button", { name: "Crear marca" }));

    expect(await screen.findByText("Nueva Marca")).toBeInTheDocument();
    // The create form clears after a successful submit.
    await waitFor(() => expect(screen.getByLabelText("Nombre")).toHaveValue(""));
  });

  it("requires confirmation before deleting a brand, and never deletes if cancelled", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((rawUrl: string | URL, init?: RequestInit) => {
        const url = String(rawUrl);
        const method = init?.method ?? "GET";
        if (url.includes("/api/admin/brands") && method === "GET") {
          return Promise.resolve({ ok: true, status: 200, json: async () => [EXISTING_BRAND] });
        }
        if (url.includes("/api/admin/brands/") && method === "DELETE") {
          deleteCalled = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ ...EXISTING_BRAND, deletedAt: "2026-02-01T00:00:00.000Z" }),
          });
        }
        return Promise.reject(new Error(`Unhandled request: ${method} ${url}`));
      }),
    );
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderWithProviders(<AdminBrandsPage />);
    await user.click(await screen.findByRole("button", { name: "Eliminar" }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Andina Eyewear"));
    expect(deleteCalled).toBe(false);

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(deleteCalled).toBe(true));
  });
});
