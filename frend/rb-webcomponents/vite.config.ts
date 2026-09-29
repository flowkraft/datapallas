import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve, dirname } from "path";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { transform } from "esbuild";
import { terser } from "rollup-plugin-terser";

// Compute __dirname for ES Modules:
const __dirname = dirname(fileURLToPath(import.meta.url));

// Optional custom minification plugin using esbuild
function minifyEs() {
  return {
    name: "minifyEs",
    renderChunk: {
      order: "post" as const,
      async handler(
        code: string | Uint8Array,
        chunk: any,
        outputOptions: { format: string }
      ) {
        if (outputOptions.format === "es") {
          const result = await transform(code, { minify: true });
          return result.code;
        }
        return code;
      },
    },
  };
}

/**
 * Puts daisyUI's own theme palettes in the bundle's folder, as `themes.css`.
 *
 * A published dashboard is served this file as `/rb-webcomponents/themes.css` and wears the theme
 * the application is on, which is a daisyUI theme name on `<html>` (D10). The file is daisyUI's,
 * taken from the version the application compiles its own themes with, so the palettes have one
 * source and none of them is ever copied by hand. It holds nothing but the `[data-theme=...]`
 * blocks, so a page that links it looks exactly as it did until something names a theme.
 *
 * daisyUI is the application's dependency, not this bundle's - the components themselves draw with
 * `currentColor` and variables and need no framework. A build that cannot find it would ship a
 * dashboard that is light whatever the application is set to, silently, so it fails instead.
 */
function daisyUiThemes() {
  const candidates = [
    resolve(__dirname, "node_modules/daisyui/themes.css"),
    resolve(__dirname, "../reporting/node_modules/daisyui/themes.css"),
  ];
  return {
    name: "daisyUiThemes",
    generateBundle() {
      const from = candidates.find((candidate) => existsSync(candidate));
      if (!from) {
        throw new Error(
          "daisyUI's themes.css was not found - looked in " +
            candidates.join(" and ") +
            ". Run npm install in frend/reporting first: a dashboard needs those palettes to " +
            "follow the theme the application is on."
        );
      }
      (this as any).emitFile({
        type: "asset",
        fileName: "themes.css",
        source: readFileSync(from, "utf8"),
      });
    },
  };
}

export default defineConfig(({ command }) => {
  if (command === "build") {
    return {
      plugins: [
        // Process normal Svelte files (exclude .wc.svelte files)
        svelte({
          exclude: "**/*.wc.svelte",
        }),
        // Process web component files (only include .wc.svelte files) and compile them as custom elements
        svelte({
          include: "**/*.wc.svelte",
          compilerOptions: {
            customElement: true,
          },
        }),
        daisyUiThemes(), // the app's theme palettes, beside the bundle, for published dashboards
        minifyEs(), // extra minification plugin using esbuild
        terser({
          compress: {
            pure_getters: true,
            unsafe: true,
            passes: 10,
          },
          mangle: true,
        }),
      ],
      build: {
        lib: {
          // Use the web component registration file as the library entry point
          entry: resolve(__dirname, "src/wc/web-components.ts"),
          name: "RbWebComponents",
          fileName: (format) => `rb-webcomponents.${format}.js`,
          // Build both ES and UMD formats
          formats: ["es", "umd"],
        },
        rollupOptions: {
          // Remove 'svelte' from the externals so it's bundled in
          external: [],
          output: {
            // no need to declare globals if nothing is external
          },
        },
        // Disable sourcemaps for production
        sourcemap: false,
        outDir: "dist",
      },
    };
  }

  // Development (dev server) configuration:
  return {
    plugins: [
      svelte({
        exclude: "**/*.wc.svelte",
      }),
      svelte({
        include: "**/*.wc.svelte",
        compilerOptions: {
          customElement: true,
        },
      }),
    ],
  };
});
