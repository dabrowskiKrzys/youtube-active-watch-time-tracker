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
