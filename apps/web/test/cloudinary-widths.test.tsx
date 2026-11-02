import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CLOUDINARY_WIDTHS, THUMBNAIL_WIDTH, buildCloudinaryZoomUrl } from "../src/lib/cloudinary";
import { ProductDetailPage } from "../src/pages/ProductDetailPage";
import { ProductCard } from "../src/components/products/ProductCard";

// One short ladder of widths (docs/audits/cloudinary-transformaciones.md):
// every distinct width × format is a derived asset Cloudinary generates and
// counts, so the web only asks for 160, 480, 640, 1200 and the zoom — all
// of them widths that already existed before the ladder was cut down.

vi.mock("../src/lib/env", () => ({
  env: { apiBaseUrl: "http://localhost:3001", cloudinaryCloudName: "demo" },
}));

const LADDER = [160, 480, 640, 1200];
const transformation = (url: string) => url.match(/\/image\/upload\/([^/]+)\//)?.[1] ?? "(none)";
const allUrls = (container: HTMLElement) =>
  [...container.querySelectorAll("img")]
    .flatMap((img) => [
      img.getAttribute("src") ?? "",
      ...(img.getAttribute("srcset") ?? "")
        // Entries are separated by ", " (the URLs themselves contain commas).
        .split(/,\s+/)
        .map((part) => part.trim().split(" ")[0]!)
        .filter(Boolean),
    ])
    .filter((url) => url.startsWith("https://res.cloudinary.com/"));

const image = (publicId: string, isPrimary = false) => ({
  publicId,
  alt: `Foto ${publicId}`,
  isPrimary,
});

const PRODUCT = {
  name: "Gatito QA",
  slug: "gatito-qa",
  brand: { name: "Marca QA", slug: "marca-qa" },
  category: { name: "Anteojos de Sol", slug: "anteojos-de-sol" },
  shape: "Cat-eye",
  styles: [],
  price: 45000,
  frameMeasurements: {
    lensWidth: null,
    bridgeWidth: null,
    templeLength: null,
    lensHeight: null,
    frameWidth: null,
  },
  lensTypes: [],
  variants: [
    {
      id: "v1",
      color: "Negro",
      material: "Acetato",
      label: null,
      colorTones: ["NEGRO"],
      sku: "QA-N1",
      price: 45000,
      inStock: true,
      images: [image("n-a"), image("n-b", true), image("n-c")],
    },
    {
      id: "v2",
      color: "Negro",
      material: "Metal",
      label: null,
      colorTones: ["NEGRO"],
      sku: "QA-N2",
      price: 45000,
      inStock: true,
      images: [image("m-a", true), image("m-b")],
    },
    {
      id: "v3",
      color: "Rojo",
      material: "Acetato",
      label: null,
      colorTones: ["ROJO"],
      sku: "QA-R",
      price: 45000,
      inStock: true,
      // No photo marked primary: the first one stands for it.
      images: [image("r-a"), image("r-b")],
    },
  ],
};

function renderDetail() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const path = new URL(url).pathname;
      const reply = (status: number, body: unknown) => ({
        ok: status < 400,
        status,
        json: async () => body,
      });
      if (path === "/api/auth/me" || path === "/api/auth/refresh") {
        return reply(401, { error: { code: "UNAUTHENTICATED", message: "No." } });
      }
      if (path === "/api/products/gatito-qa") return reply(200, PRODUCT);
      if (path.endsWith("/related")) return reply(200, []);
      return reply(404, { error: { code: "NOT_FOUND", message: "No." } });
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/products/:slug", element: <ProductDetailPage /> }], {
    initialEntries: ["/products/gatito-qa"],
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.head.querySelectorAll('script[type="application/ld+json"]').forEach((s) => s.remove());
});

describe("Cloudinary widths: one short ladder", () => {
  it("every context only uses 160, 480, 640 or 1200, and the zoom stays as it was", () => {
    const used = Object.values(CLOUDINARY_WIDTHS).flat();
    expect(used.every((width) => LADDER.includes(width))).toBe(true);
    expect(CLOUDINARY_WIDTHS).toEqual({
      card: [480, 640],
      detailMain: [640, 1200],
      detailThumbnail: [160],
      adminThumbnail: [160],
    });
    expect(THUMBNAIL_WIDTH).toBe(160);
    expect(buildCloudinaryZoomUrl("x/y")).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_2000/x/y",
    );
  });

  it("the product page asks only for the ladder: main 640/1200, thumbnails and color selector 160", async () => {
    const { container } = renderDetail();
    await screen.findByRole("heading", { level: 1, name: "Gatito QA" });
    // Two variants share «Negro»: the selector shows their photo (160).
    const selector = screen.getByRole("group", { name: "Elegir color" });
    const selectorImgs = within(selector).getAllByRole("presentation", { hidden: true });
    expect(selectorImgs.map((img) => transformation(img.getAttribute("src")!))).toEqual([
      "f_auto,q_auto,w_160",
      "f_auto,q_auto,w_160",
    ]);
    // The gallery opens on its first photo.
    const main = screen.getByRole("img", { name: "Foto n-a" });
    expect(main.getAttribute("srcset")).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_640/n-a 640w, " +
        "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1200/n-a 1200w",
    );
    expect(main.getAttribute("sizes")).toBe("(min-width: 1024px) 50vw, 100vw");
    const tabs = within(screen.getByRole("tablist", { name: "Imágenes del producto" }));
    for (const img of tabs.getAllByRole("presentation", { hidden: true })) {
      expect(img.getAttribute("srcset")).toMatch(/f_auto,q_auto,w_160\/[a-z-]+ 160w$/);
      expect(img).toHaveAttribute("loading", "lazy");
    }
    // Choosing another variant still only uses the ladder.
    await userEvent.click(within(selector).getByRole("button", { name: /Rojo/ }));
    await screen.findByRole("img", { name: "Foto r-a" });
    const strings = new Set(allUrls(container).map(transformation));
    expect([...strings].sort()).toEqual([
      "f_auto,q_auto,w_1200",
      "f_auto,q_auto,w_160",
      "f_auto,q_auto,w_640",
    ]);
  });

  it("structured data lists only each variant's main photo, at the same 1200 as og:image", async () => {
    renderDetail();
    await screen.findByRole("heading", { level: 1, name: "Gatito QA" });
    await waitFor(() =>
      expect(document.head.querySelector('script[type="application/ld+json"]')).not.toBeNull(),
    );
    const jsonLd = [...document.head.querySelectorAll('script[type="application/ld+json"]')]
      .flatMap((s) => [JSON.parse(s.textContent ?? "{}")].flat())
      .find((data) => data["@type"] === "Product");
    expect(jsonLd.image).toEqual([
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1200/n-b",
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1200/m-a",
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1200/r-a",
    ]);
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_1200/n-b",
    );
  });

  it("a catalog card offers 480 and 640, lazy, with the same sizes as before", () => {
    const router = createMemoryRouter(
      [
        {
          path: "/",
          element: (
            <ProductCard
              product={
                {
                  id: "p1",
                  name: "Gatito QA",
                  slug: "gatito-qa",
                  brand: { name: "Marca QA", slug: "marca-qa" },
                  category: { name: "Sol", slug: "sol" },
                  kind: "FRAME",
                  price: 45000,
                  minPrice: 45000,
                  maxPrice: 45000,
                  inStock: true,
                  colors: ["Negro"],
                  colorSwatches: [["NEGRO"]],
                  image: { publicId: "n-b", alt: "Gatito QA negro", isPrimary: true },
                  frameMeasurements: PRODUCT.frameMeasurements,
                  shape: "Cat-eye",
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any
              }
            />
          ),
        },
      ],
      { initialEntries: ["/"] },
    );
    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    const img = screen.getByRole("img", { name: "Gatito QA negro" });
    expect(img.getAttribute("srcset")).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_480/n-b 480w, " +
        "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_640/n-b 640w",
    );
    expect(img.getAttribute("src")).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_640/n-b",
    );
    expect(img.getAttribute("sizes")).toBe(
      "(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw",
    );
    expect(img).toHaveAttribute("loading", "lazy");
  });
});
