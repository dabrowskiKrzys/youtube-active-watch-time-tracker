import { STORAGE_KEY } from "../lib/constants";
import {
  addSeconds,
  localDateKey,
  type WatchTimeStore,
} from "../lib/storage";

interface IntervalMessage {
  type: "INTERVAL";
  seconds: number;
}

function isIntervalMessage(message: unknown): message is IntervalMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    (message as { type?: unknown }).type === "INTERVAL" &&
    typeof (message as { seconds?: unknown }).seconds === "number"
  );
}

// Serialize all read-modify-write operations through a single promise chain so
// overlapping INTERVAL messages never clobber each other's writes. MV3 workers
// can be torn down between messages, so chrome.storage.local is the source of
// truth and is re-read on every message.
let writeChain: Promise<void> = Promise.resolve();

async function readStore(): Promise<WatchTimeStore> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const store = result[STORAGE_KEY];
  return store && typeof store === "object" ? (store as WatchTimeStore) : {};
}

function recordSeconds(seconds: number): Promise<void> {
  writeChain = writeChain
    .then(async () => {
      const store = await readStore();
      const next = addSeconds(store, localDateKey(new Date()), seconds);
      await chrome.storage.local.set({ [STORAGE_KEY]: next });
    })
    .catch((error) => {
      console.warn("[YT Tracker BG] failed to persist interval", error);
    });
  return writeChain;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isIntervalMessage(message) && message.seconds > 0) {
    void recordSeconds(message.seconds);
  }
  sendResponse({ ok: true });
});
