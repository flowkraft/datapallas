/* PostCSS config for Tailwind v4 + Angular @angular/build:application builder.
 *
 * Why the function form (ctx-aware) instead of the simple object form:
 *
 * Angular 18's dev-server uses Vite under the hood. Vite extracts CSS from
 * index.html via its `html-proxy` mechanism and passes those chunks to PostCSS
 * with a virtual path prefixed by a null byte (e.g. `\x00/index.html?html-proxy&index=0.css`).
 * @tailwindcss/postcss 4.3.0 hands that path to Node's `path` module, which
 * rejects strings containing null bytes and throws:
 *
 *   [plugin:vite:css] [postcss] tailwindcss:
 *   The argument 'path' must be a string, Uint8Array, or URL without null bytes.
 *
 * The guard below skips the tailwind plugin for these virtual modules. The CSS
 * they carry is the styles bundle Angular has already run through the full
 * Tailwind pipeline once on the real file — re-running tailwindcss on the
 * html-proxy chunk is redundant. Production esbuild builds never hit this
 * code path (no Vite, no html-proxy), so they remain canonical.
 *
 * Equivalent in intent to using @tailwindcss/vite for the Vite-driven dev
 * server, without needing to inject a Vite plugin (Angular 18 doesn't expose
 * that officially). Remove this guard once @tailwindcss/postcss publishes a
 * Vite-virtual-path-safe release.
 */
module.exports = (ctx) => {
  const from = (ctx && ctx.file && ctx.file.dirname) || (ctx && ctx.from) || '';
  const isViteVirtualHtmlProxy =
    typeof from === 'string' && (from.includes('\0') || from.includes('?html-proxy'));

  if (isViteVirtualHtmlProxy) {
    return { plugins: [] };
  }

  return {
    plugins: {
      '@tailwindcss/postcss': {},
    },
  };
};
