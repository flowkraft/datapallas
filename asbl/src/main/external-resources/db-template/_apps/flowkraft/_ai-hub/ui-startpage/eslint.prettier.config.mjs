// Formatting differences as ESLint warnings (rule prettier/prettier), so Jenkins can show them as a table (asbl/ci/dp-ci.sh quality).
// Report only: never `eslint --fix` or `prettier --write`. eslint-plugin-prettier and prettier are installed by that CI step into a
// scratch copy of this app, they are not dependencies of the shipped app; to run it by hand: npm i --no-save eslint-plugin-prettier prettier
import prettierPlugin from "eslint-plugin-prettier";
import tsParser from "@typescript-eslint/parser";

export default [
  { ignores: [".next/**", ".build/**", "out/**", "build/**", "next-env.d.ts", "public/**"] },
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    languageOptions: { parser: tsParser },
    plugins: { prettier: prettierPlugin },
    rules: { "prettier/prettier": "warn" },
  },
];
