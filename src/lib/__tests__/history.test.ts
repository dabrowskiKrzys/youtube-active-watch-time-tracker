import { describe, it, expect } from "vitest";
import {
  lastNDateKeys,
  getLastNDays,
  sumSeconds,
  formatDayLabel,
  DEFAULT_WINDOW_DAYS,
  type DayTotal,
} from "../history";
import { localDateKey, type WatchTimeStore } from "../storage";

describe("lastNDateKeys", () => {
  it("returns exactly n keys ordered oldest → newest, ending at the reference day", () => {
    // reference = 2026-09-08 (month index 8 = September)
    const keys = lastNDateKeys(new Date(2026, 8, 8), 7);
    expect(keys).toEqual([
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
    ]);
  });

  it("defaults to a 7-day window when n is omitted", () => {
    const keys = lastNDateKeys(new Date(2026, 8, 8));
    expect(keys).toHaveLength(DEFAULT_WINDOW_DAYS);
    expect(keys).toHaveLength(7);
    expect(keys[keys.length - 1]).toBe("2026-09-08");
  });

  it("rolls over a month boundary", () => {
    // reference = 2026-03-01 → window reaches back into February
    const keys = lastNDateKeys(new Date(2026, 2, 1), 3);
    expect(keys).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
  });

  it("rolls over a year boundary", () => {
    // reference = 2026-01-02 → window reaches back into December 2025
    const keys = lastNDateKeys(new Date(2026, 0, 2), 4);
    expect(keys).toEqual([
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
    ]);
  });

  it("returns the reference day itself for n = 1", () => {
    expect(lastNDateKeys(new Date(2026, 8, 8), 1)).toEqual(["2026-09-08"]);
  });
});

describe("getLastNDays", () => {
  it("reads present days and fills absent days with 0, preserving order", () => {
    const store: WatchTimeStore = {
      "2026-09-06": 120,
      "2026-09-08": 3600,
    };
    const result = getLastNDays(store, new Date(2026, 8, 8), 3);
    expect(result).toEqual<DayTotal[]>([
      { dateKey: "2026-09-06", seconds: 120 },
      { dateKey: "2026-09-07", seconds: 0 },
      { dateKey: "2026-09-08", seconds: 3600 },
    ]);
  });

  it("always returns exactly n entries even for an empty store", () => {
    const result = getLastNDays({}, new Date(2026, 8, 8), 7);
    expect(result).toHaveLength(7);
    expect(result.every((day) => day.seconds === 0)).toBe(true);
  });

  it("ignores stored days outside the window", () => {
    const store: WatchTimeStore = {
      "2026-08-01": 999, // outside a 3-day window ending 2026-09-08
      "2026-09-07": 60,
    };
    const result = getLastNDays(store, new Date(2026, 8, 8), 3);
    expect(sumSeconds(result)).toBe(60);
    expect(result.map((d) => d.dateKey)).not.toContain("2026-08-01");
  });
});

describe("sumSeconds", () => {
  it("sums seconds across days", () => {
    expect(
      sumSeconds([
        { dateKey: "2026-09-06", seconds: 120 },
        { dateKey: "2026-09-07", seconds: 0 },
        { dateKey: "2026-09-08", seconds: 3600 },
      ])
    ).toBe(3720);
  });

  it("returns 0 for an empty list", () => {
    expect(sumSeconds([])).toBe(0);
  });
});

describe("formatDayLabel", () => {
  it("returns 'Today' when the key matches todayKey", () => {
    const todayKey = "2026-09-08";
    expect(formatDayLabel(todayKey, todayKey)).toBe("Today");
  });

  it("returns a short weekday for a non-today key, parsed as a local date", () => {
    const todayKey = "2026-09-08";
    // Compute the expectation via the same local-date + Intl path the impl uses,
    // so the assertion is robust across CI locales rather than hard-coding English.
    const expected = new Date(2026, 8, 7).toLocaleDateString(undefined, {
      weekday: "short",
    });
    expect(formatDayLabel("2026-09-07", todayKey)).toBe(expected);
  });

  it("labels each day in a window consistently with a fresh local Date", () => {
    const reference = new Date(2026, 8, 8);
    const todayKey = localDateKey(reference);
    for (const key of lastNDateKeys(reference, 7)) {
      const label = formatDayLabel(key, todayKey);
      if (key === todayKey) {
        expect(label).toBe("Today");
      } else {
        const [y, m, d] = key.split("-").map(Number);
        const expected = new Date(y, m - 1, d).toLocaleDateString(undefined, {
          weekday: "short",
        });
        expect(label).toBe(expected);
      }
    }
  });
});
