import { describe, expect, it } from "vitest";
import { PUSH_TO_TALK_KEY, PUSH_TO_TALK_KEY_LABEL, isPushToTalkKey, isTypingTag } from "../pushToTalk.js";

describe("push-to-talk key matching", () => {
  it("matches the talk key in either case", () => {
    expect(isPushToTalkKey("v")).toBe(true);
    expect(isPushToTalkKey("V")).toBe(true);
  });

  it("ignores every other key", () => {
    for (const key of ["a", "Enter", " ", "Control", "Shift", "b", "1"]) {
      expect(isPushToTalkKey(key)).toBe(false);
    }
  });

  it("exposes an upper-case label for on-screen hints", () => {
    expect(PUSH_TO_TALK_KEY_LABEL).toBe(PUSH_TO_TALK_KEY.toUpperCase());
    expect(PUSH_TO_TALK_KEY_LABEL).toBe("V");
  });
});

describe("typing-surface detection (so chat input never opens the mic)", () => {
  it("treats text-entry tags as typing surfaces", () => {
    for (const tag of ["input", "INPUT", "textarea", "TextArea", "select"]) {
      expect(isTypingTag(tag)).toBe(true);
    }
  });

  it("does not treat other tags (or nothing) as typing surfaces", () => {
    for (const tag of ["div", "button", "canvas", "span", null, undefined, ""]) {
      expect(isTypingTag(tag)).toBe(false);
    }
  });
});
