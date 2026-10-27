import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import middleware, { config } from "../middleware";

// Vercel Routing Middleware for product pages: a real 404 for a slug the
// API doesn't know, the SPA rewrite for everything else. Fictional slugs.

const SITE = "https://www.example.test";

function stub(api: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async () => api());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const isNext = (response: Response) => response.headers.get("x-middleware-next") === "1";
const get = (path: string, method = "GET") => middleware(new Request(`${SITE}${path}`, { method }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("product page middleware", () => {
  it("an existing product continues to the SPA rewrite (HTTP 200)", async () => {
    const fetchMock = stub(() => Response.json({ slug: "lente-qa" }));
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.test/");
    const response = await get("/products/lente-qa");
    expect(isNext(response)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/api/products/lente-qa",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it.each(["GET", "HEAD"])(
    "%s of a product the API doesn't know: internal rewrite to the 404 page, status 404",
    async (method) => {
      const fetchMock = stub(() =>
        Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 }),
      );
      const response = await get("/accesorios/no-existe-qa", method);
      expect(isNext(response)).toBe(false);
      expect(response.status).toBe(404);
      expect(response.headers.get("x-middleware-rewrite")).toBe(`${SITE}/404`);
      expect(response.headers.get("x-robots-tag")).toBe("noindex");
      expect(response.headers.get("cache-control")).toBe("no-store");
      // Only the API is called: no request to the site itself, which
      // Deployment Protection would block on previews.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["the API fails", () => Promise.reject(new TypeError("fetch failed"))],
    ["the API times out", () => Promise.reject(new DOMException("timeout", "TimeoutError"))],
    ["the API answers 500", () => new Response(null, { status: 500 })],
    ["the API answers 429", () => new Response(null, { status: 429 })],
  ])("fails open when %s: a real product never becomes a 404", async (_case, api) => {
    stub(api);
    expect(isNext(await get("/products/lente-qa"))).toBe(true);
  });

  it("only reads: other methods go straight through without calling the API", async () => {
    const fetchMock = stub(() => new Response(null, { status: 404 }));
    expect(isNext(await get("/products/lente-qa", "POST"))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs on the public product pages — exactly vercel.json's /spa rewrites — and /api/*", () => {
    const vercel = JSON.parse(readFileSync(resolve(__dirname, "../vercel.json"), "utf8")) as {
      rewrites: { source: string; destination: string }[];
    };
    const spa = vercel.rewrites.filter((r) => r.destination === "/spa").map((r) => r.source);
    // /api/* is the preview-only read proxy (test/preview-api.test.ts).
    expect([...config.matcher].sort()).toEqual([...spa, "/api/:path*"].sort());
    expect(config.runtime).toBe("nodejs");
  });

  it("relative imports in the deployed function files carry «.js» (Node ESM, no bundler)", () => {
    for (const file of ["../middleware.ts", "../preview-api.ts"]) {
      const source = readFileSync(resolve(__dirname, file), "utf8");
      const relative = [...source.matchAll(/from "(\.{1,2}\/[^"]+)"/g)].map((m) => m[1]);
      for (const specifier of relative) expect(specifier).toMatch(/\.js$/);
    }
  });
});
