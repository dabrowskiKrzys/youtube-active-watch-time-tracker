import { describe, it, expect } from "vitest";
import {
  lastNDateKeys,
  getLastNDays,
  sumSeconds,
  formatDayLabel,
  maxSeconds,
  barPercent,
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

describe("maxSeconds", () => {
  const day = (dateKey: string, seconds: number): DayTotal => ({
    dateKey,
    seconds,
  });

  it("returns 0 for an empty window", () => {
    expect(maxSeconds([])).toBe(0);
  });

  it("returns the only day's seconds for a single-day window", () => {
    expect(maxSeconds([day("2026-09-08", 420)])).toBe(420);
  });

  it("picks the largest value regardless of position", () => {
    const days = [
      day("2026-09-06", 120),
      day("2026-09-07", 900),
      day("2026-09-08", 300),
    ];
    expect(maxSeconds(days)).toBe(900);
  });

  it("returns 0 when every day is empty", () => {
    const days = [day("2026-09-07", 0), day("2026-09-08", 0)];
    expect(maxSeconds(days)).toBe(0);
  });
});

describe("barPercent", () => {
  it("gives the busiest day a full-width bar", () => {
    expect(barPercent(900, 900)).toBe(100);
  });

  it("scales a day proportionally against the max", () => {
    expect(barPercent(450, 900)).toBe(50);
    expect(barPercent(225, 900)).toBe(25);
  });

  it("returns 0 for a day with no watch time", () => {
    expect(barPercent(0, 900)).toBe(0);
  });

  it("returns 0 when the whole window is empty (no divide-by-zero)", () => {
    expect(barPercent(0, 0)).toBe(0);
    expect(barPercent(120, 0)).toBe(0);
  });

  it("returns 0 for negative seconds", () => {
    expect(barPercent(-60, 900)).toBe(0);
  });

  it("clamps values above the max to 100", () => {
    expect(barPercent(1800, 900)).toBe(100);
  });

  it("returns 0 for non-finite input", () => {
    expect(barPercent(Number.NaN, 900)).toBe(0);
    expect(barPercent(Number.POSITIVE_INFINITY, 900)).toBe(0);
    expect(barPercent(300, Number.NaN)).toBe(0);
  });
});

describe("L1-05 daylight-saving transitions", () => {
  // Day arithmetic goes through `new Date(y, m, d - i)`, so the platform
  // handles DST. That reasoning currently lives only in a code comment; a
  // regression would silently shift a whole day's label. These dates bracket
  // the EU and US transitions in both directions.
  it.each([
    ["EU spring forward", new Date(2026, 2, 29, 12, 0, 0)],
    ["EU fall back", new Date(2026, 9, 25, 12, 0, 0)],
    ["US spring forward", new Date(2026, 2, 8, 12, 0, 0)],
    ["US fall back", new Date(2026, 10, 1, 12, 0, 0)],
    ["just after midnight on a transition day", new Date(2026, 2, 29, 0, 30, 0)],
    ["just before midnight on a transition day", new Date(2026, 9, 25, 23, 30, 0)],
  ])("yields 7 distinct consecutive keys across %s", (_label, reference) => {
    const keys = lastNDateKeys(reference);
    expect(keys).toHaveLength(7);
    expect(new Set(keys).size).toBe(7);
    // Oldest -> newest, ending on the reference day.
    expect(keys[6]).toBe(localDateKey(reference));
    expect([...keys].sort()).toEqual(keys);
  });
});

describe("L1-06 degenerate window sizes", () => {
  it("returns an empty window for n = 0", () => {
    expect(lastNDateKeys(new Date(2026, 8, 16), 0)).toEqual([]);
    expect(getLastNDays({}, new Date(2026, 8, 16), 0)).toEqual([]);
  });

  it("sums and scales an empty window without throwing", () => {
    const days = getLastNDays({}, new Date(2026, 8, 16), 0);
    expect(sumSeconds(days)).toBe(0);
    expect(maxSeconds(days)).toBe(0);
    expect(barPercent(0, maxSeconds(days))).toBe(0);
  });

  it("returns a negative window as empty rather than looping", () => {
    expect(lastNDateKeys(new Date(2026, 8, 16), -3)).toEqual([]);
  });
});