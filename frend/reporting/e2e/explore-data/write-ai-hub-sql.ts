// Writes ai-hub-sql.generated.json: every AI Hub case's SQL, for each of the
// nine vendor keys, built by the very functions the product calls.
//
// Why a committed file. The generator is TypeScript and the databases are
// reached from Java, which is how production splits it too: AI Hub builds the
// SQL and the backend runs it. So the SQL crosses the line as a file - written
// here, read by the AI Hub half of GeneratedSqlAllVendorsTest - and because it
// is committed, a change to the generator shows up in review as a per-vendor
// SQL diff. Jasmine block 10 fails when the file is stale and names this
// command.
//
// Run it the way the Jasmine suite runs, from `frend/reporting`:
//   docker run --rm -v <repo>:/x -w /x/frend/reporting node:20-slim \
//     npx ts-node -r tsconfig-paths/register --project e2e/tsconfig.e2e.json \
//     e2e/explore-data/write-ai-hub-sql.ts
//
// Nothing here writes vendor SQL of its own: every form comes from the
// generator and its vendor layer (THE RULE).

import * as fs from "fs";

import { buildAiHubCaseSql, GENERATED_FILE, readAiHubCases, VENDOR_KEYS } from "./ai-hub-sql";

const { cases } = readAiHubCases();

const out: Record<string, Record<string, string>> = {};
for (const one of cases) {
  const perVendor: Record<string, string> = {};
  for (const vendor of VENDOR_KEYS) {
    perVendor[vendor] = buildAiHubCaseSql(one, vendor);
  }
  out[one.id] = perVendor;
}

fs.writeFileSync(GENERATED_FILE, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`${GENERATED_FILE}: ${cases.length} cases x ${VENDOR_KEYS.length} vendors`);
