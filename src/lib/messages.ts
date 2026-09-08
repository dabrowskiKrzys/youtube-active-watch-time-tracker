/**
 * Runtime message contract between the popup/content scripts and the background
 * service worker.
 *
 * These type guards hold no browser APIs so they can be unit-tested without
 * Chrome. The background worker uses them to validate untrusted `onMessage`
 * payloads before acting on them.
 */

/** Content script reports a confirmed playback interval in seconds. */
export interface IntervalMessage {
  type: "INTERVAL";
  seconds: number;
}

/** Popup requests deletion of all stored watch-time data. */
export interface ResetMessage {
  type: "RESET";
}

export type ExtensionMessage = IntervalMessage | ResetMessage;

/** Narrows an unknown payload to a well-formed `INTERVAL` message. */
export function isIntervalMessage(message: unknown): message is IntervalMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "INTERVAL" &&
    typeof (message as { seconds?: unknown }).seconds === "number" &&
    Number.isFinite((message as { seconds: number }).seconds)
  );
}

/** Narrows an unknown payload to a well-formed `RESET` message. */
export function isResetMessage(message: unknown): message is ResetMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "RESET"
  );
}
