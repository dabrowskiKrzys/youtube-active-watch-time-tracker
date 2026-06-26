chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "INTERVAL") {
    // Placeholder: real storage logic will be added in Phase 7
    console.log(`[YT Tracker BG] received interval: ${message.seconds}s`);
  }
  sendResponse({ ok: true });
});
