import { describe, expect, it } from "vitest";
import { encodeEvent, EventStreamParser, HEARTBEAT_FRAME } from "./stream";
import type { ReviewEvent } from "./engine";

const parse = (chunks: string[]) => {
  const parser = new EventStreamParser();
  return chunks.flatMap((c) => parser.push(c));
};

describe("encodeEvent", () => {
  it("writes a named SSE frame ending in a blank line", () => {
    const frame = encodeEvent({ type: "status", phase: "cloning" });
    expect(frame).toBe('event: status\ndata: {"type":"status","phase":"cloning"}\n\n');
  });

  it("round-trips through the parser", () => {
    const event: ReviewEvent = { type: "tool", name: "read_file", summary: "src/a.ts" };
    expect(parse([encodeEvent(event)])).toEqual([event]);
  });
});

describe("EventStreamParser", () => {
  it("returns nothing until a frame is complete", () => {
    const parser = new EventStreamParser();
    expect(parser.push('event: status\ndata: {"type":"status",')).toEqual([]);
    expect(parser.push('"phase":"cloning"}\n\n')).toEqual([
      { type: "status", phase: "cloning" },
    ]);
  });

  it("handles several frames in one chunk", () => {
    const chunk =
      encodeEvent({ type: "status", phase: "a" }) + encodeEvent({ type: "status", phase: "b" });
    expect(parse([chunk])).toHaveLength(2);
  });

  it("reassembles a frame split mid-character boundary across chunks", () => {
    const frame = encodeEvent({ type: "message", role: "assistant", text: "hello" });
    const cut = Math.floor(frame.length / 2);
    expect(parse([frame.slice(0, cut), frame.slice(cut)])).toEqual([
      { type: "message", role: "assistant", text: "hello" },
    ]);
  });

  it("ignores heartbeat comments, which carry no data", () => {
    expect(parse([HEARTBEAT_FRAME])).toEqual([]);
  });

  it("keeps parsing after a heartbeat", () => {
    const chunk = HEARTBEAT_FRAME + encodeEvent({ type: "status", phase: "x" });
    expect(parse([chunk])).toEqual([{ type: "status", phase: "x" }]);
  });

  it("drops a malformed frame rather than failing the stream", () => {
    const chunk = "event: status\ndata: {not json}\n\n" + encodeEvent({ type: "status", phase: "ok" });
    expect(parse([chunk])).toEqual([{ type: "status", phase: "ok" }]);
  });

  it("drops a frame with no data line", () => {
    expect(parse(["event: status\n\n"])).toEqual([]);
  });

  it("drops JSON that is not an event object", () => {
    expect(parse(["data: [1,2,3]\n\n", "data: null\n\n", 'data: "text"\n\n'])).toEqual([]);
  });

  it("joins multi-line data fields, as the SSE format allows", () => {
    expect(parse(['data: {"type":"status",\ndata: "phase":"x"}\n\n'])).toEqual([
      { type: "status", phase: "x" },
    ]);
  });

  it("carries a finding through unchanged", () => {
    const finding = {
      id: "f1",
      file: "src/a.ts",
      line: 4,
      disposition: "blocking",
      category: "correctness",
      title: "t",
      body: "b",
      confidence: "confirmed",
      status: "pending",
      edited: false,
      lineValid: true,
      snapped: false,
      origin: "agent",
    };
    const [event] = parse([encodeEvent({ type: "finding", finding } as ReviewEvent)]);
    expect(event).toEqual({ type: "finding", finding });
  });
});
