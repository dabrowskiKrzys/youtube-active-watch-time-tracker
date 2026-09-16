/**
 * Vite's `?raw` suffix returns a module's file contents as a string.
 * Used by the popup test suite to mount the real popup markup instead of a
 * hand-written fixture, so a structural change to the HTML breaks the tests.
 */
declare module "*.html?raw" {
  const content: string;
  export default content;
}
