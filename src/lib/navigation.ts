/**
 * Pure navigation-path helpers for the content script.
 *
 * Browser-free so the "should we track on this page?" decision is unit-tested
 * without a DOM. YouTube video pages use the `/watch` path with the video id
 * carried in the query string (e.g. `/watch?v=abc`).
 */

/** Returns true iff `pathname` is exactly the YouTube watch path (`/watch`). */
export function isWatchPath(pathname: string): boolean {
  return pathname === "/watch";
}
