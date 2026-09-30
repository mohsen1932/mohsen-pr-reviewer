import { describe, expect, it } from "vitest";
import { formatBytes, relativeTime } from "./format";

const NOW = new Date("2026-09-30T12:00:00Z");
const ago = (seconds: number) =>
  new Date(NOW.getTime() - seconds * 1000).toISOString();

describe("relativeTime", () => {
  it.each([
    [5, "just now"],
    [30, "30 seconds ago"],
    [60, "1 minute ago"],
    [120, "2 minutes ago"],
    [3600, "1 hour ago"],
    [7200, "2 hours ago"],
    [86400, "1 day ago"],
    [172800, "2 days ago"],
    [2592000, "1 month ago"],
    [31536000, "1 year ago"],
    [63072000, "2 years ago"],
  ])("renders %i seconds ago as %s", (seconds, expected) => {
    expect(relativeTime(ago(seconds), NOW)).toBe(expected);
  });

  it("returns 'never' for null", () => {
    expect(relativeTime(null, NOW)).toBe("never");
  });

  it("returns 'unknown' for an unparseable date", () => {
    expect(relativeTime("not a date", NOW)).toBe("unknown");
  });

  it("clamps a future timestamp rather than rendering negative time", () => {
    expect(relativeTime(ago(-500), NOW)).toBe("just now");
  });

  it("singularizes exactly one unit", () => {
    expect(relativeTime(ago(3600), NOW)).toBe("1 hour ago");
    expect(relativeTime(ago(3600 * 2), NOW)).toBe("2 hours ago");
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1023, "1023 B"],
    [1024, "1 KB"],
    [2048, "2 KB"],
    [400 * 1024, "400 KB"],
    [1024 * 1024, "1.0 MB"],
    [1536 * 1024, "1.5 MB"],
  ])("formats %i as %s", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});
