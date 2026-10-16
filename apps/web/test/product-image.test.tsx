import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ProductListItem } from "@soluciones-opticas/shared";
import { ProductImage } from "../src/components/products/ProductImage";
import { ProductCard } from "../src/components/products/ProductCard";
import { renderWithProviders } from "./test-utils";

vi.mock("../src/lib/cloudinary", async (importOriginal) => ({
  CLOUDINARY_WIDTHS: (await importOriginal<typeof import("../src/lib/cloudinary")>())
    .CLOUDINARY_WIDTHS,
  buildCloudinaryUrl: vi.fn((publicId: string, { width }: { width: number }) =>
    publicId
      ? `https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_${width}/${publicId}`
      : null,
  ),
  buildCloudinarySrcSet: vi.fn((publicId: string) =>
    publicId ? `https://res.cloudinary.com/demo/image/upload/w_320/${publicId} 320w` : null,
  ),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("ProductImage", () => {
  it("renders the branded placeholder when there is no publicId", () => {
    render(<ProductImage publicId={null} alt="Sin imagen" widths={[320, 640]} />);
    expect(
      screen.getByRole("img", { name: /imagen del producto no disponible/i }),
    ).toBeInTheDocument();
  });

  it("renders a real <img> with src/srcSet/alt when a delivery URL is available", () => {
    render(<ProductImage publicId="some/id" alt="Andina Aviador" widths={[320, 640]} />);
    const img = screen.getByRole("img", { name: "Andina Aviador" });
    expect(img).toHaveAttribute(
      "src",
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_640/some/id",
    );
    expect(img).toHaveAttribute("srcset", expect.stringContaining("320w"));
  });

  it("lazy-loads by default but loads eagerly when eager is set (above-the-fold usage)", () => {
    const { rerender } = render(
      <ProductImage publicId="some/id" alt="Andina Aviador" widths={[320]} />,
    );
    expect(screen.getByRole("img")).toHaveAttribute("loading", "lazy");

    rerender(<ProductImage publicId="some/id" alt="Andina Aviador" widths={[320]} eager />);
    expect(screen.getByRole("img")).toHaveAttribute("loading", "eager");
  });

  it("falls back to the placeholder when the real image fails to load — never a broken-image icon", () => {
    render(<ProductImage publicId="some/id" alt="Andina Aviador" widths={[320]} />);
    const img = screen.getByRole("img", { name: "Andina Aviador" });

    fireEvent.error(img);

    expect(
      screen.getByRole("img", { name: /imagen del producto no disponible/i }),
    ).toBeInTheDocument();
    expect(screen.queryByAltText("Andina Aviador")).not.toBeInTheDocument();
  });
});

// Accessory framing: upright products (e.g. cleaner bottles) are shown
// whole on white; frames keep the full-bleed "cover" photo.
describe("ProductImage fit", () => {
  it("defaults to cover (frames): fills the frame, unchanged", () => {
    render(<ProductImage publicId="some/id" alt="Anteojo" widths={[320]} />);
    const img = screen.getByRole("img", { name: "Anteojo" });
    expect(img).toHaveClass("object-cover");
    expect(img).not.toHaveClass("object-contain");
    expect(img.parentElement).not.toHaveClass("bg-white");
  });

  it("contain: the whole product, centered on white with breathing room, same delivery URL", () => {
    render(<ProductImage publicId="some/id" alt="Limpiador" widths={[320]} fit="contain" />);
    const img = screen.getByRole("img", { name: "Limpiador" });
    expect(img).toHaveClass("h-full", "w-full", "object-contain", "object-center");
    expect(img).not.toHaveClass("object-cover");
    expect(img.parentElement).toHaveClass("bg-white", "flex", "items-center", "justify-center");
    expect(img).toHaveAttribute(
      "src",
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_320/some/id",
    );
  });
});

describe("ProductCard image framing", () => {
  const base: ProductListItem = {
    name: "Limpiador 40ml",
    slug: "limpiador-40ml",
    kind: "ACCESSORY",
    priceFrom: false,
    brand: { name: "Soluciones Opticas", slug: "soluciones-opticas" },
    category: { name: "Accesorios", slug: "accesorios" },
    shape: null,
    styles: [],
    inStock: true,
    price: 4000,
    frameMeasurements: {
      lensWidth: null,
      bridgeWidth: null,
      templeLength: null,
      lensHeight: null,
      frameWidth: null,
    },
    colors: [],
    image: { publicId: "acc/id", alt: "Limpiador 40ml", isPrimary: true },
  };

  it("accessory cards show the whole product and never zoom it", () => {
    renderWithProviders(<ProductCard product={base} />);
    const img = screen.getByRole("img", { name: "Limpiador 40ml" });
    expect(img).toHaveClass("object-contain");
    expect(img.parentElement!.className).not.toContain("scale");
    expect(screen.getByText("$ 4.000")).toBeInTheDocument();
  });

  it("frame cards keep cover and the hover zoom", () => {
    renderWithProviders(
      <ProductCard
        product={{
          ...base,
          kind: "FRAME",
          name: "Andina Aviador",
          slug: "andina-aviador",
          image: { publicId: "frame/id", alt: "Andina Aviador", isPrimary: true },
        }}
      />,
    );
    const img = screen.getByRole("img", { name: "Andina Aviador" });
    expect(img).toHaveClass("object-cover");
    expect(img.parentElement).toHaveClass("group-hover:scale-[1.02]");
  });
});
