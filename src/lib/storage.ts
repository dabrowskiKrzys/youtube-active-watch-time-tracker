/**
 * Pure storage/aggregation helpers for confirmed watch time.
 *
 * These functions hold no browser APIs so they can be unit-tested without
 * Chrome. The background and popup depend on them for date-keying, adding
 * confirmed seconds, reading a day total, and formatting for display.
 */

/** Maps a local calendar date (`YYYY-MM-DD`) to confirmed seconds watched. */
export type WatchTimeStore = Record<string, number>;

/**
 * Returns the local calendar date of `date` as `YYYY-MM-DD`, zero-padded.
 * Uses the device timezone (local getters), not UTC.
 */
export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns a new store with `seconds` added to `dateKey`. Does not mutate the
 * input. Non-positive and non-finite `seconds` are ignored (returns an
 * unchanged copy).
 *
 * The finite check is deliberate defence in depth. `NaN <= 0` is `false`, so
 * without it a NaN would slip past the guard and poison the day total
 * permanently — every later `current + seconds` stays NaN, and the popup shows
 * `0m` forever with no recovery short of delete-all. `isIntervalMessage` is the
 * primary gate, but a single upstream guard should not be the only thing
 * standing between a malformed message and unrecoverable user data.
 */
export function addSeconds(
  store: WatchTimeStore,
  dateKey: string,
  seconds: number
): WatchTimeStore {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return { ...store };
  }
  const current = store[dateKey] ?? 0;
  return { ...store, [dateKey]: current + seconds };
}

/** Returns the stored seconds for `dateKey`, or 0 when absent. */
export function getSecondsForDate(
  store: WatchTimeStore,
  dateKey: string
): number {
  return store[dateKey] ?? 0;
}

/**
 * Formats whole seconds as `Xh Ym` when >= 1 hour, `Ym` otherwise.
 * Returns `0m` for 0, negative, and non-finite input. Rounds down to whole
 * minutes.
 *
 * The finite check matters for `Infinity` specifically: `Infinity > 0` is true,
 * so without it this would render `Infinityh NaNm` into the popup.
 */
export function formatDuration(seconds: number): string {
  const safeSeconds =
    Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
