import { STORAGE_KEY } from "../lib/constants";
import {
  formatDuration,
  getSecondsForDate,
  localDateKey,
  type WatchTimeStore,
} from "../lib/storage";

const versionEl = document.getElementById("version");
if (versionEl) {
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `v${manifest.version}`;
}

async function renderTodayTotal(): Promise<void> {
  const totalEl = document.getElementById("today-total");
  if (!totalEl) {
    return;
  }
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const raw = result[STORAGE_KEY];
    const store: WatchTimeStore =
      raw && typeof raw === "object" ? (raw as WatchTimeStore) : {};
    const seconds = getSecondsForDate(store, localDateKey(new Date()));
    totalEl.textContent = formatDuration(seconds);
  } catch (error) {
    console.warn("[YT Tracker] failed to read today's total", error);
    totalEl.textContent = "0m";
  }
}

void renderTodayTotal();
