import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ProductImageDto } from "@soluciones-opticas/shared";
import { ProductImage } from "../src/components/products/ProductImage";
import { ProductGallery } from "../src/components/products/ProductGallery";
import { ProductCardSkeleton } from "../src/components/products/ProductCardSkeleton";

// Audit points 10–12: LCP priority, layout stability, alt texts — with
// the accessory "contain" / frame "cover" framing kept as it is.

vi.mock("../src/lib/cloudinary", async (importOriginal) => ({
  CLOUDINARY_WIDTHS: (await importOriginal<typeof import("../src/lib/cloudinary")>())
    .CLOUDINARY_WIDTHS,
  buildCloudinaryUrl: (publicId: string, { width }: { width: number }) =>
    `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_${width}/${publicId}`,
  buildCloudinarySrcSet: (publicId: string) =>
    `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_320/${publicId} 320w`,
  buildCloudinaryZoomUrl: (publicId: string) =>
    `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_2000/${publicId}`,
}));

afterEach(() => vi.clearAllMocks());

describe("image loading", () => {
  it("lazy by default; the likely LCP image is fetched first", () => {
    const { rerender } = render(<ProductImage publicId="a" alt="Limpiador" widths={[320]} />);
    let img = screen.getByRole("img", { name: "Limpiador" });
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).not.toHaveAttribute("fetchpriority");
    rerender(<ProductImage publicId="a" alt="Limpiador" widths={[320]} priority fit="contain" />);
    img = screen.getByRole("img", { name: "Limpiador" });
    expect(img).toHaveAttribute("loading", "eager");
    expect(img).toHaveAttribute("fetchpriority", "high");
    expect(img).toHaveClass("object-contain"); // accessory framing kept
    expect(img.getAttribute("src")).toContain("f_auto,q_auto,w_320");
  });

  it("gallery thumbnails don't repeat the alt the button already announces", () => {
    const images: ProductImageDto[] = [
      { publicId: "p1", alt: "Estuche de frente", isPrimary: true },
      { publicId: "p2", alt: "Estuche abierto", isPrimary: false },
    ];
    render(<ProductGallery images={images} fit="contain" />);
    expect(screen.getByRole("img", { name: "Estuche de frente" })).toBeInTheDocument(); // main photo
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Estuche de frente", "Estuche abierto"]);
    for (const tab of tabs) expect(tab.querySelector("img")).toHaveAttribute("alt", "");
  });
});

describe("layout stability", () => {
  it("the card skeleton reserves the real card's lines (brand, name, price, colors)", () => {
    const { container } = render(<ProductCardSkeleton />);
    const lines = [...container.querySelectorAll(".p-4 > div")].map(
      (d) => d.className.match(/\bh-[\d.]+\b/)![0],
    );
    expect(lines).toEqual(["h-4", "h-6", "h-7", "h-3.5"]);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});
