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
        await renderTodayTotal();
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
