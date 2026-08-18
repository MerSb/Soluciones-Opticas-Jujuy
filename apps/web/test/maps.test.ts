import { describe, expect, it } from "vitest";
import { buildMapsUrl } from "../src/lib/maps";

describe("buildMapsUrl", () => {
  it("uses the branch's own googleMapsUrl when present", () => {
    const url = buildMapsUrl({
      googleMapsUrl: "https://maps.example/real-link",
      address: "Ignored 123",
    });
    expect(url).toBe("https://maps.example/real-link");
  });

  it("falls back to a maps search built from the address, never an invented location", () => {
    const url = buildMapsUrl({
      googleMapsUrl: null,
      address: "Belgrano 123, San Salvador de Jujuy",
    });
    expect(url).toBe(
      "https://www.google.com/maps/search/?api=1&query=Belgrano%20123%2C%20San%20Salvador%20de%20Jujuy",
    );
  });
});
