import { describe, expect, it } from "vitest";
import { computeCost, priceFor, PRICES } from "./pricing";

describe("priceFor", () => {
  it("finds a known model", () => {
    expect(priceFor("gpt-5.4-mini")).toEqual(PRICES["gpt-5.4-mini"]);
  });

  it("strips a dated snapshot suffix", () => {
    expect(priceFor("gpt-5.4-mini-2026-03-17")).toEqual(PRICES["gpt-5.4-mini"]);
  });

  it("returns undefined for an unknown model", () => {
    expect(priceFor("some-future-model")).toBeUndefined();
  });
});

describe("computeCost", () => {
  it("bills fresh input, cached input and output at their own rates", () => {
    // 1M fresh input + 1M cached input + 1M output for gpt-5.4-mini
    const cost = computeCost("gpt-5.4-mini", {
      input: 2_000_000,
      cachedInput: 1_000_000,
      output: 1_000_000,
    });
    // fresh 1M * 0.75 + cached 1M * 0.075 + out 1M * 4.50
    expect(cost).toBeCloseTo(0.75 + 0.075 + 4.5, 6);
  });

  it("treats input as inclusive of cached tokens, not additional", () => {
    const allCached = computeCost("gpt-5.4-mini", {
      input: 1_000_000,
      cachedInput: 1_000_000,
      output: 0,
    });
    expect(allCached).toBeCloseTo(0.075, 6);
  });

  it("never bills negative fresh input if the API over-reports cache", () => {
    const cost = computeCost("gpt-5.4-mini", {
      input: 100,
      cachedInput: 500,
      output: 0,
    });
    expect(cost).toBeGreaterThanOrEqual(0);
  });

  it("returns null for an unknown model rather than a wrong number", () => {
    expect(computeCost("mystery-model", { input: 1000, cachedInput: 0, output: 100 })).toBeNull();
  });

  it("is zero for a run that used nothing", () => {
    expect(computeCost("gpt-5.4-mini", { input: 0, cachedInput: 0, output: 0 })).toBe(0);
  });
});
