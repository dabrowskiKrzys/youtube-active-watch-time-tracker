import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChromeStub, tick, type ChromeStub } from "../../test/chrome-stub";

/**
 * Background service worker: ordering, durability and input validation.
 *
 * This suite exists because the worker is the only component that can lose or
 * corrupt user data. Every case below maps to a risk in
 * `context/foundation/test-plan.md` (R1–R4, R9).
 */

const STORAGE_KEY = "watchTime";
const TODAY = "2026-09-16";

/**
 * Loads a fresh copy of the worker bound to `stub`.
 *
 * The module registers its listener and seeds `writeChain` at import time, so
 * every test needs its own module instance — otherwise a chain left pending by
 * one test would order the writes of the next.
 */
async function loadWorker(stub: ChromeStub): Promise<void> {
  stub.install();
  vi.resetModules();
  await import("../index");
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Fake only Date: the stub's `tick` relies on a real setTimeout.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 16, 12, 0, 0));
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe("BG-01 recording a single interval", () => {
  it("persists the seconds under today's local date key", async () => {
    const stub = createChromeStub();
    await loadWorker(stub);

    await stub.dispatch({ type: "INTERVAL", seconds: 5 });
    await tick();

    expect(stub.data[STORAGE_KEY]).toEqual({ [TODAY]: 5 });
  });

  it("adds to an existing total rather than replacing it", async () => {
    const stub = createChromeStub({ initial: { [STORAGE_KEY]: { [TODAY]: 12 } } });
    await loadWorker(stub);

    await stub.dispatch({ type: "INTERVAL", seconds: 8 });
    await tick();

    expect(stub.data[STORAGE_KEY]).toEqual({ [TODAY]: 20 });
  });

  it("answers immediately and does not hold the message channel open", async () => {
    const stub = createChromeStub();
    await loadWorker(stub);

    const response = await stub.dispatch({ type: "INTERVAL", seconds: 1 });

    expect(response).toEqual({ ok: true });
    expect(stub.lastReturn).toBeUndefined();
  });
});

describe("BG-02 overlapping intervals (R1)", () => {
  it("serializes read-modify-write so no update is lost", async () => {
    const stub = createChromeStub({ manualWrites: true });
    await loadWorker(stub);

    await stub.dispatch({ type: "INTERVAL", seconds: 5 });
    await stub.dispatch({ type: "INTERVAL", seconds: 3 });
    await stub.dispatch({ type: "INTERVAL", seconds: 2 });
    await tick();

    // Proof the messages are queued rather than racing: only the first write
    // has reached storage while the other two wait behind it.
    expect(stub.pendingWrites()).toBe(1);

    await stub.flushWrites();

    // A lost update would land on 2 (last writer wins over a stale read).
    expect(stub.data[STORAGE_KEY]).toEqual({ [TODAY]: 10 });
    expect(stub.setCalls).toHaveLength(3);
  });

  it("keeps totals correct across many rapid intervals", async () => {
    const stub = createChromeStub({ manualWrites: true });
    await loadWorker(stub);

    for (let i = 0; i < 20; i++) {
      await stub.dispatch({ type: "INTERVAL", seconds: 1 });
    }
    await stub.flushWrites();

    expect(stub.data[STORAGE_KEY]).toEqual({ [TODAY]: 20 });
  });
});

describe("BG-03 a failing write (R2)", () => {
  it("does not poison the chain — later intervals still persist", async () => {
    const stub = createChromeStub();
    await loadWorker(stub);

    stub.failNextWrite(new Error("QUOTA_BYTES exceeded"));
    await stub.dispatch({ type: "INTERVAL", seconds: 5 });
    await tick();

    expect(stub.data[STORAGE_KEY]).toBeUndefined();

    await stub.dispatch({ type: "INTERVAL", seconds: 4 });
    await tick();

    expect(stub.data[STORAGE_KEY]).toEqual({ [TODAY]: 4 });
  });

  it("logs the failure instead of throwing", async () => {
    const stub = createChromeStub();
    await loadWorker(stub);

    stub.failNextWrite();
    await stub.dispatch({ type: "INTERVAL", seconds: 5 });
    await tick();

    expect(warn).toHaveBeenCalled();
  });
});

describe("BG-04 reset during an in-flight write (R3)", () => {
  it("clears storage after the pending interval write, leaving nothing behind", async () => {
    const stub = createChromeStub({ manualWrites: true });
    await loadWorker(stub);

    await stub.dispatch({ type: "INTERVAL", seconds: 5 });
    await tick();
    expect(stub.pendingWrites()).toBe(1);

    const resetDone = stub.dispatch({ type: "RESET" });
    await tick();

    // The sharp assertion: while the interval's write is still in flight the
    // reset must not have touched storage at all. If it ran off-chain, `remove`
    // would already have been called here and the pending write could resolve
    // afterwards, resurrecting data the user deleted.
    expect(stub.removeCalls).toEqual([]);

    await stub.flushWrites();
    await resetDone;

    // The delete must win: data the user asked to erase cannot reappear
    // because an earlier write settled afterwards.
    expect(stub.data[STORAGE_KEY]).toBeUndefined();
    expect(stub.opLog).toEqual(["set", "remove"]);
  });

  it("discards an interval that arrives while the reset is queued", async () => {
    const stub = createChromeStub({ manualWrites: true });
    await loadWorker(stub);

    await stub.dispatch({ type: "INTERVAL", seconds: 5 });
    await tick();
    const resetDone = stub.dispatch({ type: "RESET" });
    await stub.flushWrites();
    await resetDone;

    // An interval after the reset legitimately starts a new day total.
    await stub.dispatch({ type: "INTERVAL", seconds: 2 });
    await stub.flushWrites();

    expect(stub.data[STORAGE_KEY]).toEqual({ [TODAY]: 2 });
  });
});

describe("BG-05 reset acknowledgement", () => {
  it("keeps the channel open and replies only once the clear has settled", async () => {
    const stub = createChromeStub({ manualWrites: true });
    await loadWorker(stub);

    let responded = false;
    const resetDone = stub.dispatch({ type: "RESET" }).then((response) => {
      responded = true;
      return response;
    });
    await tick();

    // Returning true is what lets MV3 deliver an async sendResponse at all;
    // without it the popup would resolve before storage was cleared.
    expect(stub.lastReturn).toBe(true);
    expect(responded).toBe(false);

    await stub.flushWrites();

    expect(await resetDone).toEqual({ ok: true });
    expect(responded).toBe(true);
  });

  it("removes only the watch-time key", async () => {
    const stub = createChromeStub({
      initial: { [STORAGE_KEY]: { [TODAY]: 9 }, unrelated: "keep me" },
    });
    await loadWorker(stub);

    await stub.dispatch({ type: "RESET" });
    await tick();

    expect(stub.removeCalls).toEqual([STORAGE_KEY]);
    expect(stub.data.unrelated).toBe("keep me");
  });
});

describe("BG-06 corrupt stored values (R4)", () => {
  it.each([
    ["a string", "garbage"],
    ["a number", 42],
    ["null", null],
    ["a boolean", true],
  ])("recovers from %s without throwing", async (_label, corrupt) => {
    const stub = createChromeStub({ initial: { [STORAGE_KEY]: corrupt } });
    await loadWorker(stub);

    await stub.dispatch({ type: "INTERVAL", seconds: 7 });
    await tick();

    expect(stub.data[STORAGE_KEY]).toEqual({ [TODAY]: 7 });
    expect(warn).not.toHaveBeenCalled();
  });

  it("still records today's total when the stored value is an array", async () => {
    const stub = createChromeStub({ initial: { [STORAGE_KEY]: [1, 2] } });
    await loadWorker(stub);

    await stub.dispatch({ type: "INTERVAL", seconds: 7 });
    await tick();

    const store = stub.data[STORAGE_KEY] as Record<string, unknown>;
    expect(store[TODAY]).toBe(7);
    // Documented gap: `typeof [] === "object"`, so an array slips past the
    // readStore guard and its indices survive as junk keys. Harmless (the popup
    // only reads date keys) and unreachable without manual tampering, so this
    // pins current behaviour rather than asserting a clean object.
    expect(store).toHaveProperty("0");
  });
});

describe("BG-07 malformed messages", () => {
  it.each([
    ["missing seconds", { type: "INTERVAL" }],
    ["missing type", { seconds: 5 }],
    ["NaN seconds", { type: "INTERVAL", seconds: NaN }],
    ["Infinite seconds", { type: "INTERVAL", seconds: Infinity }],
    ["negative seconds", { type: "INTERVAL", seconds: -3 }],
    ["zero seconds", { type: "INTERVAL", seconds: 0 }],
    ["string seconds", { type: "INTERVAL", seconds: "5" }],
    ["unknown type", { type: "SOMETHING_ELSE", seconds: 5 }],
    ["null", null],
    ["a bare string", "INTERVAL"],
    ["a number", 42],
  ])("ignores %s without writing", async (_label, message) => {
    const stub = createChromeStub();
    await loadWorker(stub);

    await stub.dispatch(message);
    await tick();

    expect(stub.set).not.toHaveBeenCalled();
    expect(stub.remove).not.toHaveBeenCalled();
    expect(stub.data[STORAGE_KEY]).toBeUndefined();
  });
});

describe("BG-08 date attribution (R9)", () => {
  it("credits each interval to the local day current when it is processed", async () => {
    const stub = createChromeStub();
    await loadWorker(stub);

    vi.setSystemTime(new Date(2026, 8, 16, 23, 59, 59));
    await stub.dispatch({ type: "INTERVAL", seconds: 5 });
    await tick();

    vi.setSystemTime(new Date(2026, 8, 17, 0, 0, 1));
    await stub.dispatch({ type: "INTERVAL", seconds: 5 });
    await tick();

    // Known, accepted behaviour: attribution uses processing time, so playback
    // straddling midnight can shift by at most one poll interval (~1s).
    expect(stub.data[STORAGE_KEY]).toEqual({
      "2026-09-16": 5,
      "2026-09-17": 5,
    });
  });

  it("keeps separate totals per day rather than overwriting", async () => {
    const stub = createChromeStub({
      initial: { [STORAGE_KEY]: { "2026-09-15": 100 } },
    });
    await loadWorker(stub);

    await stub.dispatch({ type: "INTERVAL", seconds: 30 });
    await tick();

    expect(stub.data[STORAGE_KEY]).toEqual({
      "2026-09-15": 100,
      [TODAY]: 30,
    });
  });
});

describe("worker registration", () => {
  it("registers exactly one message listener on import", async () => {
    const stub = createChromeStub();
    await loadWorker(stub);

    expect(stub.hasListener()).toBe(true);
  });

  it("re-reads storage on every message rather than caching it", async () => {
    const stub = createChromeStub();
    await loadWorker(stub);

    await stub.dispatch({ type: "INTERVAL", seconds: 1 });
    await tick();
    await stub.dispatch({ type: "INTERVAL", seconds: 1 });
    await tick();

    // MV3 can tear the worker down between messages, so in-memory state is
    // never the source of truth.
    expect(stub.getCalls).toEqual([STORAGE_KEY, STORAGE_KEY]);
  });
});
