import { vi } from "vitest";

/**
 * Minimal in-memory stand-in for the Chrome extension APIs the background
 * worker touches.
 *
 * The worker's correctness guarantees are all about *ordering* — overlapping
 * INTERVAL writes must not clobber each other, and a RESET must not interleave
 * with an in-flight read-modify-write. Asserting that requires holding a write
 * open while further messages arrive, which a naively-resolving fake cannot do.
 * Hence `manualWrites`: every `set`/`remove` parks in a queue until the test
 * releases it, letting a test reproduce the exact race it cares about.
 */

export interface Deferred<T = void> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res as (value: T) => void;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Yields to the macrotask queue, which drains every pending microtask first.
 * Used instead of a bare `await` because the worker chains several awaits per
 * message and a single turn would observe it half-finished.
 */
export function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

type MessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void
) => unknown;

interface QueuedWrite {
  run: () => void;
}

export interface ChromeStubOptions {
  /** Seed data for `chrome.storage.local`. */
  initial?: Record<string, unknown>;
  /** Park writes until `flushWrites`/`releaseNextWrite` is called. */
  manualWrites?: boolean;
}

export function createChromeStub(options: ChromeStubOptions = {}) {
  const data: Record<string, unknown> = { ...(options.initial ?? {}) };
  const writeQueue: QueuedWrite[] = [];
  const failures: Array<{ error: unknown }> = [];

  const getCalls: string[] = [];
  const setCalls: Record<string, unknown>[] = [];
  const removeCalls: string[] = [];
  /** Ordered log of mutating operations, for interleaving assertions. */
  const opLog: Array<"set" | "remove"> = [];

  const sentMessages: unknown[] = [];
  let sendBehavior: { mode: "resolve" | "reject" | "throw"; error?: unknown } = {
    mode: "resolve",
  };

  const readFailures: Array<{ error: unknown }> = [];
  const storageListeners: Array<
    (changes: Record<string, unknown>, area: string) => void
  > = [];
  let manifest: Record<string, unknown> = {
    version: "0.5.0",
    manifest_version: 3,
  };

  let listener: MessageListener | null = null;
  let lastReturn: unknown;

  function enqueue(apply: () => void): Promise<void> {
    const failure = failures.shift();
    const d = deferred();
    const run = (): void => {
      if (failure) {
        d.reject(failure.error);
        return;
      }
      apply();
      d.resolve();
    };
    if (options.manualWrites) {
      writeQueue.push({ run });
    } else {
      void Promise.resolve().then(run);
    }
    return d.promise;
  }

  const get = vi.fn((key: string) => {
    getCalls.push(key);
    const failure = readFailures.shift();
    if (failure) {
      return Promise.reject(failure.error);
    }
    return Promise.resolve(key in data ? { [key]: data[key] } : {});
  });

  const set = vi.fn((items: Record<string, unknown>) => {
    setCalls.push(items);
    opLog.push("set");
    return enqueue(() => {
      Object.assign(data, items);
    });
  });

  const remove = vi.fn((key: string) => {
    removeCalls.push(key);
    opLog.push("remove");
    return enqueue(() => {
      delete data[key];
    });
  });

  /**
   * Stands in for the content script's outbound channel. MV3 returns a promise
   * here, and the worker may be asleep, so the reject/throw modes exist to
   * exercise the caller's failure handling.
   */
  const sendMessage = vi.fn((message: unknown) => {
    sentMessages.push(message);
    if (sendBehavior.mode === "throw") {
      throw sendBehavior.error;
    }
    if (sendBehavior.mode === "reject") {
      return Promise.reject(sendBehavior.error);
    }
    return Promise.resolve({ ok: true });
  });

  const chrome = {
    storage: {
      local: { get, set, remove },
      onChanged: {
        addListener: (
          fn: (changes: Record<string, unknown>, area: string) => void
        ) => {
          storageListeners.push(fn);
        },
      },
    },
    runtime: {
      sendMessage,
      getManifest: () => manifest,
      onMessage: {
        addListener: (fn: MessageListener) => {
          listener = fn;
        },
      },
    },
  };

  return {
    data,
    getCalls,
    setCalls,
    removeCalls,
    opLog,
    get,
    set,
    remove,
    sendMessage,
    sentMessages,

    /** Controls how `runtime.sendMessage` fails, for error-path coverage. */
    setSendMessageBehavior(
      mode: "resolve" | "reject" | "throw",
      error: unknown = new Error("message port closed")
    ): void {
      sendBehavior = { mode, error };
    },

    /** Makes the next `storage.local.get` reject. */
    failNextRead(error: unknown = new Error("storage read failed")): void {
      readFailures.push({ error });
    },

    setManifest(next: Record<string, unknown>): void {
      manifest = next;
    },

    /** Fires `storage.onChanged` as Chrome would after a write. */
    emitStorageChanged(
      changes: Record<string, unknown>,
      area = "local"
    ): void {
      for (const fn of storageListeners) {
        fn(changes, area);
      }
    },

    storageListenerCount(): number {
      return storageListeners.length;
    },

    /** Installs the stub as the global `chrome` the worker will bind to. */
    install(): void {
      (globalThis as { chrome?: unknown }).chrome =
        chrome as unknown as typeof globalThis.chrome;
    },

    uninstall(): void {
      delete (globalThis as { chrome?: unknown }).chrome;
    },

    /** Makes the next `set`/`remove` reject, simulating a quota or IO error. */
    failNextWrite(error: unknown = new Error("storage failure")): void {
      failures.push({ error });
    },

    pendingWrites(): number {
      return writeQueue.length;
    },

    /**
     * Releases parked writes in order. Releasing one lets the worker's promise
     * chain schedule the next, so the loop re-checks the queue after each turn.
     */
    async flushWrites(limit = 50): Promise<void> {
      for (let i = 0; i < limit; i++) {
        const next = writeQueue.shift();
        if (!next) {
          await tick();
          if (writeQueue.length === 0) {
            return;
          }
          continue;
        }
        next.run();
        await tick();
      }
      throw new Error("flushWrites exceeded its release limit");
    },

    /** Value the `onMessage` listener returned (`true` keeps the channel open). */
    get lastReturn(): unknown {
      return lastReturn;
    },

    hasListener(): boolean {
      return listener !== null;
    },

    /** Delivers a message and resolves with whatever `sendResponse` receives. */
    dispatch(message: unknown): Promise<unknown> {
      if (!listener) {
        throw new Error("no chrome.runtime.onMessage listener registered");
      }
      return new Promise((resolve) => {
        lastReturn = listener!(message, {}, (response) => resolve(response));
      });
    },
  };
}

export type ChromeStub = ReturnType<typeof createChromeStub>;
