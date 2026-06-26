/**
 * Returns true when video.currentTime advanced at approximately real-time rate.
 * Tolerates up to ±10% drift from expected interval.
 */
export function isAdvancing(
  prev: number,
  curr: number,
  intervalMs: number
): boolean {
  const expectedSeconds = intervalMs / 1000;
  const delta = curr - prev;
  const tolerance = expectedSeconds * 0.1;
  return delta > 0 && Math.abs(delta - expectedSeconds) <= tolerance;
}
