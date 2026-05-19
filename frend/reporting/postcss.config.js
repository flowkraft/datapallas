/* Canonical Tailwind v4 PostCSS config — same shape as the reference
   manthanank/angular-tailwindcss repo. Works under both Angular's esbuild
   production builder (@angular/build:application) and the Vite-backed
   dev-server, as long as `src/tailwind.css` does NOT contain a `@source`
   directive (the explicit @source path triggers a null-byte path crash
   when @tailwindcss/postcss processes Vite's html-proxy virtual files). */
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
