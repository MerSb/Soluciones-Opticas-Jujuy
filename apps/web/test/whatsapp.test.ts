import { describe, expect, it } from "vitest";
import {
  buildProductInquiryMessage,
  buildWhatsAppProductUrl,
  buildWhatsAppUrl,
} from "../src/lib/whatsapp";

describe("buildWhatsAppUrl", () => {
  it("strips non-digit characters from the phone number", () => {
    expect(buildWhatsAppUrl("+54 9 388 000-0001")).toBe("https://wa.me/5493880000001");
  });

  it("omits the query string when no message is given", () => {
    expect(buildWhatsAppUrl("5493880000001")).toBe("https://wa.me/5493880000001");
  });

  it("URL-encodes the message text", () => {
    expect(buildWhatsAppUrl("5493880000001", "Hola, ¿tienen turnos?")).toBe(
      "https://wa.me/5493880000001?text=Hola%2C%20%C2%BFtienen%20turnos%3F",
    );
  });
});

describe("buildProductInquiryMessage", () => {
  it("includes brand and color when both are given", () => {
    expect(
      buildProductInquiryMessage({
        productName: "Aviador Clásico",
        brandName: "Andina Eyewear",
        color: "Negro",
        productUrl: "https://example.com/products/aviador-clasico",
      }),
    ).toBe(
      "Hola, estoy interesado/a en el modelo Aviador Clásico de Andina Eyewear, color Negro. " +
        "¿Podrían darme más información? https://example.com/products/aviador-clasico",
    );
  });

  it("cleanly omits brand, color, and URL when absent — never 'null'/'undefined' in the text", () => {
    const message = buildProductInquiryMessage({ productName: "Aviador Clásico" });
    expect(message).toBe(
      "Hola, estoy interesado/a en el modelo Aviador Clásico. ¿Podrían darme más información?",
    );
    expect(message).not.toMatch(/null|undefined/i);
  });

  it("omits only the color when the brand is present but color is not", () => {
    const message = buildProductInquiryMessage({
      productName: "Aviador Clásico",
      brandName: "Andina Eyewear",
    });
    expect(message).toBe(
      "Hola, estoy interesado/a en el modelo Aviador Clásico de Andina Eyewear. ¿Podrían darme más información?",
    );
  });
});

describe("buildWhatsAppProductUrl", () => {
  it("delegates to buildWhatsAppUrl with the product-inquiry message — never builds a wa.me URL by hand", () => {
    const url = buildWhatsAppProductUrl("5493884844442", { productName: "Aviador Clásico" });
    expect(url).toBe(
      buildWhatsAppUrl(
        "5493884844442",
        buildProductInquiryMessage({ productName: "Aviador Clásico" }),
      ),
    );
    expect(url.startsWith("https://wa.me/5493884844442?text=")).toBe(true);
  });
});

describe("buildProductInquiryMessage — lens configuration (ADR-0023)", () => {
  const base = { productName: "Andina Aviador", brandName: "Andina", color: "Negro" };

  it("leaves the message untouched for products without lens configuration", () => {
    expect(buildProductInquiryMessage({ ...base, lens: null })).toBe(
      buildProductInquiryMessage(base),
    );
  });

  it("states 'sin cristales' when the customer keeps the frame only", () => {
    expect(buildProductInquiryMessage({ ...base, lens: { lensTypeName: null } })).toBe(
      "Hola, estoy interesado/a en el modelo Andina Aviador de Andina, color Negro, sin cristales. ¿Podrían darme más información?",
    );
  });

  it("includes the lens, its variety and a custom-graduation request", () => {
    expect(
      buildProductInquiryMessage({
        ...base,
        lens: { lensTypeName: "Espectro", lensOptionName: "Variedad A", customGraduation: true },
      }),
    ).toBe(
      "Hola, estoy interesado/a en el modelo Andina Aviador de Andina, color Negro, con cristales Espectro (variedad Variedad A) y graduación personalizada. ¿Podrían darme más información?",
    );
  });

  it("omits the variety and graduation when not chosen", () => {
    expect(buildProductInquiryMessage({ ...base, lens: { lensTypeName: "HD" } })).toContain(
      ", con cristales HD. ¿Podrían",
    );
  });
});
