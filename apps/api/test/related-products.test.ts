import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { completeCatalogFingerprint, observeWhileStable } from "./stable-snapshot.js";

const app = createApp();

// Seeded catalog (prisma/seed.ts): andina-aviador (Andina/Sunglasses/
// aviator/$45000), lumen-clasico (Lumen/Prescription/rectangular/
// $38000), cielo-runner (Cielo/Sport/wrap/$52000), andina-redondo
// (Andina/Prescription/round/$41000).
describe("GET /api/products/:slug/related", () => {
  it("404s for a product that doesn't exist", async () => {
    const response = await request(app).get("/api/products/does-not-exist/related");
    expect(response.status).toBe(404);
  });

  it("never includes the product itself, and returns at most 4", async () => {
    const response = await request(app).get("/api/products/andina-aviador/related");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeLessThanOrEqual(4);
    const slugs = response.body.data.map((p: { slug: string }) => p.slug);
    expect(slugs).not.toContain("andina-aviador");
  });

  it("ranks a same-brand product above unrelated ones — deterministic weighted score, not a strict cascade", async () => {
    const response = await request(app).get("/api/products/andina-aviador/related");
    const slugs = response.body.data.map((p: { slug: string }) => p.slug);
    // andina-redondo shares the brand (Andina) with andina-aviador;
    // lumen-clasico and cielo-runner share neither brand nor category
    // nor shape with it — andina-redondo must rank first.
    expect(slugs[0]).toBe("andina-redondo");
  });

  it("every related item carries the same public ProductListItem shape, including the new inStock field", async () => {
    const response = await request(app).get("/api/products/andina-aviador/related");
    for (const product of response.body.data) {
      expect(product).toHaveProperty("slug");
      expect(product).toHaveProperty("brand");
      expect(product).toHaveProperty("category");
      expect(product).toHaveProperty("price");
      expect(typeof product.inStock).toBe("boolean");
      // Inventory data stays internal — never exact counts on a listing.
      expect(product).not.toHaveProperty("stock");
    }
  });

  // Same target + the same candidate set ⇒ identical output. Candidates
  // are the whole complete catalog, which other files mutate
  // concurrently, so "the same candidate set" is proven (fingerprinted
  // unchanged across both requests) rather than assumed.
  it("produces stable, deterministic output across repeated requests", async () => {
    const {
      result: [first, second],
    } = await observeWhileStable(completeCatalogFingerprint, async () => {
      const first = await request(app).get("/api/products/andina-aviador/related");
      const second = await request(app).get("/api/products/andina-aviador/related");
      return [first, second] as const;
    });
    expect(first.status).toBe(200);
    expect(first.body.data.length).toBeGreaterThan(0);
    expect(first.body).toEqual(second.body);
  });

  it("is public — no authentication required", async () => {
    const response = await request(app).get("/api/products/andina-aviador/related");
    expect(response.status).toBe(200);
  });
});
