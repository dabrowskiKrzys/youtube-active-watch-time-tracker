const versionEl = document.getElementById("version");
if (versionEl) {
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = `v${manifest.version}`;
}
