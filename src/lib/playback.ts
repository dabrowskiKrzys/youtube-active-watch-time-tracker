// Maximum playback-speed ratio (currentTime advance ÷ measured wall-clock
// elapsed) still treated as real playback. YouTube's speed menu tops out at 2×;
// the 0.5 margin absorbs timer jitter so a legitimate 2× tick isn't dropped,
// while a seek-forward jump (ratio far above this) is rejected.
export const MAX_SPEED_RATIO = 2.5;

/**
 * Returns the number of seconds of confirmed active playback to credit for a
 * poll tick, or 0 when the tick should not count.
 *
 * `prev`/`curr` are consecutive `video.currentTime` readings; `elapsedMs` is the
 * measured wall-clock time between them. A tick counts only when currentTime
 * advanced forward at a plausible playback rate (up to MAX_SPEED_RATIO). Paused,
 * stalled, backward, ended, and seek-forward ticks return 0.
 *
 * The credited amount is `min(delta, elapsedSeconds)` — real wall-clock seconds
 * watched. Capping by `elapsedSeconds` prevents faster-than-1× playback from
 * over-counting; capping by `delta` prevents a partial-tick stall (currentTime
 * advanced less than elapsed) from over-counting.
 */
export function creditedSeconds(
  prev: number,
  curr: number,
  elapsedMs: number
): number {
  const elapsedSeconds = elapsedMs / 1000;
  if (elapsedSeconds <= 0) {
    return 0;
  }
  const delta = curr - prev;
  if (delta <= 0) {
    return 0;
  }
  const ratio = delta / elapsedSeconds;
  if (ratio > MAX_SPEED_RATIO) {
    return 0;
  }
  return Math.min(delta, elapsedSeconds);
}
