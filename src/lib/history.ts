/**
 * Pure helpers for the "last N days" watch-time view.
 *
 * These functions hold no browser APIs so they can be unit-tested without
 * Chrome. The popup depends on them to build the local-date window, read each
 * day's total from the store, and label days for display.
 */

import { localDateKey, getSecondsForDate, type WatchTimeStore } from "./storage";

/** One day's confirmed watch time, keyed by local calendar date. */
export interface DayTotal {
  dateKey: string;
  seconds: number;
}

/** Default size of the history window. */
export const DEFAULT_WINDOW_DAYS = 7;

/**
 * Returns `n` local date keys (`YYYY-MM-DD`) ending at `reference`'s day,
 * ordered oldest → newest. Day arithmetic goes through the `Date` constructor
 * (`new Date(year, month, day - i)`) so month/year rollover and DST shifts are
 * handled by the platform; keys are then formatted with `localDateKey`.
 */
export function lastNDateKeys(
  reference: Date,
  n: number = DEFAULT_WINDOW_DAYS
): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = new Date(
      reference.getFullYear(),
      reference.getMonth(),
      reference.getDate() - i
    );
    keys.push(localDateKey(day));
  }
  return keys;
}

/**
 * Returns `n` `DayTotal`s for the local-date window ending at `reference`,
 * oldest → newest. Days with no stored time are included with `seconds: 0`, so
 * the result is always exactly `n` entries.
 */
export function getLastNDays(
  store: WatchTimeStore,
  reference: Date,
  n: number = DEFAULT_WINDOW_DAYS
): DayTotal[] {
  return lastNDateKeys(reference, n).map((dateKey) => ({
    dateKey,
    seconds: getSecondsForDate(store, dateKey),
  }));
}

/**
 * Sums the seconds across a list of `DayTotal`s.
 */
export function sumSeconds(days: DayTotal[]): number {
  return days.reduce((total, day) => total + day.seconds, 0);
}

/**
 * Formats a day key for display: `"Today"` when it matches `todayKey`,
 * otherwise a short localized weekday (e.g. `Mon`). The key is parsed into a
 * **local** `Date` via numeric parts (never `new Date("YYYY-MM-DD")`, which is
 * interpreted as UTC and can shift the weekday across a timezone boundary).
 */
export function formatDayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) {
    return "Today";
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { weekday: "short" });
}
