import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProductImage } from "../src/components/products/ProductImage";

vi.mock("../src/lib/cloudinary", () => ({
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
