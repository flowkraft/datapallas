// ESLint flat config of the AI Hub app (Next.js 16, ESLint 9), the shape `create-next-app` generates: the Next.js rules plus the
// TypeScript ones. Problems are only reported (asbl/ci/dp-ci.sh quality shows them in Jenkins), never fixed or enforced.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", ".build/**", "out/**", "build/**", "next-env.d.ts"]),
]);
