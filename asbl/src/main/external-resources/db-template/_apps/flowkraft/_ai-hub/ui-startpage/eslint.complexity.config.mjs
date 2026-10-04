// Complexity and size as ESLint warnings only (asbl/ci/dp-ci.sh quality shows them in Jenkins as their own table), separate from the lint problems of
// eslint.config.mjs. Report only: never `eslint --fix`, nothing is enforced. Thresholds are the rules' defaults. eslint-plugin-sonarjs is installed by that
// CI step into a scratch copy of this app, it is not a dependency of the shipped app; to run it by hand: npm i --no-save eslint-plugin-sonarjs
import sonarjs from "eslint-plugin-sonarjs";
import tsParser from "@typescript-eslint/parser";

export default [
  { ignores: [".next/**", ".build/**", "out/**", "build/**", "next-env.d.ts", "public/**"] },
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    languageOptions: { parser: tsParser },
    plugins: { sonarjs },
    rules: {
      complexity: "warn",
      "max-depth": "warn",
      "max-lines-per-function": "warn",
      "max-params": "warn",
      "sonarjs/cognitive-complexity": "warn",
    },
  },
];
