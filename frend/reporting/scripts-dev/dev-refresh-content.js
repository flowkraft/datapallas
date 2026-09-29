// The content half of the dev loop.
//
// A dev server hot-reloads its CODE from the sources, but it reads its CONTENT -- samples, report
// templates, groovy scripts, the sample databases, the whole db-template tree -- from
// testground/e2e, which is a copy of the assembled package. That copy is made once (gulp
// e2e-package-javastuff-if-needed) and never refreshed afterwards, so a new sample or a new demo
// dataset stays invisible until somebody rebuilds everything.
//
// This runs AssemblerTest#refreshContentForE2E -- the packaging, on the jars that are already built,
// so none of the 26 minutes a full assembly spends rebuilding them -- and copies the result over
// testground/e2e, leaving alone the things the RUNNING installation owns.
//
// Usage: npm run custom:dev-refresh-content [-- --copy-only]
//        --copy-only skips the packaging and just copies the package that is already there.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const TOP = path.resolve(__dirname, "../../..");
const PACKAGE_DIR = path.join(TOP, "asbl/target/package/verified-db-noexe");
const TESTGROUND = path.join(TOP, "frend/reporting/testground/e2e");
const COPY_ONLY = process.argv.includes("--copy-only");

// What a refresh must not touch, relative to the package top folder: not build output, but the state
// of a live server. Everything else is the packager's to own -- including db/sample-northwind-*,
// which the packager generates (the assembler's own filter keeps them out of db-template) and which
// is how new demo data reaches a dev server at all.
const KEEP = [
  "config/_internal",   // .master-key, .embed-key, api-key.txt, iam.db, the licence in use
  "config/connections", // connections defined in this dev server
  "config/reports",     // reports created in this dev server
  "config/burst",       // My Reports settings, as changed in this dev server
  "logs",
  "output",
  "backup",
  "quarantine",
  "temp",
];

const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

function fail(message) {
  console.error(`dev-refresh-content: ${message}`);
  process.exit(1);
}

function mvn(args) {
  const started = Date.now();
  const result = spawnSync(process.platform === "win32" ? "mvn.cmd" : "mvn", args, {
    cwd: TOP,
    stdio: "inherit",
  });
  console.log(`dev-refresh-content: maven finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (result.status !== 0) fail("the content packaging failed -- see the maven output above");
}

function packagedTopFolder() {
  const entries = fs.existsSync(PACKAGE_DIR) ? fs.readdirSync(PACKAGE_DIR) : [];
  const found = entries.find((name) => fs.statSync(path.join(PACKAGE_DIR, name)).isDirectory());
  if (!found) fail(`no packaged installation under ${PACKAGE_DIR}`);
  return path.join(PACKAGE_DIR, found);
}

function copyContent(from, to) {
  const keep = KEEP.map((p) => path.join(from, p));
  let copied = 0;
  fs.cpSync(from, to, {
    recursive: true,
    force: true,
    filter: (src) => {
      if (keep.includes(src)) return false;
      if (SKIP_DIRS.has(path.basename(src))) return false;
      copied += 1;
      return true;
    },
  });
  return copied;
}

const started = Date.now();

if (!fs.existsSync(TESTGROUND)) {
  fail(`${TESTGROUND} does not exist yet -- the dev server has never been prepared here, so there is\n` +
       "                     nothing to refresh. Run the full AssemblerTest#prepareForE2E once first.");
}

if (COPY_ONLY) {
  console.log("dev-refresh-content: --copy-only, using the package that is already there");
} else {
  console.log("dev-refresh-content: packaging the content (no jar rebuild) ...");
  mvn(["-B", "test", "-pl", "asbl", "-Dtest=AssemblerTest#refreshContentForE2E", "-DfailIfNoTests=false"]);
}

const from = packagedTopFolder();
console.log(`dev-refresh-content: copying ${from}\n                  -> ${TESTGROUND}`);
const copied = copyContent(from, TESTGROUND);

console.log(
  `dev-refresh-content: ${copied} entries refreshed in ${((Date.now() - started) / 1000).toFixed(1)}s. ` +
    "The server reads content per request, so it is live now -- no restart."
);
