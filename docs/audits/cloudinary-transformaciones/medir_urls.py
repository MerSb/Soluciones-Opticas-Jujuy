"""Measures which Cloudinary transformation URLs the web asks for, page by page,
WITHOUT reaching Cloudinary: every res.cloudinary.com request is answered here
with a local placeholder, so no transformation is ever generated.

Usage (a local build served with `vite preview`, built with
VITE_API_BASE_URL=http://api.qa.invalid and VITE_CLOUDINARY_CLOUD_NAME=<public cloud>):

    python3 medir_urls.py http://127.0.0.1:4326 salida.json

Catalog and product data are read from the production API (GET only, read-only);
the admin session and the admin product are simulated; any non-GET is aborted.
"""
import collections, json, re, struct, sys, zlib
from playwright.sync_api import sync_playwright

BASE, OUT = sys.argv[1], sys.argv[2]
FAKE = "http://api.qa.invalid"
PROD = "https://soluciones-opticas-api-production.up.railway.app"
def _png(w=8, h=6):
    """A valid gray PNG placeholder, built here (no Cloudinary, no PIL)."""
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + b"\xa0\xa0\xa0" * w for _ in range(h))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


PNG = _png()
ADMIN = {"id": "u1", "email": "qa@example.test", "firstName": "QA", "lastName": "A", "phone": None, "role": "ADMIN"}
H = {"access-control-allow-origin": BASE, "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type"}
DETAIL = "unicity-2-clip-on-h3621-col309"
requests, blocked, admin_product = [], [], {}


def cloudinary(route):
    m = re.match(r"https://res\.cloudinary\.com/[^/]+/image/upload/([^/]+)/(.+)$", route.request.url)
    requests.append({"page": state["page"], "t": m.group(1) if m else None, "id": m.group(2) if m else route.request.url})
    route.fulfill(status=200, content_type="image/png", body=PNG)


def api(route):
    r = route.request
    path = r.url.split(FAKE, 1)[1]
    bare = path.split("?")[0]
    if r.method == "OPTIONS":
        return route.fulfill(status=204, headers=H)
    if bare == "/api/auth/refresh":
        return route.fulfill(status=401, json={"error": {"code": "UNAUTHENTICATED", "message": "x"}}, headers=H)
    if r.method != "GET":
        blocked.append(f"{r.method} {bare}")
        return route.abort()
    if bare.startswith("/api/auth/"):
        return route.fulfill(json={"user": ADMIN, "canRefresh": False} if bare.endswith("session") else ADMIN, headers=H)
    if bare == "/api/admin/products/p1":
        return route.fulfill(json=admin_product, headers=H)
    if bare.startswith("/api/admin/"):
        return route.fulfill(json=[], headers=H)
    resp = route.fetch(url=PROD + path, headers={"accept": "application/json"})
    route.fulfill(status=resp.status, body=resp.body(), headers={**H, "content-type": resp.headers.get("content-type", "application/json")})


state = {"page": ""}
with sync_playwright() as p:
    b = p.chromium.launch()
    # The admin product page, simulated with the real photos of DETAIL.
    ctx0 = b.new_context(); ctx0.route(f"{FAKE}/**", api); pg0 = ctx0.new_page()
    detail = json.loads(pg0.request.get(f"{PROD}/api/products/{DETAIL}").text())
    ctx0.close()
    T = "2026-11-02T00:00:00Z"
    admin_product.update({"id": "p1", "name": detail["name"], "slug": DETAIL, "brand": {"id": "b1", "name": "Marca", "slug": "m"},
        "category": {"id": "c1", "name": "Sol", "slug": "sol"}, "kind": "FRAME", "accessoryRole": None, "soldIndividually": False,
        "shape": None, "styles": [], "basePrice": 1, "frameMeasurements": {k: None for k in ("lensWidth", "bridgeWidth", "templeLength", "lensHeight", "frameWidth")},
        "variants": [{"id": f"v{i}", "productId": "p1", "color": v.get("color"), "material": v.get("material"), "label": None, "colorTones": v.get("colorTones", []),
                      "sku": v.get("sku") or f"S{i}", "stock": 1, "priceOverride": None, "createdAt": T, "updatedAt": T,
                      "images": [{"id": f"i{i}-{k}", "variantId": f"v{i}", "cloudinaryPublicId": im["publicId"], "alt": im.get("alt", ""), "sortOrder": k,
                                  "isPrimary": im.get("isPrimary", False), "createdAt": T} for k, im in enumerate(v["images"])]}
                     for i, v in enumerate(detail["variants"])],
        "isComplete": True, "lensTypes": [], "deletedAt": None, "createdAt": T, "updatedAt": T})
    for label, vp, dpr, mobile in (("1280", {"width": 1280, "height": 900}, 2, False),
                                   ("1280x1", {"width": 1280, "height": 900}, 1, False),
                                   ("360", {"width": 360, "height": 780}, 3, True)):
        ctx = b.new_context(viewport=vp, device_scale_factor=dpr, is_mobile=mobile)
        ctx.route(f"{FAKE}/**", api); ctx.route("https://res.cloudinary.com/**", cloudinary)
        pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        for name, url, action in (
            ("catálogo", "/products", "scroll"),
            ("ficha", f"/products/{DETAIL}", "variants"),
            ("accesorios", "/accesorios", "scroll"),
            ("admin-ficha", "/admin/products/p1", "scroll"),
        ):
            state["page"] = f"{label}:{name}"
            pg.goto(BASE + url, wait_until="networkidle")
            if action == "scroll":
                for _ in range(6):
                    pg.mouse.wheel(0, 1500); pg.wait_for_timeout(250)
            if action == "variants":
                for btn in pg.get_by_role("group", name=re.compile("Elegir")).get_by_role("button").all()[:3]:
                    btn.click(); pg.wait_for_timeout(300)
                tabs = pg.get_by_role("tablist", name="Imágenes del producto").get_by_role("tab").all()
                for t in tabs[:3]:
                    t.click(); pg.wait_for_timeout(200)
                if not mobile:
                    pg.mouse.move(300, 450); pg.wait_for_timeout(400)
            pg.wait_for_timeout(500)
            # Broken: an <img> that finished loading without pixels, or the
            # placeholder ProductImage shows after an error.
            broken = pg.eval_on_selector_all("img", "els => els.filter(e => e.complete && e.currentSrc && e.naturalWidth === 0).length")
            requests.append({"page": state["page"], "broken": broken, "errors": errs[:2]})
        ctx.close()
    b.close()

imgs = [r for r in requests if "t" in r]
summary = {"total_pedidos": len(imgs), "por_transformacion": collections.Counter(r["t"] for r in imgs),
           "por_pagina": {}, "rotas": {r["page"]: r["broken"] for r in requests if "broken" in r},
           "no_GET_bloqueados": blocked}
for page in sorted({r["page"] for r in imgs}):
    rows = [r for r in imgs if r["page"] == page]
    per = collections.defaultdict(set)
    for r in rows: per[r["id"]].add(r["t"])
    summary["por_pagina"][page] = {"pedidos": len(rows), "fotos": len(per), "transformaciones": dict(collections.Counter(r["t"] for r in rows)),
                                   "max_variantes_por_foto": max((len(v) for v in per.values()), default=0)}
per_photo = collections.defaultdict(set)
for r in imgs: per_photo[r["id"]].add(r["t"])
summary["cadenas_distintas"] = sorted({r["t"] for r in imgs})
summary["fotos_distintas"] = len(per_photo)
summary["cadenas_por_foto_promedio"] = round(sum(len(v) for v in per_photo.values()) / max(1, len(per_photo)), 2)
json.dump(summary, open(OUT, "w"), indent=1, ensure_ascii=False, default=dict)
print(json.dumps({k: summary[k] for k in ("total_pedidos", "fotos_distintas", "cadenas_por_foto_promedio", "cadenas_distintas", "rotas", "no_GET_bloqueados")}, ensure_ascii=False, indent=1))
