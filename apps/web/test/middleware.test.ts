import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import middleware, { config } from "../middleware";

// Vercel Routing Middleware for product pages: a real 404 for a slug the
// API doesn't know, the SPA rewrite for everything else. Fictional slugs.

const SHELL_404 = "<!doctype html><title>Página no encontrada</title><div id=root></div>";
const SITE = "https://www.example.test";

function stub(api: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url === `${SITE}/404`) {
      return new Response(SHELL_404, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-frame-options": "DENY",
          "x-content-type-options": "nosniff",
          "content-encoding": "br",
        },
      });
    }
    return api();
  });
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

  it("a product the API doesn't know is a real 404 with the 404 shell", async () => {
    stub(() => Response.json({ error: { code: "NOT_FOUND" } }, { status: 404 }));
    const response = await get("/accesorios/no-existe-qa");
    expect(isNext(response)).toBe(false);
    expect(response.status).toBe(404);
    expect(await response.text()).toBe(SHELL_404);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("HEAD gets the 404 status without a body", async () => {
    stub(() => new Response(null, { status: 404 }));
    const response = await get("/products/no-existe-qa", "HEAD");
    expect(response.status).toBe(404);
    expect(response.body).toBeNull();
  });

  it.each([
    ["the API fails", () => Promise.reject(new TypeError("fetch failed"))],
    ["the API times out", () => Promise.reject(new DOMException("timeout", "TimeoutError"))],
    ["the API answers 500", () => new Response(null, { status: 500 })],
    ["the API answers 429", () => new Response(null, { status: 429 })],
  ])("fails open when %s: a real product never becomes a 404", async (_case, api) => {
    stub(api);
    expect(isNext(await get("/products/lente-qa"))).toBe(true);
  });

  it("keeps the shell if the 404 page itself can't be read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) =>
        String(input) === `${SITE}/404`
          ? new Response(null, { status: 500 })
          : new Response(null, { status: 404 }),
      ),
    );
    expect(isNext(await get("/products/no-existe-qa"))).toBe(true);
  });

  it("only reads: other methods go straight through without calling the API", async () => {
    const fetchMock = stub(() => new Response(null, { status: 404 }));
    expect(isNext(await get("/products/lente-qa", "POST"))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs only on the public product pages — exactly vercel.json's /spa rewrites", () => {
    const vercel = JSON.parse(readFileSync(resolve(__dirname, "../vercel.json"), "utf8")) as {
      rewrites: { source: string; destination: string }[];
    };
    const spa = vercel.rewrites.filter((r) => r.destination === "/spa").map((r) => r.source);
    expect([...config.matcher].sort()).toEqual(spa.sort());
  });
});
