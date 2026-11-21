import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminImageDto, ProductImageDto } from "@soluciones-opticas/shared";

// Roberto (2026-11-21): check each photo in large before saving it, and
// the saved ones too, without going back to the folders on his computer.
// The enlarged view walks through the photos (‹ ›, ← →, "Imagen X de N"),
// never changes numbering, order or primary, and never asks Cloudinary for
// anything but the photo on screen.

vi.mock("../src/lib/env", () => ({
  env: { apiBaseUrl: "http://localhost:3001", cloudinaryCloudName: "demo" },
}));

const { ProductImageLightbox } = await import("../src/components/products/ProductImageLightbox");
const { ImageGalleryLightbox } = await import("../src/components/products/ImageGalleryLightbox");
const { PhotoSequencePicker, usePhotoSequence, formatFileSize } =
  await import("../src/components/admin/PhotoSequencePicker");
const { AdminVariantImagesEditor } = await import("../src/pages/admin/AdminVariantImagesEditor");
const { ProductGallery } = await import("../src/components/products/ProductGallery");

const zoomUrl = (publicId: string) =>
  `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_2000/${publicId}`;
const dialog = () => screen.getByRole("dialog");
const shownImage = () => dialog().querySelector<HTMLImageElement>("img[data-zoom-image]")!;
/** Every image URL the view put in the page (shown or preloading). */
const requestedSrcs = () =>
  [...dialog().querySelectorAll("img")].map((img) => img.getAttribute("src"));

let fetchCalls: { url: string; method: string }[] = [];
beforeEach(() => {
  fetchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), method: init?.method ?? "GET" });
      return { ok: true, status: 200, json: async () => ({}) };
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.documentElement.style.overflow = "";
});

const PHOTOS = [
  { src: "https://img.test/1.jpg", alt: "Frente", caption: "frente.jpg · 1,2 MB" },
  { src: "https://img.test/2.jpg", alt: "Perfil" },
  { src: "https://img.test/3.jpg", alt: "Detalle" },
];

describe("enlarged view with several photos", () => {
  it("says which photo it is and walks with ‹ › buttons, disabled at the ends", async () => {
    render(<ImageGalleryLightbox photos={PHOTOS} startIndex={0} onClose={() => {}} />);
    expect(within(dialog()).getByText("Imagen 1 de 3")).toBeInTheDocument();
    expect(within(dialog()).getByText("frente.jpg · 1,2 MB")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Foto anterior" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Foto siguiente" }));
    expect(within(dialog()).getByText("Imagen 2 de 3")).toBeInTheDocument();
    expect(shownImage()).toHaveAttribute("src", "https://img.test/2.jpg");
    expect(shownImage()).toHaveAttribute("alt", "Perfil");

    await userEvent.click(screen.getByRole("button", { name: "Foto siguiente" }));
    expect(within(dialog()).getByText("Imagen 3 de 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Foto siguiente" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Foto anterior" }));
    expect(within(dialog()).getByText("Imagen 2 de 3")).toBeInTheDocument();
  });

  it("starts at the photo that was clicked", () => {
    render(<ImageGalleryLightbox photos={PHOTOS} startIndex={2} onClose={() => {}} />);
    expect(within(dialog()).getByText("Imagen 3 de 3")).toBeInTheDocument();
    expect(shownImage()).toHaveAttribute("src", "https://img.test/3.jpg");
  });

  it("← → change the photo at 1×; zoomed, they move the photo instead", () => {
    render(<ImageGalleryLightbox photos={PHOTOS} startIndex={0} onClose={() => {}} />);
    fireEvent.keyDown(dialog(), { key: "ArrowRight" });
    expect(within(dialog()).getByText("Imagen 2 de 3")).toBeInTheDocument();
    fireEvent.keyDown(dialog(), { key: "ArrowLeft" });
    expect(within(dialog()).getByText("Imagen 1 de 3")).toBeInTheDocument();

    fireEvent.keyDown(dialog(), { key: "+" });
    expect(screen.getByText(/Zoom 150 %/)).toBeInTheDocument();
    fireEvent.keyDown(dialog(), { key: "ArrowRight" });
    expect(within(dialog()).getByText("Imagen 1 de 3")).toBeInTheDocument();
  });

  it("each photo starts at 1×", async () => {
    render(<ImageGalleryLightbox photos={PHOTOS} startIndex={0} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Acercar" }));
    expect(screen.getByText(/Zoom 150 %/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Foto siguiente" }));
    expect(screen.getByText(/Zoom 100 %/)).toBeInTheDocument();
  });

  it("only the photo on screen is requested: neighbours are never preloaded", async () => {
    render(<ImageGalleryLightbox photos={PHOTOS} startIndex={1} onClose={() => {}} />);
    expect(requestedSrcs()).toEqual(["https://img.test/2.jpg"]);
    await userEvent.click(screen.getByRole("button", { name: "Foto siguiente" }));
    expect(requestedSrcs()).toEqual(["https://img.test/3.jpg"]);
  });

  it("shows «Cargando foto…» until the photo arrives, and an error if it fails", () => {
    render(<ImageGalleryLightbox photos={PHOTOS} startIndex={0} onClose={() => {}} />);
    expect(within(dialog()).getByText("Cargando foto…")).toBeInTheDocument();
    fireEvent.load(shownImage());
    expect(within(dialog()).queryByText("Cargando foto…")).not.toBeInTheDocument();
    fireEvent.keyDown(dialog(), { key: "ArrowRight" });
    expect(within(dialog()).getByText("Cargando foto…")).toBeInTheDocument();
    fireEvent.error(shownImage());
    expect(within(dialog()).getByText("No se pudo cargar la foto.")).toBeInTheDocument();
  });

  it("with closeOnBackdrop, a click around the photo closes it — not on the photo, not while zoomed", () => {
    const onClose = vi.fn();
    render(
      <ImageGalleryLightbox photos={PHOTOS} startIndex={0} onClose={onClose} closeOnBackdrop />,
    );
    const stage = dialog().querySelector("[data-zoom-stage]")!;
    fireEvent.click(shownImage());
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog(), { key: "+" });
    fireEvent.click(stage);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog(), { key: "0" });
    fireEvent.click(stage);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes with Escape and with Cerrar", async () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <ImageGalleryLightbox photos={PHOTOS} startIndex={0} onClose={onClose} />,
    );
    fireEvent(dialog(), new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    const onClose2 = vi.fn();
    render(<ImageGalleryLightbox photos={PHOTOS} startIndex={0} onClose={onClose2} />);
    await userEvent.click(screen.getByRole("button", { name: /Cerrar/ }));
    expect(onClose2).toHaveBeenCalledTimes(1);
  });

  it("a single photo looks exactly as before: no arrows, no counter, no backdrop close", () => {
    const onClose = vi.fn();
    render(
      <ProductImageLightbox
        src="https://img.test/1.jpg"
        placeholderSrc={null}
        alt="Frente"
        onClose={onClose}
      />,
    );
    expect(screen.queryByRole("button", { name: "Foto siguiente" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Imagen 1 de/)).not.toBeInTheDocument();
    fireEvent.click(dialog().querySelector("[data-zoom-stage]")!);
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ── Before upload: the photos chosen from the computer ─────────────────

function file(name: string, bytes: number) {
  return new File([new Uint8Array(bytes)], name, { type: "image/jpeg", lastModified: 1 });
}

function Picker() {
  const sequence = usePhotoSequence();
  return <PhotoSequencePicker sequence={sequence} firstIsPrimary />;
}

describe("«Ver grande» before uploading", () => {
  let revoke: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    let n = 0;
    // jsdom has no object URLs: stand-ins that record their use.
    URL.createObjectURL = vi.fn(() => `blob:preview-${++n}`);
    revoke = vi.fn();
    URL.revokeObjectURL = revoke;
  });

  async function choose() {
    render(<Picker />);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(input, [file("frente.jpg", 1_300_000), file("perfil.jpg", 600_000)]);
    return revoke;
  }

  it("opens the local preview in large, with file name, size and place in the order — and never numbers it", async () => {
    await choose();
    const viewFrente = screen.getByRole("button", { name: "Ver grande «frente.jpg»" });
    await userEvent.click(viewFrente);

    expect(within(dialog()).getByText("Imagen 1 de 2")).toBeInTheDocument();
    expect(shownImage()).toHaveAttribute("src", "blob:preview-1");
    expect(within(dialog()).getByText("frente.jpg")).toBeInTheDocument();
    expect(within(dialog()).getByText(/1,2 MB · sin elegir: no se sube/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Foto siguiente" }));
    expect(within(dialog()).getByText("perfil.jpg")).toBeInTheDocument();
    expect(shownImage()).toHaveAttribute("src", "blob:preview-2");

    await userEvent.click(screen.getByRole("button", { name: /Cerrar/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^frente\.jpg: sin elegir/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(viewFrente).toHaveFocus();
  });

  it("keeps the selection and order, uploads nothing and keeps the previews alive", async () => {
    const revoke = await choose();
    await userEvent.click(screen.getByRole("button", { name: /^perfil\.jpg: sin elegir/ }));
    await userEvent.click(screen.getByRole("button", { name: /^frente\.jpg: sin elegir/ }));

    await userEvent.click(screen.getByRole("button", { name: "Ver grande «frente.jpg»" }));
    expect(within(dialog()).getByText(/número 2 del orden/)).toBeInTheDocument();
    fireEvent(dialog(), new Event("cancel", { cancelable: true }));

    expect(
      screen.getByRole("button", { name: /^perfil\.jpg: elegida, número 1, principal/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^frente\.jpg: elegida, número 2/ }),
    ).toBeInTheDocument();
    expect(fetchCalls).toEqual([]);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("«Orden final» opens the chosen photos in their upload order", async () => {
    await choose();
    await userEvent.click(screen.getByRole("button", { name: /^perfil\.jpg: sin elegir/ }));
    await userEvent.click(screen.getByRole("button", { name: /^frente\.jpg: sin elegir/ }));
    await userEvent.click(
      screen.getByRole("button", { name: "Ver grande la foto 2 del orden, «frente.jpg»" }),
    );
    expect(within(dialog()).getByText("Imagen 2 de 2")).toBeInTheDocument();
    expect(within(dialog()).getByText("frente.jpg")).toBeInTheDocument();
  });

  it("formats sizes the way Roberto reads them", () => {
    expect(formatFileSize(850 * 1024)).toBe("850 KB");
    expect(formatFileSize(2.4 * 1024 * 1024)).toBe("2,4 MB");
  });
});

// ── Saved photos in the admin ──────────────────────────────────────────

function savedImage(id: string, alt: string, sortOrder: number, isPrimary = false): AdminImageDto {
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

function renderEditor(images: AdminImageDto[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(
    <AdminVariantImagesEditor productId="p1" variantId="v1" images={images} altBase="Modelo" />,
    { wrapper },
  );
}

describe("saved photos in large", () => {
  const SAVED = [
    savedImage("a", "Frente", 0, true),
    savedImage("b", "Perfil", 1),
    savedImage("c", "Detalle", 2),
  ];

  it("opens the clicked photo at the store's zoom size and walks through the variant's photos", async () => {
    renderEditor(SAVED);
    await userEvent.click(screen.getByRole("button", { name: "Ver grande la foto 2, «Perfil»" }));
    expect(within(dialog()).getByText("Imagen 2 de 3")).toBeInTheDocument();
    expect(within(dialog()).getByText("Foto 2 en el orden de la ficha")).toBeInTheDocument();
    expect(requestedSrcs()).toContain(zoomUrl("test/b"));

    await userEvent.click(screen.getByRole("button", { name: "Foto anterior" }));
    expect(
      within(dialog()).getByText("Foto principal · la que se ve en el catálogo"),
    ).toBeInTheDocument();
    expect(requestedSrcs()).toContain(zoomUrl("test/a"));
  });

  it("never asks for the other photos in large, never writes, and leaves order and primary alone", async () => {
    renderEditor(SAVED);
    await userEvent.click(screen.getByRole("button", { name: "Ver grande la foto 1, «Frente»" }));
    const srcs = requestedSrcs();
    expect(srcs).not.toContain(zoomUrl("test/b"));
    expect(srcs).not.toContain(zoomUrl("test/c"));
    await userEvent.click(screen.getByRole("button", { name: "Foto siguiente" }));
    await userEvent.click(screen.getByRole("button", { name: /Cerrar/ }));

    expect(fetchCalls.filter((call) => call.method !== "GET")).toEqual([]);
    const items = within(
      screen.getByRole("list", { name: "Fotos de esta variante, en el orden en que se muestran" }),
    ).getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("data-image-id"))).toEqual(["a", "b", "c"]);
    expect(within(items[0]!).getByText("Principal")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver grande la foto 1, «Frente»" })).toHaveFocus();
  });
});

// ── Store: the product page gallery ────────────────────────────────────

describe("store gallery: arrows in the enlarged view", () => {
  const STORE: ProductImageDto[] = [
    { publicId: "frames/frente", alt: "Gatito de frente", isPrimary: true },
    { publicId: "frames/perfil", alt: "Gatito de perfil", isPrimary: false },
  ];

  it("walks through the product's photos; the page keeps the photo it had", async () => {
    render(<ProductGallery images={STORE} />);
    await userEvent.click(screen.getByRole("button", { name: "Ampliar foto: Gatito de frente" }));
    expect(within(dialog()).getByText("Imagen 1 de 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Foto siguiente" }));
    expect(shownImage()).toHaveAttribute("src", zoomUrl("frames/perfil"));
    await userEvent.click(screen.getByRole("button", { name: /Cerrar/ }));
    expect(screen.getByRole("tab", { name: "Gatito de frente" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("keeps its old behavior: a click around the photo does not close it", async () => {
    render(<ProductGallery images={STORE} />);
    await userEvent.click(screen.getByRole("button", { name: "Ampliar foto: Gatito de frente" }));
    fireEvent.click(dialog().querySelector("[data-zoom-stage]")!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("one photo: the enlarged view has no arrows", async () => {
    render(<ProductGallery images={[STORE[0]!]} />);
    await userEvent.click(screen.getByRole("button", { name: "Ampliar foto: Gatito de frente" }));
    expect(screen.queryByRole("button", { name: "Foto siguiente" })).not.toBeInTheDocument();
  });
});
