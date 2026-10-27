import { describe, expect, it } from "vitest";
import { orderWithNewPhotosLast, photoFileKey, toggleInSequence } from "../src/lib/photo-sequence";

describe("photo sequence", () => {
  it("each click appends; clicking again removes and the rest move up", () => {
    let order: string[] = [];
    for (const key of ["c", "a", "d", "b"]) order = toggleInSequence(order, key);
    expect(order).toEqual(["c", "a", "d", "b"]);
    order = toggleInSequence(order, "a");
    expect(order).toEqual(["c", "d", "b"]); // d is now 2, b is 3
    order = toggleInSequence(order, "a");
    expect(order).toEqual(["c", "d", "b", "a"]);
  });

  it("recognizes the same file chosen twice", () => {
    const a = new File(["x"], "a.jpg", { type: "image/jpeg", lastModified: 5 });
    const again = new File(["x"], "a.jpg", { type: "image/jpeg", lastModified: 5 });
    const other = new File(["xy"], "a.jpg", { type: "image/jpeg", lastModified: 5 });
    expect(photoFileKey(a)).toBe(photoFileKey(again));
    expect(photoFileKey(a)).not.toBe(photoFileKey(other));
  });

  it("puts new photos back in sequence after the existing ones", () => {
    // Retried "n2" was appended after "n3".
    expect(orderWithNewPhotosLast(["p", "x", "n1", "n3", "n2"], ["n1", "n2", "n3"])).toEqual([
      "p",
      "x",
      "n1",
      "n2",
      "n3",
    ]);
  });

  it("skips new ids no longer on the variant (deleted meanwhile)", () => {
    expect(orderWithNewPhotosLast(["p", "n1"], ["n1", "n2"])).toEqual(["p", "n1"]);
  });
});
