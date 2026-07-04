import { describe, expect, it } from "vitest";
import { handCursorDataUri } from "../handCursor.js";

describe("handCursorDataUri", () => {
  it("returns an inline SVG data URI encoding the seat colour", () => {
    const uri = handCursorDataUri("#fe4a49");
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    expect(uri).toContain(encodeURIComponent("#fe4a49"));
  });

  it("caches by colour (same reference for the same colour)", () => {
    expect(handCursorDataUri("#2ab7ca")).toBe(handCursorDataUri("#2ab7ca"));
  });

  it("produces different cursors for different colours", () => {
    expect(handCursorDataUri("#7bc043")).not.toBe(handCursorDataUri("#03396c"));
  });
});
