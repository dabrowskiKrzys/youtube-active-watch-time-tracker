import { STORAGE_KEY } from "../lib/constants";
import {
  addSeconds,
  localDateKey,
  type WatchTimeStore,
} from "../lib/storage";
import { isIntervalMessage, isResetMessage } from "../lib/messages";

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

// Delete all stored watch-time data. Runs on the same writeChain as interval
// writes so a reset can never interleave with an in-flight read-modify-write.
function resetStore(): Promise<void> {
  writeChain = writeChain
    .then(async () => {
      await chrome.storage.local.remove(STORAGE_KEY);
    })
    .catch((error) => {
      console.warn("[YT Tracker BG] failed to reset store", error);
    });
  return writeChain;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isResetMessage(message)) {
    // Respond only after the clear settles so the popup can await the round-trip
    // and re-render the empty state. Returning true keeps the channel open.
    void resetStore().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (isIntervalMessage(message) && message.seconds > 0) {
    void recordSeconds(message.seconds);
  }
  sendResponse({ ok: true });
  return undefined;
});
