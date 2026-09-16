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

describe("L1-01 addSeconds rejects non-finite input", () => {
  // `NaN <= 0` is false, so without an explicit finite check a NaN would slip
  // past the guard and poison the day total permanently: every later
  // `current + seconds` stays NaN and the popup renders 0m forever, with no
  // recovery short of delete-all. Unreachable today (isIntervalMessage blocks
  // it), but a single upstream guard should not be the only thing preventing
  // unrecoverable data loss.
  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
  ])("ignores %s", (_label, seconds) => {
    expect(addSeconds({}, "2026-09-16", seconds)).toEqual({});
  });

  it("leaves an existing total untouched", () => {
    const store = { "2026-09-16": 120 };
    expect(addSeconds(store, "2026-09-16", Number.NaN)).toEqual({
      "2026-09-16": 120,
    });
  });

  it("keeps a day total finite across a hostile sequence", () => {
    let store = addSeconds({}, "2026-09-16", 30);
    store = addSeconds(store, "2026-09-16", Number.NaN);
    store = addSeconds(store, "2026-09-16", 30);
    expect(store["2026-09-16"]).toBe(60);
  });
});

describe("L1-02 formatDuration rejects non-finite input", () => {
  // `Infinity > 0` is true, so without a finite check this renders
  // "Infinityh NaNm" in the popup.
  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["a negative value", -5],
  ])("renders %s as 0m", (_label, seconds) => {
    expect(formatDuration(seconds)).toBe("0m");
  });
});

describe("R10 store shape (accepted risk, pinned)", () => {
  // The store grows one key per local day and is never pruned. That is an
  // accepted trade-off (~365 small numeric keys per year, far under the
  // chrome.storage.local quota), but an accepted risk with no test is just a
  // sentence that rots. This fails if the shape ever changes, forcing the
  // decision to be revisited rather than silently broken.
  it("adds exactly one key per distinct day", () => {
    let store = addSeconds({}, "2026-09-14", 10);
    store = addSeconds(store, "2026-09-15", 10);
    store = addSeconds(store, "2026-09-16", 10);
    expect(Object.keys(store)).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
    ]);
  });

  it("never prunes old days", () => {
    const store = addSeconds({ "2020-01-01": 5 }, "2026-09-16", 10);
    expect(store["2020-01-01"]).toBe(5);
  });

  it("stores a plain number per day, not a nested record", () => {
    const store = addSeconds({}, "2026-09-16", 10);
    expect(typeof store["2026-09-16"]).toBe("number");
  });
});
