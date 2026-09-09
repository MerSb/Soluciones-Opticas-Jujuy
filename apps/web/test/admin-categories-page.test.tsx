import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminCategoriesPage } from "../src/pages/admin/AdminCategoriesPage";
import { renderWithProviders } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const EXISTING_CATEGORY = {
  id: "c1",
  name: "Deportivos",
  slug: "deportivos",
  productCount: 3,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("AdminCategoriesPage — destructive action confirmation", () => {
  it("requires confirmation before deleting a category, and never deletes if cancelled", async () => {
    const user = userEvent.setup();
    let deleteCalled = false;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((rawUrl: string | URL, init?: RequestInit) => {
        const url = String(rawUrl);
        const method = init?.method ?? "GET";
        if (url.includes("/api/admin/categories") && method === "GET") {
          return Promise.resolve({ ok: true, status: 200, json: async () => [EXISTING_CATEGORY] });
        }
        if (url.includes("/api/admin/categories/") && method === "DELETE") {
          deleteCalled = true;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ ...EXISTING_CATEGORY, deletedAt: "2026-02-01T00:00:00.000Z" }),
          });
        }
        return Promise.reject(new Error(`Unhandled request: ${method} ${url}`));
      }),
    );
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderWithProviders(<AdminCategoriesPage />);
    await user.click(await screen.findByRole("button", { name: "Eliminar" }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("Deportivos"));
    expect(deleteCalled).toBe(false);

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(deleteCalled).toBe(true));
  });
});
