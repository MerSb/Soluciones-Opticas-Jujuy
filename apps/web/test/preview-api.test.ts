import { afterEach, describe, expect, it, vi } from "vitest";
import middleware from "../middleware";
import { isAllowedPreviewApiPath } from "../preview-api";

// Read-only /api/* proxy that only exists on Vercel previews. Fictional
// slugs; fetch is stubbed, nothing reaches a real API.

const SITE = "https://preview.example.test";
const API = "https://api.example.test";

function stub(api: () => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => api());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const isNext = (response: Response) => response.headers.get("x-middleware-next") === "1";
const call = (path: string, init: RequestInit = {}) =>
  middleware(new Request(`${SITE}${path}`, init));

function preview() {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VITE_API_BASE_URL", API);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const ALLOWED = [
  "/api/health",
  "/api/products?category=anteojos-de-sol&page=2",
  "/api/products/shapes",
  "/api/products/lente-qa",
  "/api/products/lente-qa/related",
  "/api/products/lente-qa/quote?lensTypeId=x",
  "/api/accessories/included",
  "/api/categories",
  "/api/brands",
  "/api/branches",
];

const BLOCKED = [
  "/api",
  "/api/",
  "/api/auth/me",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/admin/products",
  "/api/admin/dashboard",
  "/api/favorites",
  "/api/profile",
  "/api/optical-profile",
  "/api/recommendations",
  "/api/recommendations/lente-qa",
  "/api/products/lente-qa/variants",
  "/api/products/lente-qa/quote/extra",
  "/api/products/Lente-QA",
  "/api/products/lente_qa",
  "/api/products/..%2Fadmin%2Fproducts",
  "/api/products/%2e%2e",
  "/api//evil.example/x",
  "/api/products/lente-qa/",
];

describe("preview API proxy — production is unchanged", () => {
  it.each([undefined, "production", "development"])(
    "VERCEL_ENV=%s: /api/* goes straight on (static 404), the API is never called",
    async (env) => {
      if (env) vi.stubEnv("VERCEL_ENV", env);
      const fetchMock = stub(() => Response.json({}));
      for (const method of ["GET", "HEAD", "POST", "DELETE"]) {
        expect(isNext(await call("/api/products", { method }))).toBe(true);
        expect(isNext(await call("/api/auth/session", { method }))).toBe(true);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});

describe("preview API proxy — on a preview", () => {
  it.each(ALLOWED)("GET %s is forwarded to the same path on the fixed API", async (path) => {
    preview();
    const fetchMock = stub(() => Response.json({ ok: true }));
    const response = await call(path);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(`${API}${path}`);
  });

  it("forwards nothing from the visitor but path and query: no cookies, no Authorization", async () => {
    preview();
    const fetchMock = stub(() => Response.json({}));
    await call("/api/products/lente-qa", {
      headers: {
        cookie: "refreshToken=secret; _vercel_jwt=secret",
        authorization: "Bearer secret",
        "x-forwarded-for": "203.0.113.9",
      },
    });
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ accept: "application/json" });
    expect(init.credentials).toBeUndefined();
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns only status, body and content type — never the API's cookies", async () => {
    preview();
    stub(
      () =>
        new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), {
          status: 404,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "set-cookie": "refreshToken=x; HttpOnly",
            "access-control-allow-origin": "https://www.example.test",
          },
        }),
    );
    const response = await call("/api/products/no-existe-qa");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("HEAD is forwarded as HEAD, with no body", async () => {
    preview();
    const fetchMock = stub(() => new Response(null, { status: 200 }));
    const response = await call("/api/brands", { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("HEAD");
    expect(response.body).toBeNull();
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])(
    "%s is rejected with 405 and never forwarded, even on an allowed path",
    async (method) => {
      preview();
      const fetchMock = stub(() => Response.json({}));
      for (const path of ["/api/products", "/api/auth/login", "/api/admin/products"]) {
        const response = await call(path, { method, body: method === "OPTIONS" ? null : "{}" });
        expect(response.status).toBe(405);
        expect(response.headers.get("allow")).toBe("GET, HEAD");
        expect(await response.json()).toMatchObject({ error: { code: "PREVIEW_READ_ONLY" } });
      }
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(BLOCKED)("GET %s is rejected with 403 and never forwarded", async (path) => {
    preview();
    const fetchMock = stub(() => Response.json({}));
    const response = await call(path, { headers: { cookie: "refreshToken=secret" } });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "PREVIEW_READ_ONLY" } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("there is no session on a preview: /api/auth/session is always a visitor, without calling the API", async () => {
    preview();
    const fetchMock = stub(() => Response.json({ user: { id: "x" }, canRefresh: true }));
    const response = await call("/api/auth/session", {
      headers: { cookie: "refreshToken=secret; accessToken=secret" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ user: null, canRefresh: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an overlong query string is rejected", async () => {
    preview();
    const fetchMock = stub(() => Response.json({}));
    const response = await call(`/api/products?q=${"a".repeat(3000)}`);
    expect(response.status).toBe(414);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an API failure is a 502, not a hang", async () => {
    preview();
    stub(() => Promise.reject(new DOMException("timeout", "TimeoutError")));
    const response = await call("/api/products");
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: "UPSTREAM_UNAVAILABLE" } });
  });

  it("product pages keep their own behaviour on a preview (real 404 for an unknown slug)", async () => {
    preview();
    const fetchMock = stub(() => Response.json({}, { status: 404 }));
    const response = await call("/products/no-existe-qa");
    expect(response.status).toBe(404);
    expect(response.headers.get("x-middleware-rewrite")).toBe(`${SITE}/404`);
    expect(fetchMock).toHaveBeenCalledWith(`${API}/api/products/no-existe-qa`, expect.anything());
  });

  it("the allowlist matches every real slug shape in the catalog", () => {
    for (const slug of ["47-street-fucsia-redondos", "estuche-lentes-deportivos", "rb3025-58"]) {
      expect(isAllowedPreviewApiPath(`/api/products/${slug}`)).toBe(true);
    }
  });
});
