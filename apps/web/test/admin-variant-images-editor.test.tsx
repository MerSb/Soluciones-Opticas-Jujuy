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

  it("disables impossible moves", () => {
    renderEditor([A, B, C]);
    expect(screen.getByRole("button", { name: "Subir «Frente»" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bajar «Frente»" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Subir «Detalle»" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Bajar «Detalle»" })).toBeDisabled();
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

    await userEvent.click(screen.getByRole("button", { name: "Bajar «Frente»" }));

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain(`${BASE}/order`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ imageIds: ["b", "a", "c"] });
    // While saving: nothing moved, every control is locked, progress is announced.
    expect(order()).toEqual(before);
    expect(screen.getByRole("button", { name: "Subir «Detalle»" })).toBeDisabled();
    expect(screen.getByRole("status", { name: "Estado de las fotos" })).toHaveTextContent(
      "Guardando el orden…",
    );

    release(
      json(200, [
        { ...B, sortOrder: 0 },
        { ...A, sortOrder: 1 },
        { ...C, sortOrder: 2 },
      ]),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Subir «Detalle»" })).toBeEnabled(),
    );
    expect(order()).toEqual(before); // still the old props: no optimistic reorder

    view.refetchWith([
      { ...B, sortOrder: 0 },
      { ...A, sortOrder: 1 },
      { ...C, sortOrder: 2 },
    ]);

    expect(
      await screen.findByText(/Orden guardado: «Frente» quedó en la posición 2 de 3\./),
    ).toBeInTheDocument();
    expect(within(rows()[1]!).getByText("Frente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bajar «Frente»" })).toHaveFocus();
  });

  it("moves focus to the other arrow when the moved photo reaches an end", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(200, [])));
    const view = renderEditor([A, B, C]);

    await userEvent.click(screen.getByRole("button", { name: "Subir «Perfil»" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Bajar «Perfil»" })).toBeEnabled(),
    );
    view.refetchWith([{ ...B, sortOrder: 0 }, { ...A, sortOrder: 1 }, C]);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Bajar «Perfil»" })).toHaveFocus(),
    );
    expect(screen.getByRole("button", { name: "Subir «Perfil»" })).toBeDisabled();
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

  it("marks another photo as primary and confirms it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { ...B, isPrimary: true }));
    vi.stubGlobal("fetch", fetchMock);
    renderEditor([A, B, C]);

    await userEvent.click(
      screen.getByRole("button", { name: "Marcar «Perfil» como foto principal" }),
    );

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toContain(`${BASE}/b`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ isPrimary: true });
    expect(
      await screen.findByText("«Perfil» es ahora la foto principal del catálogo."),
    ).toBeInTheDocument();
  });

  it("warns that deleting the primary promotes the next photo, and does nothing if cancelled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderEditor([A, B, C]);

    await userEvent.click(screen.getByRole("button", { name: "Eliminar «Frente»" }));

    expect(confirm.mock.calls[0]![0]).toBe(
      "¿Eliminar la foto «Frente»? Es la foto principal: la siguiente foto del orden pasará a ser la principal. Esta acción no se puede deshacer.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
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
