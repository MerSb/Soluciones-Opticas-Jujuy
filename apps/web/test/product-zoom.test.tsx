import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProductImageDto } from "@soluciones-opticas/shared";

// Roberto (2026-10-18): professional zoom on the product page — a 2× lens
// that follows the mouse, and an enlarged view (tap, click or keyboard)
// (Thumbnail tabs are matched by prefix: in this release the gallery's
// thumbnails still announce their alt twice — fixed separately.)
// with pinch, buttons and keys. Never an upscaled image, never fetched
// before the visitor zooms.

vi.mock("../src/lib/env", () => ({
  env: { apiBaseUrl: "http://localhost:3001", cloudinaryCloudName: "demo" },
}));

const { buildCloudinaryZoomUrl } = await import("../src/lib/cloudinary");
const { ProductGallery } = await import("../src/components/products/ProductGallery");

const IMAGES: ProductImageDto[] = [
  { publicId: "frames/rojo-frente", alt: "Cuadrado rojo de frente", isPrimary: true },
  { publicId: "frames/rojo-perfil", alt: "Cuadrado rojo de perfil", isPrimary: false },
];
const zoomUrl = (publicId: string) =>
  `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_2000/${publicId}`;
const lens = () => document.querySelector("img[data-zoom-lens]");

afterEach(() => {
  document.documentElement.style.overflow = "";
});

describe("zoom image URL", () => {
  it("asks Cloudinary for the largest real version, never an upscaled one", () => {
    expect(buildCloudinaryZoomUrl("frames/rojo-frente")).toBe(zoomUrl("frames/rojo-frente"));
  });
});

describe("hover lens (mouse)", () => {
  it("is not fetched until the mouse is over the photo, then follows the selected photo", async () => {
    render(<ProductGallery images={IMAGES} />);
    expect(lens()).toBeNull();

    const trigger = screen.getByRole("button", { name: "Ampliar foto: Cuadrado rojo de frente" });
    fireEvent.pointerEnter(trigger, { pointerType: "touch" });
    expect(lens()).toBeNull(); // touch never opens the lens (it scrolls or taps)

    fireEvent.pointerEnter(trigger, { pointerType: "mouse", clientX: 10, clientY: 10 });
    expect(lens()).toHaveAttribute("src", zoomUrl("frames/rojo-frente"));
    expect(lens()).toHaveAttribute("alt", ""); // decorative; the photo keeps its alt
    expect((lens() as HTMLElement).style.transform).toBe("scale(2)");
    // The main photo keeps its alt (outside the thumbnail tabs).
    const photos = screen.getAllByRole("img", { name: "Cuadrado rojo de frente" });
    expect(photos.some((img) => !img.closest('[role="tab"]'))).toBe(true);

    await userEvent.click(screen.getByRole("tab", { name: /^Cuadrado rojo de perfil/ }));
    expect(lens()).toBeNull(); // fresh zoom for the new photo
    fireEvent.pointerEnter(
      screen.getByRole("button", { name: "Ampliar foto: Cuadrado rojo de perfil" }),
      { pointerType: "mouse" },
    );
    expect(lens()).toHaveAttribute("src", zoomUrl("frames/rojo-perfil"));
  });

  it("without photos there is nothing to zoom: only the placeholder", () => {
    render(<ProductGallery images={[]} />);
    expect(screen.queryByRole("button", { name: /Ampliar foto/ })).toBeNull();
  });
});

describe("enlarged view", () => {
  it("opens from the keyboard, traps the page, zooms with buttons and keys, Escape returns focus", async () => {
    const user = userEvent.setup();
    render(<ProductGallery images={IMAGES} fit="contain" />);
    const trigger = screen.getByRole("button", { name: "Ampliar foto: Cuadrado rojo de frente" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");

    trigger.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Foto ampliada: Cuadrado rojo de frente" });
    expect(screen.getByRole("button", { name: /Cerrar/ })).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("hidden");

    // The large version is preloaded and swapped in once it arrives.
    const shown = dialog.querySelector("img[data-zoom-image]")!;
    expect(shown.getAttribute("src")).toContain("w_1200");
    fireEvent.load(dialog.querySelector("img[hidden]")!);
    expect(shown).toHaveAttribute("src", zoomUrl("frames/rojo-frente"));
    expect(shown).toHaveAttribute("alt", "Cuadrado rojo de frente");

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Zoom 100 %");
    expect(screen.getByRole("button", { name: "Alejar" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Acercar" }));
    expect(status).toHaveTextContent("Zoom 150 %");
    await user.keyboard("+");
    expect(status).toHaveTextContent("Zoom 225 %");
    await user.keyboard("0");
    expect(status).toHaveTextContent("Zoom 100 %");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("opens with a tap or click on the photo and closes with the visible button", async () => {
    const user = userEvent.setup();
    render(<ProductGallery images={IMAGES} />);
    await user.click(screen.getByRole("tab", { name: /^Cuadrado rojo de perfil/ }));
    await user.click(screen.getByRole("button", { name: "Ampliar foto: Cuadrado rojo de perfil" }));
    expect(
      screen.getByRole("dialog", { name: "Foto ampliada: Cuadrado rojo de perfil" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Cerrar/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // A tap right after dragging the photo gets no synthetic click in Chrome:
  // Cerrar closes on touchend itself (and cancels the late click).
  it("Cerrar closes on touch end, without waiting for a click, and returns focus", async () => {
    const user = userEvent.setup();
    render(<ProductGallery images={IMAGES} />);
    const trigger = screen.getByRole("button", { name: "Ampliar foto: Cuadrado rojo de frente" });
    await user.click(trigger);
    const close = screen.getByRole("button", { name: /Cerrar/ });
    // jsdom lays out nothing: the button's box is 0×0 at (0, 0).
    fireEvent.touchStart(close, {
      touches: [{ identifier: 7, clientX: 0, clientY: 0 }],
      changedTouches: [{ identifier: 7, clientX: 0, clientY: 0 }],
    });
    const notCancelled = fireEvent.touchEnd(close, {
      changedTouches: [{ identifier: 7, clientX: 0, clientY: 0 }],
    });
    expect(notCancelled).toBe(false); // preventDefault: no late click on the page
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("a touch that slides off Cerrar does not close the view", async () => {
    const user = userEvent.setup();
    render(<ProductGallery images={IMAGES} />);
    await user.click(screen.getByRole("button", { name: "Ampliar foto: Cuadrado rojo de frente" }));
    const close = screen.getByRole("button", { name: /Cerrar/ });
    fireEvent.touchStart(close, {
      touches: [{ identifier: 3, clientX: 0, clientY: 0 }],
      changedTouches: [{ identifier: 3, clientX: 0, clientY: 0 }],
    });
    fireEvent.touchEnd(close, { changedTouches: [{ identifier: 3, clientX: 80, clientY: 120 }] });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
