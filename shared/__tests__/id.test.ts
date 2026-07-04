import { describe, expect, it } from "vitest";
import { mulberry32 } from "../engine/rng.js";
import { generateRoomCode, isValidRoomCode } from "../id.js";

describe("room codes", () => {
  it("generates a 4-letter code that validates", () => {
    const code = generateRoomCode(mulberry32(1));
    expect(code).toMatch(/^[A-Z]{4}$/);
    expect(isValidRoomCode(code)).toBe(true);
  });

  it("is deterministic for a fixed seed", () => {
    expect(generateRoomCode(mulberry32(42))).toBe(generateRoomCode(mulberry32(42)));
  });

  it("never emits the ambiguous letters I or O", () => {
    for (let seed = 0; seed < 300; seed++) {
      const code = generateRoomCode(mulberry32(seed));
      expect(code).not.toMatch(/[IO]/);
    }
  });

  it("rejects malformed codes", () => {
    expect(isValidRoomCode("abcd")).toBe(false); // lower-case
    expect(isValidRoomCode("AIOU")).toBe(false); // contains I/O
    expect(isValidRoomCode("ABC")).toBe(false); // too short
    expect(isValidRoomCode("AB1D")).toBe(false); // digit
  });
});
