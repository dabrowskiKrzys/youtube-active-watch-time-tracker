import { describe, it, expect } from "vitest";
import { isWatchPath } from "../navigation";

describe("isWatchPath", () => {
  it("returns true for the watch path", () => {
    expect(isWatchPath("/watch")).toBe(true);
  });

  it("returns false for the homepage", () => {
    expect(isWatchPath("/")).toBe(false);
  });

  it("returns false for search results", () => {
    expect(isWatchPath("/results")).toBe(false);
  });

  it("returns false for a path with a trailing segment", () => {
    expect(isWatchPath("/watch/foo")).toBe(false);
  });

  it("returns false for other feed paths", () => {
    expect(isWatchPath("/feed/subscriptions")).toBe(false);
  });
});
