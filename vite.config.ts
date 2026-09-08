import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";
import pkg from "./package.json";

// The extension version is sourced from package.json (bumped via `npm version`)
// so releases actually re-version the built extension. crxjs reads the manifest
// object we pass here, not package.json, hence the explicit override.
export default defineConfig({
  plugins: [crx({ manifest: { ...manifest, version: pkg.version } })],
});