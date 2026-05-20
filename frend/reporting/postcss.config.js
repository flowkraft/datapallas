/* Canonical Tailwind v4 PostCSS config — same shape as the reference
   manthanank/angular-tailwindcss repo. Works for production esbuild builds.
   The Vite-backed dev-server (ng serve / @angular/build:dev-server) has a
   separate known issue mangling Tailwind v4's @plugin directive — tracked
   upstream at https://github.com/tailwindlabs/tailwindcss/issues/16964 and
   not fixable from this config. Use `npm run electron:local` for development
   until that fix lands. */
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
