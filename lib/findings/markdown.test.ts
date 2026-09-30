import { describe, expect, it } from "vitest";
import { safeUrl } from "./markdown";

describe("safeUrl — allowed", () => {
  it.each([
    "https://example.com/a?b=1#c",
    "http://example.com",
    "mailto:someone@example.com",
    "/relative/path",
    "relative/path",
    "#anchor",
    "./sibling",
  ])("allows %s", (url) => {
    expect(safeUrl(url)).toBe(url);
  });

  it("trims surrounding whitespace", () => {
    expect(safeUrl("  https://example.com  ")).toBe("https://example.com");
  });
});

describe("safeUrl — blocked", () => {
  it.each([
    ["javascript", "javascript:alert(1)"],
    ["javascript uppercase", "JavaScript:alert(1)"],
    ["javascript mixed case", "JaVaScRiPt:alert(1)"],
    ["data url", "data:text/html;base64,PHNjcmlwdD4="],
    ["vbscript", "vbscript:msgbox(1)"],
    ["file", "file:///etc/passwd"],
    ["scheme-relative", "//evil.example.com/x"],
  ])("blocks %s", (_label, url) => {
    // An empty string renders as an inert link rather than a live one.
    expect(safeUrl(url)).toBe("");
  });

  it.each([0x00, 0x09, 0x0a, 0x0d, 0x1f])(
    "blocks a scheme smuggled past a naive check with char %i",
    (code) => {
      const smuggled = `java${String.fromCharCode(code)}script:alert(1)`;
      expect(safeUrl(smuggled)).toBe("");
    },
  );

  it("blocks an empty or whitespace-only url", () => {
    expect(safeUrl("")).toBe("");
    expect(safeUrl("   ")).toBe("");
  });

  it("blocks a url that cannot be parsed", () => {
    expect(safeUrl("https://[")).toBe("");
  });

  it("blocks an unknown custom scheme", () => {
    expect(safeUrl("evil-app://do-something")).toBe("");
  });
});
