import { describe, expect, it } from "vitest";

import manifestJson from "../../manifest.json";
import packageJson from "../../package.json";

/**
 * Guards the extension's externally-visible surface.
 *
 * The manifest is the only place where the privacy guarantee from
 * `context/foundation/prd.md` is enforceable: all watch-time data stays in
 * chrome.storage.local, with no host permissions, no remote endpoints, and no
 * origin beyond youtube.com. A silent widening here would pass every other test
 * while breaking the product's core promise, so it is asserted exactly rather
 * than loosely.
 *
 * Widened to `Record<string, unknown>` so absent keys can be asserted as
 * undefined; the JSON-inferred literal type has no property to reference for
 * permissions the manifest must *not* declare.
 */
const manifest: Record<string, unknown> = manifestJson;
const pkg: { version: string } = packageJson;

describe("manifest permissions", () => {
  it("requests storage and nothing else", () => {
    expect(manifest.permissions).toEqual(["storage"]);
  });

  it("declares no host permissions", () => {
    expect(manifest.host_permissions).toBeUndefined();
  });

  it("is not reachable from web pages or other extensions", () => {
    expect(manifest.externally_connectable).toBeUndefined();
    expect(manifest.web_accessible_resources).toBeUndefined();
  });
});

describe("content script scope", () => {
  const contentScripts = manifest.content_scripts as Array<{
    matches: string[];
    js: string[];
  }>;

  it("registers exactly one content script", () => {
    expect(contentScripts).toHaveLength(1);
  });

  // Deliberately the whole youtube.com origin, not `/watch*`: YouTube is a
  // single-page app, so the script must already be running on non-watch pages
  // to hear `yt-navigate-finish` when the user navigates *into* a video.
  // `isWatchPath` in src/lib/navigation.ts is the runtime gate that decides
  // whether to actually count.
  it("is scoped to the youtube.com origin only", () => {
    expect(contentScripts[0].matches).toEqual(["https://www.youtube.com/*"]);
  });
});

describe("manifest metadata", () => {
  it("targets Manifest V3", () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it("uses a module service worker rather than a persistent background page", () => {
    expect(manifest.background).toEqual({
      service_worker: "src/background/index.ts",
      type: "module",
    });
  });

  // The popup renders its version badge from chrome.runtime.getManifest(), so
  // drift here ships a build that misreports itself to the user.
  it("keeps version in sync with package.json", () => {
    expect(manifest.version).toBe(pkg.version);
  });
});
