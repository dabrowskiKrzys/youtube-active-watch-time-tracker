import { describe, it, expect } from "vitest";
import { isAdvancing } from "../playback";

describe("isAdvancing", () => {
  const INTERVAL = 1000; // 1 second poll

  it("returns true when currentTime advances by ~1 second", () => {
    expect(isAdvancing(10.0, 11.0, INTERVAL)).toBe(true);
    expect(isAdvancing(5.5, 6.45, INTERVAL)).toBe(true); // within 10% tolerance
  });

  it("returns false when video is paused (no change)", () => {
    expect(isAdvancing(10.0, 10.0, INTERVAL)).toBe(false);
  });

  it("returns false when video seeks forward (large jump)", () => {
    expect(isAdvancing(10.0, 25.0, INTERVAL)).toBe(false);
  });

  it("returns false when video seeks backward", () => {
    expect(isAdvancing(20.0, 5.0, INTERVAL)).toBe(false);
  });
});
