import { describe, it, expect } from "vitest";
import { creditedSeconds, MAX_SPEED_RATIO } from "../playback";

describe("creditedSeconds", () => {
  const INTERVAL = 1000; // 1 second poll

  it("credits ~1s at 1× playback", () => {
    expect(creditedSeconds(10.0, 11.0, INTERVAL)).toBeCloseTo(1, 5);
  });

  it("caps credit at wall-clock elapsed for 1.5× playback", () => {
    expect(creditedSeconds(10.0, 11.5, INTERVAL)).toBeCloseTo(1, 5);
  });

  it("caps credit at wall-clock elapsed for 2× playback", () => {
    expect(creditedSeconds(10.0, 12.0, INTERVAL)).toBeCloseTo(1, 5);
  });

  it("accepts a tick exactly at MAX_SPEED_RATIO (boundary)", () => {
    // delta = 2.5, elapsed = 1s → ratio 2.5, not > 2.5, so accepted.
    const curr = 10.0 + MAX_SPEED_RATIO;
    expect(creditedSeconds(10.0, curr, INTERVAL)).toBeCloseTo(1, 5);
  });

  it("rejects a tick just past MAX_SPEED_RATIO as a seek", () => {
    // delta = 3.0, elapsed = 1s → ratio 3.0 > 2.5.
    expect(creditedSeconds(10.0, 13.0, INTERVAL)).toBe(0);
  });

  it("rejects a large seek-forward jump", () => {
    expect(creditedSeconds(10.0, 25.0, INTERVAL)).toBe(0);
  });

  it("credits 0 when video is paused (no change)", () => {
    expect(creditedSeconds(10.0, 10.0, INTERVAL)).toBe(0);
  });

  it("credits 0 when video seeks backward / new video resets time", () => {
    expect(creditedSeconds(20.0, 5.0, INTERVAL)).toBe(0);
  });

  it("credits the content delta when it stalls partway through a tick (<1×)", () => {
    // delta = 0.4 < elapsed 1s → min gives 0.4 (don't over-count a stall).
    expect(creditedSeconds(10.0, 10.4, INTERVAL)).toBeCloseTo(0.4, 5);
  });

  it("credits measured elapsed under timer jitter at 2×", () => {
    // 2× over a jittery 1200ms tick: delta = 2.4, elapsed = 1.2s, ratio 2.0.
    expect(creditedSeconds(10.0, 12.4, 1200)).toBeCloseTo(1.2, 5);
  });

  it("credits 0 when elapsedMs is 0 (guards divide-by-zero)", () => {
    expect(creditedSeconds(10.0, 11.0, 0)).toBe(0);
  });
});

describe("L1-03 clock stepped backwards", () => {
  // A negative elapsed window is nonsense; crediting from it would let a system
  // clock adjustment inflate the day total.
  it("credits 0 for a negative elapsedMs", () => {
    expect(creditedSeconds(10.0, 11.0, -1000)).toBe(0);
  });
});

describe("L1-04 non-finite readings", () => {
  // `video.currentTime` is a number, but a detached or unloaded media element
  // can report NaN. Without a finite check the arithmetic guards all evaluate
  // false and Math.min returns NaN, which would then have to be caught further
  // downstream. Returning 0 keeps the contract "seconds is always a finite,
  // non-negative number" true at the source.
  it.each([
    ["NaN prev", Number.NaN, 11, 1000],
    ["NaN curr", 10, Number.NaN, 1000],
    ["NaN elapsed", 10, 11, Number.NaN],
    ["Infinite curr", 10, Number.POSITIVE_INFINITY, 1000],
    ["Infinite prev", Number.NEGATIVE_INFINITY, 11, 1000],
    ["Infinite elapsed", 10, 11, Number.POSITIVE_INFINITY],
  ])("credits 0 for %s", (_label, prev, curr, elapsedMs) => {
    expect(creditedSeconds(prev, curr, elapsedMs)).toBe(0);
  });

  it("always returns a finite, non-negative number", () => {
    const inputs = [Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 10];
    for (const prev of inputs) {
      for (const curr of inputs) {
        for (const elapsed of [-1000, 0, 1000, Number.NaN]) {
          const result = creditedSeconds(prev, curr, elapsed);
          expect(Number.isFinite(result)).toBe(true);
          expect(result).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});
