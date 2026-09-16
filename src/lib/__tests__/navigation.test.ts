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

describe("L1-07 isWatchPath rejects near-misses", () => {
  it.each([
    ["a trailing slash", "/watch/"],
    ["different casing", "/WATCH"],
    ["mixed casing", "/Watch"],
    ["an empty path", ""],
    ["a prefix match", "/watchlist"],
    ["a nested path", "/embed/watch"],
    ["the query string included", "/watch?v=abc"],
  ])("returns false for %s", (_label, path) => {
    expect(isWatchPath(path)).toBe(false);
  });

  // The video id lives in the query string, which `location.pathname` excludes,
  // so the bare path is the correct thing to match on.
  it("returns true for the bare watch path", () => {
    expect(isWatchPath("/watch")).toBe(true);
  });
});
