import { POLL_INTERVAL_MS } from "../lib/constants";

function init() {
  const video = document.querySelector("video");
  if (!video) {
    // Retry until YouTube renders the video element
    setTimeout(init, 500);
    return;
  }

  let prevTime = video.currentTime;

  setInterval(() => {
    const currTime = video.currentTime;
    // Placeholder: real tracking logic will replace this in Phase 7
    console.log(
      `[YT Tracker] prev=${prevTime.toFixed(2)} curr=${currTime.toFixed(2)}`
    );
    prevTime = currTime;
  }, POLL_INTERVAL_MS);
}

init();
