// @description Scaffolds the Billing Portal Backend (crons, etc.) from the bkend-boot-groovy-playground blueprint, strips the reference examples, applies _custom/overrides (a mark-overdue billing cron) (idempotent — safe to re-run)
//
// The headless backend companion to the billing-portal frontends. Same _custom convention; every run
// regenerates from a clean slate:
//   a) wipe the app folder to a clean slate (keep _custom/, runtime data, caches)
//   b) copy flowkraft/bkend-boot-groovy-playground into this app folder
//   c) DELETE src-examples/ (the reference-only cron/pipeline samples)
//   d) copy _custom/overrides/** on top (the billing cron + config + compose)
//   e) flip "visible": false -> true (once, the first time it sees false)
//
// The overrides ship a clean docker-compose.yml (renamed service/container, port 8502, the Northwind DB
// mount at the right depth, and the shared portal-DB mount ../_shared-db -> /app/shared). No demo data to
// seed — the cron opens the portals' shared SQLite DB directly and marks overdue invoices; NO REST.

import org.apache.commons.io.FileUtils
import groovy.json.JsonSlurper

// APP_ID + BASE_PATH decide WHERE this app scaffolds to; BLUEPRINT (the shared playground) never
// changes. As shipped, this example lives in the _examples/ folder. To make it YOUR OWN app, copy the
// whole folder up one level into the custom-apps home, flowkraft/xx-custom/ — e.g.
//   flowkraft/xx-custom/_examples/billing-portal-bkend  ->  flowkraft/xx-custom/my-billing-portal-bkend
// then rename APP_ID to the new folder name and set BASE_PATH = 'flowkraft/xx-custom/'. The backend
// discovers custom apps only under flowkraft/xx-custom/ (your apps directly, examples in _examples/).
// NOTE (bkend only): this compose mounts the Northwind source DB by a DEPTH-sensitive relative path
// (../../../../../db, correct from _examples/). Copying up one level to flowkraft/xx-custom/<id> makes
// it one segment shallower — fix it to ../../../../db.
String APP_ID    = 'billing-portal-bkend'
String BASE_PATH = 'flowkraft/xx-custom/_examples/'   // where this seed lives + scaffolds in place
String BLUEPRINT = 'flowkraft/bkend-boot-groovy-playground'

def Utils = com.sourcekraft.documentburster.utils.Utils
File appsDir   = new File(Utils.getAppsFolderPath())
File appDir    = new File(appsDir, BASE_PATH + APP_ID)
File customDir = new File(appDir, '_custom')

log.info("=== {}: scaffold starting (vendor {}) ===", APP_ID, vendor)

// ── a) reset & rebuild — wipe the prior scaffold, then copy the blueprint fresh ───────────────────
// Keep ONLY _custom/ (the app definition — the one folder you copy to make your own app), runtime
// state that must survive a re-run (the .env secret, data/) and dependency caches. Everything else the
// seed regenerates. This is what makes regeneration truly idempotent AND it defuses copying an example
// that was scaffolded IN PLACE: such a copy carries a full stale app whose docker-compose.yml still
// names the OLD id, and without this wipe the compose-exists guard would skip the rebuild and the app
// would keep running as that old app instead of yours.
def keep = ['_custom', '.env', 'node_modules', '.gradle', '.next', 'build', 'target', 'data'] as Set
if (appDir.isDirectory())
    appDir.listFiles()?.each { File f ->
        if (!keep.contains(f.name)) { if (f.isDirectory()) FileUtils.deleteDirectory(f) else f.delete() }
    }

File composeFile = new File(appDir, 'docker-compose.yml')
if (!composeFile.exists()) {
    File blueprintDir = new File(appsDir, BLUEPRINT)
    if (!blueprintDir.isDirectory())
        throw new IllegalStateException("Blueprint not found: " + blueprintDir)

    FileUtils.copyDirectory(blueprintDir, appDir, { File f -> !keep.contains(f.name) } as java.io.FileFilter)

    File dockerignore = new File(appDir, '.dockerignore')
    if (!dockerignore.exists() || !dockerignore.text.contains('_custom'))
        dockerignore << "\n_custom/\n"

    log.info("Blueprint {} copied to {}", BLUEPRINT, appDir)

    // ── b) strip the reference-only examples ─────────────────────────────────
    File srcExamples = new File(appDir, 'src-examples')
    if (srcExamples.isDirectory()) { FileUtils.deleteDirectory(srcExamples); log.info("Stripped src-examples/") }
}

// ── c) apply overrides (every run) ───────────────────────────────────────────
File overridesDir = new File(customDir, 'overrides')
if (overridesDir.isDirectory()) {
    FileUtils.copyDirectory(overridesDir, appDir,
        { File f -> f.name != 'HOW-OVERRIDES-WORK.md' } as java.io.FileFilter)
    log.info("Overrides applied from {}", overridesDir)
}

// ── d) reveal the app card (first run) ───────────────────────────────────────
File manifest = new File(customDir, 'app.json')
if (manifest.isFile() && manifest.text.contains('"visible": false')) {
    manifest.text = manifest.text.replace('"visible": false', '"visible": true')
    log.info('app.json: "visible" set to true — the app card appears on the next Apps refresh')
}

// ── e) hand over the Playwright e2e project (first run only, never overwritten) ───────────────
copyE2EProjectIfAbsent(appsDir, log)

log.info("=== {}: complete — headless billing cron backend scaffolded ===", APP_ID)


// ═════════════════════════════════════════════════════════════════════════════
// copyE2EProjectIfAbsent — put the Playwright e2e project where you can OWN it.
//
//   FROM  flowkraft/xx-custom/_examples/xx-e2e-testing-playwright   (the shipped example)
//   TO    flowkraft/xx-custom/xx-e2e-testing-playwright             (yours to edit)
//
// COPY-IF-NOT-PRESENT: if the destination already exists it is left COMPLETELY alone — your specs
// and your edits are never clobbered. That is also why all three billing-portal seeds can call this:
// whichever you run first does the copy; the others find it there and skip.
//
// The GENERATED folders are never copied, and that is more than tidiness: node_modules would carry
// sharp's NATIVE binaries, so an example someone happened to `npm install` on Windows would ship a
// Windows sharp into a Linux container and break the very first run. The Docker build runs
// `npm install` itself anyway, and screenshots/ + the report dirs are one run's artifacts — noise in
// a fresh copy. The skip list below is exactly the project's own .gitignore.
//
// Nobody is *expected* to run the tests from inside _examples/ (it is a seed-only template), but
// nothing stops them either — which is precisely why the skips are here rather than assumed away.
// ═════════════════════════════════════════════════════════════════════════════
def copyE2EProjectIfAbsent(File appsDir, log) {
    File src  = new File(appsDir, 'flowkraft/xx-custom/_examples/xx-e2e-testing-playwright')
    File dest = new File(appsDir, 'flowkraft/xx-custom/xx-e2e-testing-playwright')

    if (!src.isDirectory()) {
        log.warn('e2e project not found at {} — nothing to copy', src)
        return
    }
    if (dest.exists()) {
        log.info('e2e project already present at {} — left untouched (your specs are safe)', dest)
        return
    }
    def skip = ['node_modules', 'screenshots', 'playwright-report', 'test-results', 'blob-report', '.cache'] as Set
    FileUtils.copyDirectory(src, dest, { File f -> !skip.contains(f.name) } as java.io.FileFilter)
    log.info('e2e project copied to {} (skipped: {})', dest, skip.join(', '))
}
