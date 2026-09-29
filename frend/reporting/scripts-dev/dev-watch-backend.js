// dev-watch-backend: the missing half of Spring Boot's reload loop.
//
// DevTools restarts the running context as soon as a .class file under a classpath DIRECTORY changes,
// and `mvn spring-boot:run` puts bkend/server/target/classes first on that classpath. Nothing, however,
// was ever recompiling those classes while the dev server ran, so nothing ever triggered a restart and
// every backend change meant stopping the dev server and paying a full rebuild. Measured here: a cold
// start is ~5.8 s, a DevTools restart ~1.8 s.
//
// This watches the backend sources and rebuilds the one module that changed. bkend/server compiles
// straight into the watched directory, so DevTools picks it up on its own. rb-common and rb-reporting
// are consumed as JARS, and DevTools does not watch jars, so those get an install plus an explicit
// nudge of a file it does watch.
//
// No new dependency and no OS branch: node's own fs.watch watches recursively on Windows, macOS and
// (since node 20) Linux, which is what every lane here runs.
//
//   npm run custom:dev-watch-backend        (dp-ci.sh dev --live starts it for you)

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const TOP = path.resolve(__dirname, "../../..");
const SERVER_CLASSES = path.join(TOP, "bkend/server/target/classes");
const DEBOUNCE_MS = 400;

// First match wins, so the most specific source tree is listed first.
const MODULES = [
  { name: "rb-server", dir: path.join(TOP, "bkend/server"), goal: "compile", nudge: false },
  { name: "rb-common", dir: path.join(TOP, "bkend/common"), goal: "install", nudge: true },
  { name: "rb-reporting", dir: path.join(TOP, "bkend/reporting"), goal: "install", nudge: true },
];

const WATCHED_EXT = new Set([".java", ".xml", ".properties", ".yml", ".yaml", ".groovy", ".sql"]);

let timer = null;
const pending = new Set();

function moduleOf(file) {
  return MODULES.find((m) => file.startsWith(m.dir + path.sep));
}

// A rebuilt jar is invisible to DevTools, which only watches classpath directories. Touching a file
// it does watch makes the restart happen; the compiled classes themselves are left alone.
function nudgeDevTools() {
  try {
    fs.mkdirSync(SERVER_CLASSES, { recursive: true });
    fs.writeFileSync(path.join(SERVER_CLASSES, ".restart-trigger"), String(Date.now()));
  } catch (e) {
    console.log("dev-watch: could not nudge DevTools: " + e.message);
  }
}

function rebuild() {
  const mods = new Set();
  for (const f of pending) {
    const m = moduleOf(f);
    if (m) mods.add(m);
  }
  pending.clear();

  for (const m of mods) {
    const started = Date.now();
    console.log("dev-watch: " + m.name + " changed -> mvn " + m.goal);
    const r = spawnSync(process.platform === "win32" ? "mvn.cmd" : "mvn",
      ["-B", "-q", m.goal, "-DskipTests", "-f", path.join(m.dir, "pom.xml")],
      { stdio: "inherit" });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    if (r.status !== 0) {
      console.log("dev-watch: " + m.name + " FAILED after " + secs + "s - the server keeps the old code");
      continue;
    }
    console.log("dev-watch: " + m.name + " rebuilt in " + secs + "s");
    if (m.nudge) nudgeDevTools();
  }
}

function onChange(file) {
  if (!WATCHED_EXT.has(path.extname(file))) return;
  if (file.includes(path.sep + "target" + path.sep)) return;
  pending.add(file);
  clearTimeout(timer);
  timer = setTimeout(rebuild, DEBOUNCE_MS);
}

let watching = 0;
for (const m of MODULES) {
  const src = path.join(m.dir, "src", "main");
  if (!fs.existsSync(src)) continue;
  fs.watch(src, { recursive: true }, (_event, name) => {
    if (name) onChange(path.join(src, name));
  });
  watching++;
  console.log("dev-watch: watching " + path.relative(TOP, src));
}

if (watching === 0) {
  console.log("dev-watch: no backend sources found - is this frend/reporting inside the repo?");
  process.exit(1);
}
console.log("dev-watch: ready. Change a backend source and the dev server reloads on its own.");
