import sys, json, re
from playwright.sync_api import sync_playwright, expect

BASE = "http://localhost:5199"
OUT = sys.argv[1]
results = []

def run(p, name, viewport, mobile):
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile, locale="es-AR")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{BASE}/products/andina-aviador")
    page.get_by_role("button", name="Agregar al carrito").wait_for(timeout=15000)
    note = page.get_by_text(re.compile("La compra online es del armazón sin cristales")).count()
    whatsapp = page.get_by_text("Consultar por WhatsApp").count()
    page.screenshot(path=f"{OUT}/{name}-1-producto.png", full_page=True)
    page.get_by_role("button", name="Agregar al carrito").click()
    page.get_by_text("Agregado al carrito").wait_for()
    page.goto(f"{BASE}/cart")
    page.screenshot(path=f"{OUT}/{name}-2-carrito.png", full_page=True)
    page.goto(f"{BASE}/checkout")
    page.get_by_label("Nombre", exact=True).fill("Cliente")
    page.get_by_label("Apellido").fill("Ficticio")
    page.get_by_label("Email").fill(f"e2e-{name}@example.test")
    page.get_by_label("Teléfono").fill("388 400-0000")
    page.get_by_text("Sucursal Centro").click()
    page.get_by_label("Condición frente al IVA").select_option("1")
    page.get_by_label("Razón social").fill("Empresa Ficticia SA")
    page.get_by_label("CUIT").fill("20-11111111-3")
    page.get_by_role("button", name="Confirmar pedido").click()
    invalid = page.get_by_text("El CUIT no es válido: revisá los 11 dígitos.").count()
    page.get_by_label("CUIT").fill("20-11111111-2")
    page.screenshot(path=f"{OUT}/{name}-3-checkout.png", full_page=True)
    page.get_by_role("button", name="Confirmar pedido").click()
    page.get_by_role("heading", name="Pedido creado").wait_for(timeout=15000)
    page.screenshot(path=f"{OUT}/{name}-4-pedido.png", full_page=True)
    overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    pay = page.get_by_role("button", name=re.compile("Mercado Pago"))
    pay_msg = ""
    if pay.count():
        pay.first.click()
        page.wait_for_timeout(1500)
        alert = page.get_by_role("alert")
        pay_msg = alert.first.inner_text() if alert.count() else ""
        page.screenshot(path=f"{OUT}/{name}-5-pago.png", full_page=True)
    results.append({"viewport": name, "lensNote": note, "whatsapp": whatsapp, "invalidCuitShown": invalid,
                    "horizontalOverflow": overflow, "payMessage": pay_msg[:160], "pageErrors": errors[:3]})
    browser.close()

with sync_playwright() as p:
    run(p, "escritorio", {"width": 1280, "height": 900}, False)
    run(p, "celular", {"width": 390, "height": 844}, True)
print(json.dumps(results, ensure_ascii=False, indent=1))
