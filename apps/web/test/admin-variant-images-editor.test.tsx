import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminImageDto } from "@soluciones-opticas/shared";
import { AdminVariantImagesEditor } from "../src/pages/admin/AdminVariantImagesEditor";

const BASE = "/api/admin/products/p1/variants/v1/images";

function image(id: string, alt: string, sortOrder: number, isPrimary = false): AdminImageDto {
  return {
    id,
    variantId: "v1",
    cloudinaryPublicId: `test/${id}`,
    alt,
    sortOrder,
    isPrimary,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

const A = image("a", "Frente", 0, true);
const B = image("b", "Perfil", 1);
const C = image("c", "Detalle", 2);

function json(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// Renders with a stable QueryClient so `rerender` can simulate the refetch
// that follows a successful mutation (the editor only shows what it is given).
function renderEditor(images: AdminImageDto[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(<AdminVariantImagesEditor productId="p1" variantId="v1" images={images} />, {
    wrapper,
  });
  return {
    ...view,
    refetchWith: (next: AdminImageDto[]) =>
      view.rerender(<AdminVariantImagesEditor productId="p1" variantId="v1" images={next} />),
  };
}

function rows() {
  return within(
    screen.getByRole("list", { name: "Fotos de esta variante, en el orden en que se muestran" }),
  ).getAllByRole("listitem");
}

function order() {
  return rows().map((row) => row.textContent);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AdminVariantImagesEditor", () => {
  it("lists photos in order with their position, the primary badge and specific action labels", () => {
    renderEditor([A, B, C]);

    expect(rows()).toHaveLength(3);
    expect(within(rows()[0]!).getByText("Foto 1 de 3")).toBeInTheDocument();
    expect(within(rows()[0]!).getByText("Principal")).toBeInTheDocument();
    expect(within(rows()[0]!).getByRole("img")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Marcar «Perfil» como foto principal" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Marcar «Frente» como foto principal" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "Eliminar «Detalle»" })).toBeEnabled();
  });

  it("disables moves past the ends, and locks moves that would take the primary out of first place", () => {
    renderEditor([A, B, C]);
    expect(screen.getByRole("button", { name: "Subir «Frente»" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar «Detalle»" })).toBeDisabled();

    // Still focusable (aria-disabled), with the rule as their description.
    for (const name of ["Bajar «Frente»", "Subir «Perfil»"]) {
      const locked = screen.getByRole("button", { name });
      expect(locked).not.toBeDisabled();
      expect(locked).toHaveAttribute("aria-disabled", "true");
      expect(locked).toHaveAccessibleDescription(/La foto principal siempre va primera/);
    }
    expect(screen.getByRole("button", { name: "Bajar «Perfil»" })).not.toHaveAttribute(
      "aria-disabled",
    );
    expect(screen.getByRole("button", { name: "Subir «Detalle»" })).not.toHaveAttribute(
      "aria-disabled",
    );
    expect(within(rows()[0]!).getByText("Siempre se muestra primera")).toBeInTheDocument();
  });

  it("explains instead of moving when a locked arrow is used, and calls no API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderEditor([A, B, C]);
    const before = order();

    await userEvent.click(screen.getByRole("button", { name: "Bajar «Frente»" }));
    expect(screen.getByRole("status", { name: "Estado de las fotos" })).toHaveTextContent(
      "La foto principal siempre va primera. Para cambiarla, usá «Marcar como principal» en otra foto.",
    );
    screen.getByRole("button", { name: "Subir «Perfil»" }).focus();
    await userEvent.keyboard("{Enter}");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(order()).toEqual(before);
  });

  it("sends the full new order, keeps showing the server's order until the refetch, then confirms and keeps focus on the moved photo", async () => {
    let release: (value: unknown) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const view = renderEditor([A, B, C]);
    const before = order();

    await userEvent.click(screen.getByRole("button", { name: "Bajar «Perfil»" }));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain(`${BASE}/order`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ imageIds: ["a", "c", "b"] });
    // While saving: nothing moved, every control is locked, progress is announced.
    expect(order()).toEqual(before);
    expect(screen.getByRole("button", { name: "Subir «Detalle»" })).toBeDisabled();
    expect(screen.getByRole("status", { name: "Estado de las fotos" })).toHaveTextContent(
      "Guardando el orden…",
    );

    const saved = [A, { ...C, sortOrder: 1 }, { ...B, sortOrder: 2 }];
    release(json(200, saved));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Subir «Detalle»" })).toBeEnabled(),
    );
    expect(order()).toEqual(before); // still the old props: no optimistic reorder
    expect(screen.queryByText(/Orden guardado/)).toBeNull();

    view.refetchWith(saved);

    expect(
      await screen.findByText(/Orden guardado: «Perfil» quedó en la posición 3 de 3\./),
    ).toBeInTheDocument();
    expect(within(rows()[2]!).getByText("Perfil")).toBeInTheDocument();
    // "Bajar" is impossible at the end, so focus lands on the other arrow.
    expect(screen.getByRole("button", { name: "Subir «Perfil»" })).toHaveFocus();
  });

  it("when a photo lands right under the primary, focus skips the locked arrow", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, [])));
    const view = renderEditor([A, B, C]);

    await userEvent.click(screen.getByRole("button", { name: "Subir «Detalle»" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Eliminar «Frente»" })).toBeEnabled(),
    );
    view.refetchWith([A, { ...C, sortOrder: 1 }, { ...B, sortOrder: 2 }]);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Bajar «Detalle»" })).toHaveFocus(),
    );
    expect(screen.getByRole("button", { name: "Subir «Detalle»" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("shows the API's reason when the order is rejected, and leaves the list untouched", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(409, {
          error: {
            code: "CONFLICT",
            message:
              "Las imágenes de esta variante cambiaron. Recargá la página e intentá ordenar de nuevo.",
          },
        }),
      ),
    );
    renderEditor([A, B, C]);
    const before = order();

    await userEvent.click(screen.getByRole("button", { name: "Bajar «Perfil»" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Recargá la página/);
    expect(order()).toEqual(before);
    expect(screen.queryByText(/Orden guardado/)).toBeNull();
  });

  it("never shows a 5xx body, and explains a connection problem", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          json(500, { error: { code: "INTERNAL_ERROR", message: "Something went wrong." } }),
        )
        .mockRejectedValueOnce(new TypeError("Failed to fetch")),
    );
    renderEditor([A, B, C]);

    await userEvent.click(screen.getByRole("button", { name: "Bajar «Perfil»" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos guardar el cambio. Intentá de nuevo.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Bajar «Perfil»" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos conectarnos. Revisá tu conexión e intentá de nuevo.",
    );
  });

  it("explains a 404 in Spanish instead of showing the API's generic English text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(404, {
          error: { code: "NOT_FOUND", message: "The requested resource was not found." },
        }),
      ),
    );
    renderEditor([A, B, C]);

    await userEvent.click(screen.getByRole("button", { name: "Bajar «Perfil»" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No encontramos esta foto o variante. Puede haber cambiado en otra pestaña: recargá la página.",
    );
  });

  it("marking a photo as primary moves it to the top: confirmed and focused only once the refreshed list shows it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { ...C, isPrimary: true, sortOrder: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    const view = renderEditor([A, B, C]);

    await userEvent.click(
      screen.getByRole("button", { name: "Marcar «Detalle» como foto principal" }),
    );

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain(`${BASE}/c`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ isPrimary: true });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Eliminar «Frente»" })).toBeEnabled(),
    );
    expect(screen.queryByText(/pasó al primer lugar/)).toBeNull();

    view.refetchWith([
      { ...C, isPrimary: true, sortOrder: 0 },
      { ...A, isPrimary: false, sortOrder: 1 },
      { ...B, sortOrder: 2 },
    ]);

    expect(
      await screen.findByText("«Detalle» es ahora la foto principal y pasó al primer lugar."),
    ).toBeInTheDocument();
    expect(within(rows()[0]!).getByText("Detalle")).toBeInTheDocument();
    expect(within(rows()[0]!).getByText("Principal")).toBeInTheDocument();
    expect(rows()[0]).toHaveFocus();
    expect(order().map((text) => text?.match(/Frente|Perfil|Detalle/)?.[0])).toEqual([
      "Detalle",
      "Frente",
      "Perfil",
    ]);
  });

  it("warns which photo becomes primary when deleting the primary, and does nothing if cancelled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderEditor([A, B, C]);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar «Frente»" }));

    expect(confirm.mock.calls[0]![0]).toBe(
      "¿Eliminar la foto «Frente»? Es la foto principal: «Perfil» pasará a ser la principal y quedará primera. Esta acción no se puede deshacer.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("confirms which photo became primary after deleting the primary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => null }),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditor([A, B, C]);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar «Frente»" }));

    expect(
      await screen.findByText(
        "Foto eliminada. «Perfil» es ahora la foto principal y quedó primera.",
      ),
    ).toBeInTheDocument();
  });

  it("deletes a secondary photo after confirmation with a plain warning", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => null });
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditor([A, B, C]);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar «Detalle»" }));

    expect(confirm.mock.calls[0]![0]).toBe(
      "¿Eliminar la foto «Detalle»? Esta acción no se puede deshacer.",
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain(`${BASE}/c`);
    expect(init.method).toBe("DELETE");
    expect(await screen.findByText("Foto eliminada.")).toBeInTheDocument();
  });

  it("shows 'Eliminando…' and locks every control while a delete is in flight", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderEditor([A, B]);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar «Perfil»" }));

    expect(screen.getByRole("button", { name: "Eliminar «Perfil»" })).toHaveTextContent(
      "Eliminando…",
    );
    expect(screen.getByRole("button", { name: "Eliminar «Frente»" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar «Frente»" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Marcar «Perfil» como foto principal" }),
    ).toBeDisabled();
  });

  it("shows an empty state and the upload zone when there are no photos", () => {
    renderEditor([]);
    expect(screen.getByText("Todavía no hay imágenes para esta variante.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByLabelText("Seleccionar imagen")).toHaveAttribute("type", "file");
  });
});
