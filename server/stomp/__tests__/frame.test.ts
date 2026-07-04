import { describe, expect, it } from "vitest";
import { encodeFrame, extractFrames, type StompFrame } from "../frame.js";

const NUL = String.fromCharCode(0);

describe("encodeFrame", () => {
  it("emits COMMAND, headers, blank line, body, NUL terminator", () => {
    const wire = encodeFrame({
      command: "MESSAGE",
      headers: { destination: "/topic/room/ABCD", subscription: "sub-0" },
      body: "hi",
    });
    expect(wire).toBe(`MESSAGE\ndestination:/topic/room/ABCD\nsubscription:sub-0\n\nhi${NUL}`);
    expect(wire.charCodeAt(wire.length - 1)).toBe(0);
  });

  it("does not escape CONNECT/CONNECTED headers but escapes others", () => {
    const connected = encodeFrame({ command: "CONNECTED", headers: { "heart-beat": "0,0" }, body: "" });
    expect(connected).toContain("heart-beat:0,0");
    const message = encodeFrame({ command: "MESSAGE", headers: { note: "a:b\nc" }, body: "" });
    expect(message).toContain("note:a\\cb\\nc");
  });
});

describe("extractFrames", () => {
  it("round-trips a SEND frame with a JSON body", () => {
    const original: StompFrame = {
      command: "SEND",
      headers: { destination: "/app/room/ABCD/claim", "content-type": "application/json" },
      body: JSON.stringify({ cards: [1, 2, 3] }),
    };
    const { frames, remainder } = extractFrames(encodeFrame(original));
    expect(remainder).toBe("");
    expect(frames).toHaveLength(1);
    expect(frames[0].command).toBe("SEND");
    expect(frames[0].headers.destination).toBe("/app/room/ABCD/claim");
    expect(JSON.parse(frames[0].body)).toEqual({ cards: [1, 2, 3] });
  });

  it("parses multiple frames and skips heartbeat EOLs, counting them", () => {
    const a = encodeFrame({ command: "SUBSCRIBE", headers: { id: "0", destination: "/topic/x" }, body: "" });
    const b = encodeFrame({ command: "DISCONNECT", headers: {}, body: "" });
    const { frames, remainder, heartbeats } = extractFrames(`\n${a}\n\n${b}`);
    expect(frames.map((f) => f.command)).toEqual(["SUBSCRIBE", "DISCONNECT"]);
    expect(remainder).toBe("");
    expect(heartbeats).toBeGreaterThanOrEqual(3);
  });

  it("returns an incomplete trailing frame as remainder for the next chunk", () => {
    const full = encodeFrame({ command: "SEND", headers: { destination: "/app/x" }, body: "body" });
    const split = full.slice(0, 12);
    const { frames, remainder } = extractFrames(split);
    expect(frames).toHaveLength(0);
    expect(remainder).toBe(split);
    // Feeding the rest completes it.
    const combined = extractFrames(remainder + full.slice(12));
    expect(combined.frames).toHaveLength(1);
    expect(combined.frames[0].headers.destination).toBe("/app/x");
  });

  it("unescapes header values on inbound non-CONNECT frames", () => {
    const wire = encodeFrame({ command: "SEND", headers: { note: "a:b\nc" }, body: "" });
    const { frames } = extractFrames(wire);
    expect(frames[0].headers.note).toBe("a:b\nc");
  });

  it("handles CRLF line endings", () => {
    const crlf = `SEND\r\ndestination:/app/x\r\n\r\nbody${NUL}`;
    const { frames } = extractFrames(crlf);
    expect(frames[0].command).toBe("SEND");
    expect(frames[0].headers.destination).toBe("/app/x");
    expect(frames[0].body).toBe("body");
  });
});
