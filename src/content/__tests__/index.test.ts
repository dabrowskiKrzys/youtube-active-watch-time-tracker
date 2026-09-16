// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChromeStub, type ChromeStub } from "../../test/chrome-stub";

/**
 * Content script: poll lifecycle across YouTube's client-side navigation.
 *
 * The pure classification logic (`creditedSeconds`, `isWatchPath`) is covered in
 * src/lib. What is tested here is the wiring — when the poll starts, when it
 * stops, and which `<video>` it reads. Every case maps to a risk in
 * `context/foundation/test-plan.md` (R5–R7).
 *
 * The failure this suite exists to prevent is silent: a timer that outlives a
 * navigation keeps crediting watch time while the user is on the homepage, with
 * no error and no crash — just numbers that are quietly too high.
 */

let stub: ChromeStub;
let warn: ReturnType<typeof vi.spyOn>;
/** Listeners the module registers on import, so they can be torn down. */
let registered: Array<[string, EventListenerOrEventListenerObject]> = [];

/**
 * Creates a `<video>` whose `currentTime` is a plain settable value.
 * jsdom implements HTMLMediaElement only partially, so the property is defined
 * on the instance rather than relying on the real media pipeline.
 */
function makeVideo(initialTime = 0): HTMLVideoElement {
  const el = document.createElement("video");
  let time = initialTime;
  Object.defineProperty(el, "currentTime", {
    get: () => time,
    set: (value: number) => {
      time = value;
    },
    configurable: true,
  });
  return el;
}

function navigateTo(path: string): void {
  window.history.pushState({}, "", path);
}

function fireNavigation(): void {
  window.dispatchEvent(new Event("yt-navigate-finish"));
}

/**
 * Imports a fresh content script bound to the current DOM and location.
 *
 * The module runs `handleNavigation()` and registers its listener at import
 * time, so each test needs its own instance. `addEventListener` is spied on
 * first to capture the handler — otherwise instances would accumulate on the
 * shared jsdom window and one test's tracker would react to the next test's
 * navigation events.
 */
async function loadContentScript(): Promise<void> {
  const original = window.addEventListener.bind(window);
  const spy = vi.spyOn(window, "addEventListener").mockImplementation(((
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => {
    registered.push([type, handler]);
    original(type, handler, options);
  }) as typeof window.addEventListener);
  vi.resetModules();
  await import("../index");
  spy.mockRestore();
}

/** Advances `n` whole poll ticks, moving `currentTime` forward by `perTick`. */
function playFor(video: HTMLVideoElement, ticks: number, perTick = 1): void {
  for (let i = 0; i < ticks; i++) {
    video.currentTime = video.currentTime + perTick;
    vi.advanceTimersByTime(1000);
  }
}

beforeEach(() => {
  // `performance` must be faked too: the poll derives elapsed time from
  // performance.now(), so a real clock would report ~0 ms per tick and every
  // credit would collapse to zero.
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
      "performance",
    ],
  });
  stub = createChromeStub();
  stub.install();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  document.body.replaceChildren();
  navigateTo("/");
});

afterEach(() => {
  for (const [type, handler] of registered) {
    window.removeEventListener(type, handler);
  }
  registered = [];
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  stub.uninstall();
  document.body.replaceChildren();
});

describe("CT-01 counting on a watch page", () => {
  it("sends one interval of real seconds per tick at 1x", async () => {
    navigateTo("/watch?v=abc");
    const video = makeVideo(0);
    document.body.append(video);

    await loadContentScript();
    playFor(video, 3);

    expect(stub.sendMessage).toHaveBeenCalledTimes(3);
    for (const message of stub.sentMessages) {
      expect(message).toMatchObject({ type: "INTERVAL" });
      expect((message as { seconds: number }).seconds).toBeCloseTo(1, 5);
    }
  });

  it("credits wall-clock seconds, not content seconds, at 2x", async () => {
    navigateTo("/watch?v=abc");
    const video = makeVideo(0);
    document.body.append(video);

    await loadContentScript();
    playFor(video, 2, 2);

    expect(stub.sendMessage).toHaveBeenCalledTimes(2);
    for (const message of stub.sentMessages) {
      expect((message as { seconds: number }).seconds).toBeCloseTo(1, 5);
    }
  });
});

describe("CT-02 non-watch pages", () => {
  it("never starts a poll on the homepage", async () => {
    navigateTo("/");
    const video = makeVideo(0);
    document.body.append(video);

    await loadContentScript();
    playFor(video, 5);

    expect(stub.sendMessage).not.toHaveBeenCalled();
  });

  it("never starts a poll on a feed page that contains a video element", async () => {
    navigateTo("/feed/subscriptions");
    const video = makeVideo(0);
    document.body.append(video);

    await loadContentScript();
    playFor(video, 5);

    expect(stub.sendMessage).not.toHaveBeenCalled();
  });
});

describe("CT-03 navigating away from a video (R5)", () => {
  it("stops counting once the user leaves /watch", async () => {
    navigateTo("/watch?v=abc");
    const video = makeVideo(0);
    document.body.append(video);
    await loadContentScript();

    playFor(video, 2);
    expect(stub.sendMessage).toHaveBeenCalledTimes(2);

    navigateTo("/");
    fireNavigation();

    // The core R5 assertion: time continuing to advance on a still-playing
    // element must produce nothing once we are off /watch.
    playFor(video, 10);
    expect(stub.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("resumes counting when the user navigates back to a video", async () => {
    navigateTo("/watch?v=abc");
    const video = makeVideo(0);
    document.body.append(video);
    await loadContentScript();

    navigateTo("/");
    fireNavigation();
    playFor(video, 3);
    expect(stub.sendMessage).not.toHaveBeenCalled();

    navigateTo("/watch?v=def");
    fireNavigation();
    playFor(video, 2);

    expect(stub.sendMessage).toHaveBeenCalledTimes(2);
  });
});

describe("CT-04 moving between videos (R5)", () => {
  it("runs exactly one poll after re-navigating to another video", async () => {
    navigateTo("/watch?v=abc");
    const video = makeVideo(0);
    document.body.append(video);
    await loadContentScript();

    navigateTo("/watch?v=def");
    fireNavigation();
    playFor(video, 1);

    // A leaked timer would double-count every tick.
    expect(stub.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("does not accumulate pollers across many navigations", async () => {
    navigateTo("/watch?v=abc");
    const video = makeVideo(0);
    document.body.append(video);
    await loadContentScript();

    for (let i = 0; i < 5; i++) {
      navigateTo(`/watch?v=v${i}`);
      fireNavigation();
    }
    playFor(video, 1);

    expect(stub.sendMessage).toHaveBeenCalledTimes(1);
  });
});

describe("CT-05 baseline reset between videos (R7)", () => {
  it("does not credit the previous video's position when a new one starts at 0", async () => {
    navigateTo("/watch?v=abc");
    const first = makeVideo(600);
    document.body.append(first);
    await loadContentScript();

    // YouTube swaps in a fresh element that starts at 0.
    first.remove();
    const second = makeVideo(0);
    document.body.append(second);
    navigateTo("/watch?v=def");
    fireNavigation();

    playFor(second, 1);

    expect(stub.sendMessage).toHaveBeenCalledTimes(1);
    const seconds = (stub.sentMessages[0] as { seconds: number }).seconds;
    expect(seconds).toBeCloseTo(1, 5);
    expect(seconds).toBeLessThan(2);
  });
});

describe("CT-06 video element not yet rendered", () => {
  it("retries until YouTube renders the video, then counts", async () => {
    navigateTo("/watch?v=abc");
    await loadContentScript();

    // Two retry windows with an empty DOM.
    vi.advanceTimersByTime(1000);
    expect(stub.sendMessage).not.toHaveBeenCalled();

    const video = makeVideo(0);
    document.body.append(video);
    vi.advanceTimersByTime(500);

    playFor(video, 2);
    expect(stub.sendMessage).toHaveBeenCalledTimes(2);
  });
});

describe("CT-07 navigating away during the retry loop (R5)", () => {
  it("cancels the pending retry so no poll starts later", async () => {
    navigateTo("/watch?v=abc");
    await loadContentScript();

    vi.advanceTimersByTime(500);
    navigateTo("/");
    fireNavigation();

    // The video arrives after we have already left; the cancelled retry must
    // not resurrect the tracker.
    const video = makeVideo(0);
    document.body.append(video);
    vi.advanceTimersByTime(5000);
    playFor(video, 5);

    expect(stub.sendMessage).not.toHaveBeenCalled();
  });

  it("leaves no timer pending after navigating away mid-retry", async () => {
    navigateTo("/watch?v=abc");
    await loadContentScript();

    vi.advanceTimersByTime(500);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    navigateTo("/");
    fireNavigation();

    // Behaviour alone cannot prove this: the `cancelled` flag already makes a
    // surviving retry harmless, so a leaked timeout would go unnoticed by the
    // no-counting assertion above. Asserting the timer is actually gone is what
    // holds `stopTracking` to clearing it.
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("CT-08 video element swapped in place (R6)", () => {
  it("reads the replacement element rather than a cached node", async () => {
    navigateTo("/watch?v=abc");
    const original = makeVideo(10);
    document.body.append(original);
    await loadContentScript();

    original.remove();
    const replacement = makeVideo(100);
    document.body.append(replacement);
    navigateTo("/watch?v=def");
    fireNavigation();

    playFor(replacement, 2);

    // Holding the detached node would read a frozen currentTime and credit 0.
    expect(stub.sendMessage).toHaveBeenCalledTimes(2);
  });
});

describe("CT-09 paused playback", () => {
  it("sends nothing while currentTime is static", async () => {
    navigateTo("/watch?v=abc");
    const video = makeVideo(42);
    document.body.append(video);
    await loadContentScript();

    vi.advanceTimersByTime(10_000);

    expect(stub.sendMessage).not.toHaveBeenCalled();
  });

  it("sends nothing when the user seeks backward", async () => {
    navigateTo("/watch?v=abc");
    const video = makeVideo(500);
    document.body.append(video);
    await loadContentScript();

    video.currentTime = 100;
    vi.advanceTimersByTime(1000);

    expect(stub.sendMessage).not.toHaveBeenCalled();
  });

  it("sends nothing when the user seeks forward beyond plausible speed", async () => {
    navigateTo("/watch?v=abc");
    const video = makeVideo(10);
    document.body.append(video);
    await loadContentScript();

    video.currentTime = 310;
    vi.advanceTimersByTime(1000);

    expect(stub.sendMessage).not.toHaveBeenCalled();
  });
});

describe("CT-10 the background worker being unavailable", () => {
  it("survives a rejected send without an unhandled rejection", async () => {
    navigateTo("/watch?v=abc");
    const video = makeVideo(0);
    document.body.append(video);
    await loadContentScript();

    stub.setSendMessageBehavior("reject");

    video.currentTime = 1;
    await vi.advanceTimersByTimeAsync(1000);

    expect(stub.sendMessage).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("survives a synchronous throw", async () => {
    navigateTo("/watch?v=abc");
    const video = makeVideo(0);
    document.body.append(video);
    await loadContentScript();

    stub.setSendMessageBehavior("throw");

    video.currentTime = 1;
    vi.advanceTimersByTime(1000);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("throttles repeated warnings to one per 10 s", async () => {
    navigateTo("/watch?v=abc");
    const video = makeVideo(0);
    document.body.append(video);
    await loadContentScript();

    stub.setSendMessageBehavior("throw");

    // Five consecutive failures inside the throttle window.
    playFor(video, 5);
    expect(warn).toHaveBeenCalledTimes(1);

    // Past the window, one more is allowed through.
    playFor(video, 8);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("keeps counting after a transient failure recovers", async () => {
    navigateTo("/watch?v=abc");
    const video = makeVideo(0);
    document.body.append(video);
    await loadContentScript();

    stub.setSendMessageBehavior("throw");
    playFor(video, 1);

    stub.setSendMessageBehavior("resolve");
    playFor(video, 2);

    expect(stub.sendMessage).toHaveBeenCalledTimes(3);
  });
});
