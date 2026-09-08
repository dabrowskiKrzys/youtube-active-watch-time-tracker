import { describe, it, expect } from "vitest";
import {
  localDateKey,
  addSeconds,
  getSecondsForDate,
  formatDuration,
  type WatchTimeStore,
} from "../storage";

describe("localDateKey", () => {
  it("zero-pads month and day and reflects the local date", () => {
    // 2026-03-05 in local time (month index 2 = March)
    expect(localDateKey(new Date(2026, 2, 5))).toBe("2026-03-05");
  });

  it("formats a two-digit month and day without padding artifacts", () => {
    expect(localDateKey(new Date(2026, 11, 25))).toBe("2026-12-25");
  });
});

describe("addSeconds", () => {
  it("adds to a new key", () => {
    const store: WatchTimeStore = {};
    expect(addSeconds(store, "2026-03-05", 30)).toEqual({ "2026-03-05": 30 });
  });

  it("adds to an existing key", () => {
    const store: WatchTimeStore = { "2026-03-05": 30 };
    expect(addSeconds(store, "2026-03-05", 15)).toEqual({ "2026-03-05": 45 });
  });

  it("does not mutate the input store", () => {
    const store: WatchTimeStore = { "2026-03-05": 30 };
    addSeconds(store, "2026-03-05", 15);
    expect(store).toEqual({ "2026-03-05": 30 });
  });

  it("ignores zero and negative seconds", () => {
    const store: WatchTimeStore = { "2026-03-05": 30 };
    expect(addSeconds(store, "2026-03-05", 0)).toEqual({ "2026-03-05": 30 });
    expect(addSeconds(store, "2026-03-05", -5)).toEqual({ "2026-03-05": 30 });
  });
});

describe("getSecondsForDate", () => {
  it("returns the stored seconds for a present key", () => {
    expect(getSecondsForDate({ "2026-03-05": 42 }, "2026-03-05")).toBe(42);
  });

  it("returns 0 for a missing key", () => {
    expect(getSecondsForDate({}, "2026-03-05")).toBe(0);
  });
});

describe("formatDuration", () => {
  it("returns 0m for zero", () => {
    expect(formatDuration(0)).toBe("0m");
  });

  it("formats sub-hour durations as Ym", () => {
    expect(formatDuration(45 * 60)).toBe("45m");
  });

  it("formats an exact hour as Xh 0m", () => {
    expect(formatDuration(60 * 60)).toBe("1h 0m");
  });

  it("formats hours and minutes", () => {
    expect(formatDuration(83 * 60)).toBe("1h 23m");
  });

  it("rounds down to whole minutes", () => {
    expect(formatDuration(59)).toBe("0m");
    expect(formatDuration(119)).toBe("1m");
  });
});
