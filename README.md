# YouTube Active Watch Time Tracker

A Chrome extension that tracks **confirmed active YouTube playback time** locally — no account, no cloud, no telemetry.

It only counts time when a YouTube video is genuinely playing (the video's time position is advancing). It does **not** count idle open tabs, paused videos, or forgotten playback.

## Why

YouTube doesn't tell you how much time you actually spent watching. Browser history shows page visits, not playback. This extension answers: _"How much time did I really spend watching YouTube today?"_

## Install (unpacked, developer mode)

1. Go to the [Releases page](../../releases) and download `dist.zip` from the latest release.
2. Extract the zip somewhere stable (e.g. `~/youtube-watch-time-tracker/`).
3. Open Chrome and navigate to `chrome://extensions`.
4. Enable **Developer mode** (toggle in the top right).
5. Click **Load unpacked** and select the extracted folder.
6. The extension icon should now appear in your toolbar.

## Usage

- Watch a YouTube video as usual.
- Click the extension icon to see today's confirmed watch time and the last 7 days.
- Use the **Delete all data** button to wipe stored data.

## Privacy

- All data stays in `chrome.storage.local`.
- The extension requests only the `storage` permission.
- Content scripts run only on `https://www.youtube.com/watch*`.
- No external network requests. No analytics. No telemetry.

## Updates

This extension is distributed via GitHub Releases — there is no auto-update mechanism. Check the [Releases page](../../releases) occasionally for new versions, then repeat the install steps with the new zip.

## License

MIT — see [LICENSE](LICENSE).
