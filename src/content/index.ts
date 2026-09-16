import { POLL_INTERVAL_MS } from "../lib/constants";
import { creditedSeconds } from "../lib/playback";
import { isWatchPath } from "../lib/navigation";

const SEND_WARN_THROTTLE_MS = 10_000;
let lastWarnAt = 0;

function warnThrottled(message: string, error: unknown): void {
  const now = Date.now();
  if (now - lastWarnAt >= SEND_WARN_THROTTLE_MS) {
    lastWarnAt = now;
    console.warn(`[YT Tracker] ${message}`, error);
  }
}

function sendInterval(seconds: number): void {
  try {
    const maybePromise = chrome.runtime.sendMessage({
      type: "INTERVAL",
      seconds,
    });
    // MV3 returns a promise; swallow rejections (e.g. worker asleep) quietly.
    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.catch((error: unknown) =>
        warnThrottled("failed to send interval", error)
      );
    }
  } catch (error) {
    warnThrottled("failed to send interval", error);
  }
}

// Cleanup for the currently-active tracker, or null when not tracking. YouTube
// is a single-page app, so the poll must start/stop as the user navigates in
// and out of /watch without any document reload.
let stopTracking: (() => void) | null = null;

function startTracking(): void {
  // Always begin from a clean slate so each navigation gets a fresh baseline.
  stopTracking?.();

  let cancelled = false;
  let retryId: number | undefined;
  let intervalId: number | undefined;

  const begin = (): void => {
    if (cancelled) {
      return;
    }
    const video = document.querySelector("video");
    if (!video) {
      // Retry until YouTube renders the video element.
      retryId = window.setTimeout(begin, 500);
      return;
    }

    let prevTime = video.currentTime;
    let prevTick = performance.now();

    intervalId = window.setInterval(() => {
      const now = performance.now();
      const currTime = video.currentTime;
      const elapsedMs = now - prevTick;

      // Pass the measured wall-clock elapsed time (not the nominal poll
      // interval) so timer jitter beyond 10% does not drop watched seconds.
      // creditedSeconds returns the real seconds watched (0 when the tick is
      // paused/stalled/backward or a seek-forward jump), and credits
      // faster-than-1× playback at real wall-clock rate.
      const seconds = creditedSeconds(prevTime, currTime, elapsedMs);
      if (seconds > 0) {
        sendInterval(seconds);
      }

      prevTime = currTime;
      prevTick = now;
    }, POLL_INTERVAL_MS);
  };

  begin();

  stopTracking = () => {
    cancelled = true;
    if (retryId !== undefined) {
      clearTimeout(retryId);
    }
    if (intervalId !== undefined) {
      clearInterval(intervalId);
    }
  };
}

function handleNavigation(): void {
  if (isWatchPath(location.pathname)) {
    startTracking();
  } else if (stopTracking) {
    stopTracking();
    stopTracking = null;
  }
}

// Evaluate the initial page, then react to YouTube's client-side navigations.
handleNavigation();
window.addEventListener("yt-navigate-finish", handleNavigation);

