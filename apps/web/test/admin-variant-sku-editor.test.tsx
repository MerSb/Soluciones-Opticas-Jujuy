import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminVariantDto } from "@soluciones-opticas/shared";
import { AdminVariantsEditor } from "../src/pages/admin/AdminVariantsEditor";
import { renderWithProviders } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const FRAME_VARIANT: AdminVariantDto = {
  id: "v1",
  productId: "p1",
  color: "Negro",
  material: "Metal",
  label: null,
  sku: "SKU-1",
  stock: 5,
  priceOverride: null,
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
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ACCESSORY_VARIANT: AdminVariantDto = {
  ...FRAME_VARIANT,
  color: "Rojo",
  material: null,
  label: "Grande",
  sku: "EST-ROJO",
  stock: 3,
  priceOverride: 2500,
};

type PatchReply = "ok" | "conflict" | "network";

// Records every PATCH body; the reply is the variant with the new SKU,
// exactly as the API answers it.
function stubPatch(reply: PatchReply = "ok") {
  const bodies: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const method = init?.method ?? "GET";
      if (path === "/api/admin/products/p1/variants/v1" && method === "PATCH") {
        const body = JSON.parse(String(init!.body)) as { sku: string };
        bodies.push(body);
        if (reply === "network") throw new TypeError("Failed to fetch");
        if (reply === "conflict") {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              error: { code: "CONFLICT", message: `El SKU "${body.sku}" ya está en uso.` },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...FRAME_VARIANT, sku: body.sku }),
        };
      }
      throw new Error(`Unhandled request: ${method} ${path}`);
    }),
  );
  return bodies;
}

function renderFrame() {
  renderWithProviders(<AdminVariantsEditor productId="p1" variants={[FRAME_VARIANT]} />);
}

async function openEditor(currentSku = "SKU-1") {
  await userEvent.click(screen.getByRole("button", { name: `Editar SKU ${currentSku}` }));
  return screen.getByLabelText("Nuevo SKU");
}

describe("Editar SKU — anteojos", () => {
  it("saves only the trimmed SKU after confirming, and says so", async () => {
    const bodies = stubPatch();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderFrame();

    const input = await openEditor();
    await userEvent.clear(input);
    await userEvent.type(input, "  SKU-1-OK  ");
    await userEvent.click(screen.getByRole("button", { name: "Guardar SKU" }));

    await waitFor(() => expect(bodies).toEqual([{ sku: "SKU-1-OK" }]));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("«SKU-1» por «SKU-1-OK»"));
    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("dejará de aparecer en las búsquedas"),
    );
    expect(await screen.findByText("SKU actualizado a «SKU-1-OK».")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nuevo SKU")).not.toBeInTheDocument();
    // Stock is untouched: the field keeps its value and nothing else was sent.
    expect(screen.getByLabelText("Stock de SKU-1")).toHaveValue(5);
  });

  it("declining the confirmation sends nothing and keeps the draft open", async () => {
    const bodies = stubPatch();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderFrame();

    const input = await openEditor();
    await userEvent.clear(input);
    await userEvent.type(input, "OTRO");
    await userEvent.click(screen.getByRole("button", { name: "Guardar SKU" }));

    expect(bodies).toEqual([]);
    expect(screen.getByLabelText("Nuevo SKU")).toHaveValue("OTRO");
  });

  it("Cancelar closes the editor without any request and keeps the SKU", async () => {
    const bodies = stubPatch();
    const confirmSpy = vi.spyOn(window, "confirm");
    renderFrame();

    const input = await openEditor();
    await userEvent.clear(input);
    await userEvent.type(input, "OTRO");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(bodies).toEqual([]);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nuevo SKU")).not.toBeInTheDocument();
    expect(screen.getByText("SKU: SKU-1")).toBeInTheDocument();
    // Reopening starts again from the saved SKU, not the discarded draft.
    expect(await openEditor()).toHaveValue("SKU-1");
  });

  it("an empty or blank SKU cannot be saved", async () => {
    const bodies = stubPatch();
    renderFrame();

    const input = await openEditor();
    await userEvent.clear(input);
    await userEvent.type(input, "   ");

    expect(screen.getByRole("alert")).toHaveTextContent("Ingresá el SKU.");
    expect(screen.getByRole("button", { name: "Guardar SKU" })).toBeDisabled();
    fireEvent.submit(input.closest("form")!);
    expect(bodies).toEqual([]);
  });

  it("an SKU over 100 characters cannot be saved", async () => {
    const bodies = stubPatch();
    renderFrame();

    const input = await openEditor();
    expect(input).toHaveAttribute("maxLength", "100");
    // A paste can bypass maxLength in some browsers; the check still holds.
    fireEvent.change(input, { target: { value: "A".repeat(101) } });

    expect(screen.getByRole("alert")).toHaveTextContent("hasta 100 caracteres");
    expect(screen.getByRole("button", { name: "Guardar SKU" })).toBeDisabled();
    fireEvent.submit(input.closest("form")!);
    expect(bodies).toEqual([]);
  });

  it("an unchanged SKU (even with extra spaces) sends nothing", async () => {
    const bodies = stubPatch();
    const confirmSpy = vi.spyOn(window, "confirm");
    renderFrame();

    const input = await openEditor();
    await userEvent.type(input, "  ");

    expect(screen.getByRole("button", { name: "Guardar SKU" })).toBeDisabled();
    fireEvent.submit(input.closest("form")!);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(bodies).toEqual([]);
  });

  it("a 409 says the SKU is taken and that the current one is kept", async () => {
    stubPatch("conflict");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderFrame();

    const input = await openEditor();
    await userEvent.clear(input);
    await userEvent.type(input, "SKU-2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar SKU" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent('El SKU "SKU-2" ya está en uso.');
    expect(alert).toHaveTextContent("el SKU sigue siendo «SKU-1»");
    expect(screen.getByLabelText("Nuevo SKU")).toHaveValue("SKU-2");
    // The stock-save error line never shows for an SKU problem.
    expect(screen.queryByText(/No pudimos guardar el stock/)).not.toBeInTheDocument();
  });

  it("a network failure shows a connection message and keeps the draft", async () => {
    stubPatch("network");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderFrame();

    const input = await openEditor();
    await userEvent.clear(input);
    await userEvent.type(input, "SKU-2");
    await userEvent.click(screen.getByRole("button", { name: "Guardar SKU" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Revisá la conexión");
    expect(screen.getByLabelText("Nuevo SKU")).toHaveValue("SKU-2");
    expect(screen.queryByText(/SKU actualizado/)).not.toBeInTheDocument();
  });
});

describe("Editar SKU — accesorios", () => {
  it("saves only the SKU, leaving presentation, price and stock as they are", async () => {
    const bodies = stubPatch();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithProviders(
      <AdminVariantsEditor productId="p1" variants={[ACCESSORY_VARIANT]} kind="ACCESSORY" />,
    );

    const card = screen.getByRole("button", { name: "Editar SKU EST-ROJO" }).closest(".border")!;
    const input = await openEditor("EST-ROJO");
    await userEvent.clear(input);
    await userEvent.type(input, "EST-ROJO-G");
    await userEvent.click(screen.getByRole("button", { name: "Guardar SKU" }));

    await waitFor(() => expect(bodies).toEqual([{ sku: "EST-ROJO-G" }]));
    expect(await screen.findByText("SKU actualizado a «EST-ROJO-G».")).toBeInTheDocument();
    const inCard = within(card as HTMLElement);
    expect(inCard.getByLabelText("Presentación")).toHaveValue("Grande");
    expect(inCard.getByLabelText("Precio propio")).toHaveValue(2500);
    expect(inCard.getByLabelText("Stock")).toHaveValue(3);
    // The card's own "Guardar" stays disabled: nothing else changed.
    expect(inCard.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("a 409 on an accessory shows the same clear message", async () => {
    stubPatch("conflict");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithProviders(
      <AdminVariantsEditor productId="p1" variants={[ACCESSORY_VARIANT]} kind="ACCESSORY" />,
    );

    const input = await openEditor("EST-ROJO");
    await userEvent.clear(input);
    await userEvent.type(input, "EST-AZUL");
    await userEvent.click(screen.getByRole("button", { name: "Guardar SKU" }));

    expect(await screen.findByRole("alert")).toHaveTextContent('El SKU "EST-AZUL" ya está en uso.');
  });
});
