// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import popupHtml from "../popup.html?raw";
import { createChromeStub, type ChromeStub } from "../../test/chrome-stub";

/**
 * Popup: rendering, live refresh, and the delete-all flow.
 *
 * This is the only surface the user sees, and it owns the one irreversible
 * action in the product. Cases map to risks in
 * `context/foundation/test-plan.md` (R4 popup half, R8, R11).
 *
 * The markup is mounted from the real `popup.html` rather than a fixture, so a
 * renamed id or restructured row fails here instead of passing silently and
 * breaking only in the browser.
 */

const STORAGE_KEY = "watchTime";
const TODAY = "2026-09-16";

let stub: ChromeStub;
let warn: ReturnType<typeof vi.spyOn>;

function mountPopupMarkup(): void {
  const parsed = new DOMParser().parseFromString(popupHtml, "text/html");
  // The module script would be a no-op in jsdom, but dropping it keeps the
  // mounted tree to just the markup under test.
  parsed.querySelectorAll("script").forEach((node) => node.remove());
  const nodes = Array.from(parsed.body.childNodes).map((node) =>
    document.importNode(node, true)
  );
  document.body.replaceChildren(...nodes);
}

/** Yields to the macrotask queue so the popup's async refresh can settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadPopup(): Promise<void> {
  vi.resetModules();
  await import("../popup");
  await flush();
}

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`#${id} missing from popup markup`);
  }
  return el;
}

function historyRows(): HTMLLIElement[] {
  return Array.from(byId("history-list").querySelectorAll("li"));
}

function rowValue(row: HTMLLIElement): string {
  return row.querySelector(".history-value")?.textContent ?? "";
}

function rowLabel(row: HTMLLIElement): string {
  return row.querySelector(".history-day")?.textContent ?? "";
}

function barWidth(row: HTMLLIElement): string {
  return (row.querySelector(".bar-fill") as HTMLElement | null)?.style.width ?? "";
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 16, 12, 0, 0));
  stub = createChromeStub();
  stub.install();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  mountPopupMarkup();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  stub.uninstall();
  document.body.replaceChildren();
});

describe("PU-01 today's total", () => {
  it("formats an hours-and-minutes total", async () => {
    stub.data[STORAGE_KEY] = { [TODAY]: 3725 };
    await loadPopup();

    expect(byId("today-total").textContent).toBe("1h 2m");
  });

  it("formats a sub-hour total", async () => {
    stub.data[STORAGE_KEY] = { [TODAY]: 900 };
    await loadPopup();

    expect(byId("today-total").textContent).toBe("15m");
  });

  it("ignores other days when showing today", async () => {
    stub.data[STORAGE_KEY] = { "2026-09-15": 7200, [TODAY]: 60 };
    await loadPopup();

    expect(byId("today-total").textContent).toBe("1m");
  });
});

describe("PU-02 empty state", () => {
  it("renders zeroes and a full seven-day window", async () => {
    await loadPopup();

    expect(byId("today-total").textContent).toBe("0m");
    expect(byId("history-total").textContent).toBe("0m");

    const rows = historyRows();
    expect(rows).toHaveLength(7);
    for (const row of rows) {
      expect(rowValue(row)).toBe("0m");
      expect(row.classList.contains("is-empty")).toBe(true);
    }
  });
});

describe("PU-03 seven-day history", () => {
  beforeEach(() => {
    stub.data[STORAGE_KEY] = {
      [TODAY]: 3600,
      "2026-09-15": 1800,
      "2026-09-12": 600,
      // Outside the window - must not appear or be summed.
      "2026-09-01": 99999,
    };
  });

  it("lists exactly seven rows, newest first", async () => {
    await loadPopup();

    const rows = historyRows();
    expect(rows).toHaveLength(7);
    expect(rowLabel(rows[0])).toBe("Today");
    expect(rows[0].classList.contains("is-today")).toBe(true);
    expect(rowValue(rows[0])).toBe("1h 0m");
    expect(rowValue(rows[1])).toBe("30m");
  });

  it("marks only days with no watch time as empty", async () => {
    await loadPopup();

    const rows = historyRows();
    expect(rows[0].classList.contains("is-empty")).toBe(false);
    expect(rows[1].classList.contains("is-empty")).toBe(false);
    expect(rows[2].classList.contains("is-empty")).toBe(true);
  });

  it("sums only the days inside the window", async () => {
    await loadPopup();

    // 3600 + 1800 + 600 = 6000s = 1h 40m; the out-of-window day is excluded.
    expect(byId("history-total").textContent).toBe("1h 40m");
  });

  it("labels non-today days by their local weekday", async () => {
    await loadPopup();

    const rows = historyRows();
    // Locale-independent: the label is produced by toLocaleDateString with the
    // system locale (e.g. "Mon" in en-US, "wt." in pl-PL), so asserting ASCII
    // letters would only pass on some machines. What must hold everywhere is
    // that it is a non-empty, non-"Today" label matching a *locally* built Date
    // for that key.
    const expected = new Date(2026, 8, 15).toLocaleDateString(undefined, {
      weekday: "short",
    });
    expect(rowLabel(rows[1])).toBe(expected);
    expect(rowLabel(rows[1])).not.toBe("Today");
  });

  it("gives all seven days distinct labels", async () => {
    await loadPopup();

    // Seven consecutive days can never share a weekday name. This is the
    // assertion that would fail if a key were parsed as UTC
    // (`new Date("2026-09-15")`) and collapsed onto the wrong day.
    const labels = historyRows().map(rowLabel);
    expect(new Set(labels).size).toBe(7);
  });
});

describe("PU-04 bar scaling", () => {
  it("scales each bar against the busiest day in the window", async () => {
    stub.data[STORAGE_KEY] = {
      [TODAY]: 3600,
      "2026-09-15": 1800,
    };
    await loadPopup();

    const rows = historyRows();
    expect(barWidth(rows[0])).toBe("100%");
    expect(barWidth(rows[1])).toBe("50%");
    expect(barWidth(rows[2])).toBe("0%");
  });

  it("renders no bar width at all for an empty window", async () => {
    await loadPopup();

    for (const row of historyRows()) {
      expect(barWidth(row)).toBe("0%");
    }
  });

  it("keeps bars decorative for assistive tech", async () => {
    stub.data[STORAGE_KEY] = { [TODAY]: 60 };
    await loadPopup();

    const bar = historyRows()[0].querySelector(".history-bar");
    expect(bar?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("PU-05 live refresh (R8)", () => {
  it("repaints when watch-time storage changes", async () => {
    await loadPopup();
    expect(byId("today-total").textContent).toBe("0m");

    stub.data[STORAGE_KEY] = { [TODAY]: 1800 };
    stub.emitStorageChanged({ [STORAGE_KEY]: { newValue: {} } }, "local");
    await flush();

    // An open popup must never keep showing a stale number while the worker
    // carries on counting.
    expect(byId("today-total").textContent).toBe("30m");
  });

  it("registers exactly one storage listener", async () => {
    await loadPopup();

    expect(stub.storageListenerCount()).toBe(1);
  });
});

describe("PU-06 ignoring irrelevant storage events", () => {
  it("does not re-read for a different storage area", async () => {
    await loadPopup();
    const before = stub.getCalls.length;

    stub.emitStorageChanged({ [STORAGE_KEY]: { newValue: {} } }, "sync");
    await flush();

    expect(stub.getCalls.length).toBe(before);
  });

  it("does not re-read for an unrelated key", async () => {
    await loadPopup();
    const before = stub.getCalls.length;

    stub.emitStorageChanged({ somethingElse: { newValue: 1 } }, "local");
    await flush();

    expect(stub.getCalls.length).toBe(before);
  });
});

describe("PU-07 unreadable storage (R4)", () => {
  it("falls back to an empty render instead of throwing", async () => {
    stub.failNextRead(new Error("storage unavailable"));
    await loadPopup();

    expect(byId("today-total").textContent).toBe("0m");
    expect(historyRows()).toHaveLength(7);
    expect(warn).toHaveBeenCalled();
  });

  it.each([
    ["a string", "garbage"],
    ["a number", 42],
    ["null", null],
  ])("renders zeroes when the stored value is %s", async (_label, corrupt) => {
    stub.data[STORAGE_KEY] = corrupt;
    await loadPopup();

    expect(byId("today-total").textContent).toBe("0m");
    expect(byId("history-total").textContent).toBe("0m");
  });
});

describe("PU-08 delete confirmation gate", () => {
  it("reveals the confirm row and hides the trigger", async () => {
    await loadPopup();

    byId("delete-btn").click();

    expect(byId("confirm-row").hasAttribute("hidden")).toBe(false);
    expect(byId("delete-btn").hasAttribute("hidden")).toBe(true);
  });

  it("reverts cleanly on cancel and sends nothing", async () => {
    await loadPopup();

    byId("delete-btn").click();
    byId("cancel-delete-btn").click();

    expect(byId("confirm-row").hasAttribute("hidden")).toBe(true);
    expect(byId("delete-btn").hasAttribute("hidden")).toBe(false);
    expect(stub.sendMessage).not.toHaveBeenCalled();
  });

  it("does not delete anything on the first click alone", async () => {
    stub.data[STORAGE_KEY] = { [TODAY]: 600 };
    await loadPopup();

    byId("delete-btn").click();
    await flush();

    expect(stub.sendMessage).not.toHaveBeenCalled();
    expect(byId("today-total").textContent).toBe("10m");
  });
});

describe("PU-09 confirmed delete", () => {
  it("sends RESET, repaints and reports success", async () => {
    stub.data[STORAGE_KEY] = { [TODAY]: 600 };
    await loadPopup();
    expect(byId("today-total").textContent).toBe("10m");

    byId("delete-btn").click();
    delete stub.data[STORAGE_KEY];
    byId("confirm-delete-btn").click();
    await flush();

    expect(stub.sentMessages).toEqual([{ type: "RESET" }]);
    expect(byId("today-total").textContent).toBe("0m");
    expect(byId("delete-status").textContent).toBe("All data deleted.");
    expect(byId("confirm-row").hasAttribute("hidden")).toBe(true);
    expect(byId("delete-btn").hasAttribute("hidden")).toBe(false);
  });
});

describe("PU-10 delete failure (R11)", () => {
  it("surfaces the error and still collapses the confirm row", async () => {
    stub.data[STORAGE_KEY] = { [TODAY]: 600 };
    await loadPopup();

    stub.setSendMessageBehavior("reject", new Error("worker unreachable"));
    byId("delete-btn").click();
    byId("confirm-delete-btn").click();
    await flush();

    expect(byId("delete-status").textContent).toBe("Delete failed — try again.");
    // A destructive control left half-open is worse than not opening it.
    expect(byId("confirm-row").hasAttribute("hidden")).toBe(true);
    expect(byId("delete-btn").hasAttribute("hidden")).toBe(false);
    // Nothing was deleted, so the figure must still be truthful.
    expect(byId("today-total").textContent).toBe("10m");
  });

  it("clears a stale status message when the flow is reopened", async () => {
    await loadPopup();

    stub.setSendMessageBehavior("reject");
    byId("delete-btn").click();
    byId("confirm-delete-btn").click();
    await flush();
    expect(byId("delete-status").textContent).not.toBe("");

    byId("delete-btn").click();

    expect(byId("delete-status").textContent).toBe("");
  });
});

describe("PU-11 version badge", () => {
  it("renders the manifest version", async () => {
    await loadPopup();

    expect(byId("version").textContent).toBe("v0.5.0");
  });

  it("follows the manifest rather than a hard-coded string", async () => {
    stub.setManifest({ version: "9.9.9" });
    await loadPopup();

    expect(byId("version").textContent).toBe("v9.9.9");
  });
});
