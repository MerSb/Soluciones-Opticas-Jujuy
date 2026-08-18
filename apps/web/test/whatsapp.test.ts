import { describe, expect, it } from "vitest";
import { buildWhatsAppUrl } from "../src/lib/whatsapp";

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
