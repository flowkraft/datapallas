// The live half of the content loop: mirror db-template onto the running dev server.
//
// A dev server reads its content from testground/e2e, a copy of the assembled package -- so editing
// a report template or a groovy script under db-template changes nothing until the content is
// packaged again. Packaging is three minutes (scripts-dev/dev-refresh-content.js); an edit to a file
// that is ALREADY in the installation does not need any of it, because the packager only copies it.
// This watches db-template and copies each changed file straight onto the running server, in
// milliseconds. Content is read per request, so it is live at once -- nothing restarts.
//
// What it deliberately does NOT do: invent files. A file the installation has never seen is a new
// sample or a new dataset, and those need the packager (it writes each sample its settings.xml and
// reporting.xml, and regenerates the sample databases). When it sees one it says so and stops there.
//
// Started automatically by `dp-ci.sh dev` (--live) next to dev-watch-backend.js.
// Usage: npm run custom:dev-watch-content

const fs = require("fs");
const path = require("path");

const TOP = path.resolve(__dirname, "../../..");
const SOURCE = path.join(TOP, "asbl/src/main/external-resources/db-template");
const TESTGROUND = path.join(TOP, "frend/reporting/testground/e2e");
const DEBOUNCE_MS = 150;

// The state of the running installation, not content: never mirror onto it. Same list as
// dev-refresh-content.js, and for the same reason.
const KEEP = [
  "config/_internal",
  "config/connections",
  "config/reports",
  "config/burst",
  "logs",
  "output",
  "backup",
  "quarantine",
  "temp",
];

const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "target", "dist"]);

// An index of the installation, basename -> paths. The packager MOVES a few files on its way into
// the package (the cube dashboards' HTML templates go from config/samples into samples/reports/
// cubes), and this is how a changed file finds where it actually lives without this script having to
// know the packager's rules -- there is only one place those rules belong.
let index = null;

function buildIndex(dir, into, depth) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (depth < 12) buildIndex(full, into, depth + 1);
    } else {
      const found = into.get(entry.name);
      if (found) found.push(full);
      else into.set(entry.name, [full]);
    }
  }
  return into;
}

function installedPathFor(rel, base) {
  const direct = path.join(TESTGROUND, rel);
  if (fs.existsSync(direct)) return direct;
  if (index === null) index = buildIndex(TESTGROUND, new Map(), 0);
  const candidates = index.get(base) || [];
  return candidates.length === 1 ? candidates[0] : null;
}

function isKept(rel) {
  const posix = rel.split(path.sep).join("/");
  return KEEP.some((k) => posix === k || posix.startsWith(k + "/"));
}

const pending = new Map();

function onChange(rel) {
  const base = path.basename(rel);
  if (base.startsWith(".") && base.endsWith(".swp")) return;
  if (base.endsWith("~")) return;
  if (rel.split(path.sep).some((part) => SKIP_DIRS.has(part))) return;
  if (isKept(rel)) return;

  clearTimeout(pending.get(rel));
  pending.set(
    rel,
    setTimeout(() => {
      pending.delete(rel);
      const from = path.join(SOURCE, rel);
      if (!fs.existsSync(from) || !fs.statSync(from).isFile()) return; // deleted, or a new directory

      const to = installedPathFor(rel, base);
      if (!to) {
        console.log(
          `content-watch: ${rel} is not in the installation yet -- a new sample or dataset needs the\n` +
            "               packager: dp-ci.sh dev --refresh-content"
        );
        return;
      }
      try {
        fs.copyFileSync(from, to);
        const moved = to !== path.join(TESTGROUND, rel);
        console.log(
          `content-watch: ${rel}${moved ? ` -> ${path.relative(TESTGROUND, to)}` : ""} (live, no restart)`
        );
      } catch (err) {
        console.log(`content-watch: could not copy ${rel}: ${err.message}`);
      }
    }, DEBOUNCE_MS)
  );
}

if (!fs.existsSync(TESTGROUND)) {
  console.log(`content-watch: ${TESTGROUND} does not exist -- nothing to mirror onto; not watching`);
  process.exit(0);
}

console.log(`content-watch: watching ${SOURCE}\n               -> ${TESTGROUND}`);
fs.watch(SOURCE, { recursive: true }, (_event, name) => {
  if (name) onChange(name);
});
