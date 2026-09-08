import { STORAGE_KEY } from "../lib/constants";
import {
  formatDuration,
  getSecondsForDate,
  localDateKey,
  type WatchTimeStore,
} from "../lib/storage";
import {
  formatDayLabel,
  getLastNDays,
  sumSeconds,
  DEFAULT_WINDOW_DAYS,
} from "../lib/history";

const versionEl = document.getElementById("version");
if (versionEl) {
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `v${manifest.version}`;
}

async function readStore(): Promise<WatchTimeStore> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const raw = result[STORAGE_KEY];
  return raw && typeof raw === "object" ? (raw as WatchTimeStore) : {};
}

function renderToday(store: WatchTimeStore, now: Date): void {
  const totalEl = document.getElementById("today-total");
  if (!totalEl) {
    return;
  }
  const seconds = getSecondsForDate(store, localDateKey(now));
  totalEl.textContent = formatDuration(seconds);
}

function renderHistory(store: WatchTimeStore, now: Date): void {
  const listEl = document.getElementById("history-list");
  const totalEl = document.getElementById("history-total");
  if (!listEl) {
    return;
  }
  const todayKey = localDateKey(now);
  const days = getLastNDays(store, now, DEFAULT_WINDOW_DAYS);

  listEl.replaceChildren();
  // Most-recent-first so "Today" sits directly under the Today figure.
  for (const day of [...days].reverse()) {
    const row = document.createElement("li");
    row.className = "history-row";
    if (day.dateKey === todayKey) {
      row.classList.add("is-today");
    }
    if (day.seconds === 0) {
      row.classList.add("is-empty");
    }

    const labelEl = document.createElement("span");
    labelEl.className = "history-day";
    labelEl.textContent = formatDayLabel(day.dateKey, todayKey);

    const valueEl = document.createElement("span");
    valueEl.className = "history-value";
    valueEl.textContent = formatDuration(day.seconds);

    row.append(labelEl, valueEl);
    listEl.append(row);
  }

  if (totalEl) {
    totalEl.textContent = formatDuration(sumSeconds(days));
  }
}

/** Reads storage once and repaints both the Today figure and the 7-day list. */
async function refresh(): Promise<void> {
  const now = new Date();
  try {
    const store = await readStore();
    renderToday(store, now);
    renderHistory(store, now);
  } catch (error) {
    console.warn("[YT Tracker] failed to read watch time", error);
    renderToday({}, now);
    renderHistory({}, now);
  }
}

void refresh();

// Re-render live whenever watch-time storage changes (background records a new
// interval, or a delete clears it) so an open popup never shows a stale total.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && STORAGE_KEY in changes) {
    void refresh();
  }
});

function setupDeleteControls(): void {
  const deleteBtn = document.getElementById("delete-btn");
  const confirmRow = document.getElementById("confirm-row");
  const confirmBtn = document.getElementById("confirm-delete-btn");
  const cancelBtn = document.getElementById("cancel-delete-btn");
  const statusEl = document.getElementById("delete-status");

  if (!deleteBtn || !confirmRow || !confirmBtn || !cancelBtn) {
    return;
  }

  const showConfirm = (visible: boolean): void => {
    confirmRow.toggleAttribute("hidden", !visible);
    deleteBtn.toggleAttribute("hidden", visible);
  };

  const setStatus = (text: string): void => {
    if (statusEl) {
      statusEl.textContent = text;
    }
  };

  deleteBtn.addEventListener("click", () => {
    setStatus("");
    showConfirm(true);
  });

  cancelBtn.addEventListener("click", () => {
    showConfirm(false);
  });

  confirmBtn.addEventListener("click", () => {
    void (async () => {
      try {
        await chrome.runtime.sendMessage({ type: "RESET" });
        await refresh();
        setStatus("All data deleted.");
      } catch (error) {
        console.warn("[YT Tracker] failed to delete data", error);
        setStatus("Delete failed — try again.");
      } finally {
        showConfirm(false);
      }
    })();
  });
}

setupDeleteControls();
