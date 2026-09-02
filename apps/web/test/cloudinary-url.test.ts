import { afterEach, describe, expect, it, vi } from "vitest";

async function loadWithCloudName(cloudinaryCloudName: string | null) {
  vi.resetModules();
  vi.doMock("../src/lib/env", () => ({
    env: { apiBaseUrl: "http://localhost:3001", cloudinaryCloudName },
  }));
  return import("../src/lib/cloudinary");
}

afterEach(() => {
  vi.doUnmock("../src/lib/env");
  vi.resetModules();
});

describe("buildCloudinaryUrl", () => {
  it("returns null when no cloud name is configured — never a guessed/broken URL", async () => {
    const { buildCloudinaryUrl } = await loadWithCloudName(null);
    expect(buildCloudinaryUrl("some/public/id", { width: 400 })).toBeNull();
  });

  it("builds an f_auto,q_auto,w_<n> delivery URL from the configured cloud name", async () => {
    const { buildCloudinaryUrl } = await loadWithCloudName("demo-cloud");
    expect(buildCloudinaryUrl("soluciones-opticas/products/p/v/uuid", { width: 480 })).toBe(
      "https://res.cloudinary.com/demo-cloud/image/upload/f_auto,q_auto,w_480/soluciones-opticas/products/p/v/uuid",
    );
  });

  it("rounds a fractional width rather than embedding a decimal in the URL", async () => {
    const { buildCloudinaryUrl } = await loadWithCloudName("demo-cloud");
    expect(buildCloudinaryUrl("id", { width: 399.6 })).toContain("w_400");
  });
});

describe("buildCloudinarySrcSet", () => {
  it("returns null when no cloud name is configured", async () => {
    const { buildCloudinarySrcSet } = await loadWithCloudName(null);
    expect(buildCloudinarySrcSet("id", [320, 640])).toBeNull();
  });

  it("builds one URL per width, each labeled with its own descriptor", async () => {
    const { buildCloudinarySrcSet } = await loadWithCloudName("demo-cloud");
    const srcSet = buildCloudinarySrcSet("id", [320, 640]);
    expect(srcSet).toBe(
      "https://res.cloudinary.com/demo-cloud/image/upload/f_auto,q_auto,w_320/id 320w, " +
        "https://res.cloudinary.com/demo-cloud/image/upload/f_auto,q_auto,w_640/id 640w",
    );
  });
});
