// @description Scaffolds the Billing Portal from the grails-playground blueprint, strips the sample analytics/payslip code, applies _custom/overrides, wires the DataPallas→portal report push (idempotent — safe to re-run)
//
// Bindings provided by GenericSeedExecutor (same as every Seed Data script):
//   dbSql  — groovy.sql.Sql connected to the connection you run this from (the SOURCE: the bundled
//            Northwind sample DB — Orders/Customers/Order Details/Products/Categories)
//   vendor — String (uppercase): POSTGRES, MYSQL, ... SQLITE, DUCKDB, CLICKHOUSE ...
//   log    — SLF4J Logger
//   params — Map (optional)
//
// The blueprint is the EXISTING playground — nothing is duplicated. This script, in one run:
//   a) first run  — copy flowkraft/grails-playground into this app folder (never touches _custom/),
//                   rename the compose service/container/volumes to this app id
//   b) first run  — DELETE the strip-list (sample analytics + payslip pages) so the copy is a pure
//                   billing portal
//   c) every run  — copy _custom/overrides/** on top (the billing-portal customization: bp_* domain,
//                   controllers, views, auth, REST ingest, rebranded menus, self-seed BootStrap)
//   d) every run  — write the DataPallas PUSH report (config/reports/billing-portal-grails): the
//                   SAME "Customer Invoices" report the 0010 report-generation video builds — a
//                   ds.scriptfile over the bundled Northwind sample DB — whose native <httpcommand>
//                   curl posts each invoice to the portal over REST
//   e) first run  — flip "visible": false -> true so the app card shows up in Apps Manager
//
// NOTE: NO seeding step is needed. The report runs against the BUNDLED Northwind sample DB
// (Orders + Order Details for the two sample customers ALFKI + ANATR) — the identical data source
// as the "Customer Invoices" report in e2e/specs/screenshots/docs/reporting.screens.ts. The portal
// seeds its OWN demo data on first boot (BootStrap in overrides); this script does NOT seed via
// dbSql. Burst the report and the portal auto-creates each customer's login idempotently.

import org.apache.commons.io.FileUtils
import groovy.json.JsonSlurper

// APP_ID + BASE_PATH decide WHERE this app scaffolds to; BLUEPRINT (the shared playground) never
// changes. As shipped, this example lives in the _examples/ folder. To make it YOUR OWN app, copy the
// whole folder up one level into the custom-apps home, flowkraft/xx-custom/ — e.g.
//   flowkraft/xx-custom/_examples/billing-portal-grails  ->  flowkraft/xx-custom/my-billing-portal-grails
// then rename APP_ID to the new folder name and set BASE_PATH = 'flowkraft/xx-custom/'. The backend
// discovers custom apps only under flowkraft/xx-custom/ (your apps directly, examples in _examples/).
String APP_ID    = 'billing-portal-grails'
String BASE_PATH = 'flowkraft/xx-custom/_examples/'   // where this seed lives + scaffolds in place
String BLUEPRINT = 'flowkraft/grails-playground'

def Utils = com.sourcekraft.documentburster.utils.Utils
File appsDir   = new File(Utils.getAppsFolderPath())
File appDir    = new File(appsDir, BASE_PATH + APP_ID)
File customDir = new File(appDir, '_custom')

def cfg          = new JsonSlurper().parse(new File(customDir, 'app.json'))
String apiKey    = cfg.apiKey ?: 'bp-demo-key-CHANGE-ME'
String portalUrl = cfg.url ?: 'http://localhost:8500'

log.info("=== {}: scaffold + wire starting (vendor {}) ===", APP_ID, vendor)

// ── a) reset & rebuild — wipe the prior scaffold, then copy the blueprint fresh ───────────────────
// Keep ONLY _custom/ (the app definition — the one folder you copy to make your own app), runtime
// state that must survive a re-run (the .env secret, data/) and dependency caches. Everything else the
// seed regenerates. This is what makes regeneration truly idempotent AND it defuses copying an example
// that was scaffolded IN PLACE: such a copy carries a full stale app whose docker-compose.yml still
// names the OLD id, and without this wipe the compose-exists guard would skip the rebuild and the app
// would keep running as that old app instead of yours.
def keep = ['_custom', '.env', 'node_modules', '.gradle', '.next', 'build', 'data'] as Set
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

    // folder name = compose service = container name (what 'system service app start/stop' and
    // the Apps Manager status matcher resolve); volumes renamed so this app never collides.
    composeFile.text = composeFile.text
            .replace('grails-playground', APP_ID)
            .replace('flowkraft-data', APP_ID + '-data')
            .replace('flowkraft-logs', APP_ID + '-logs')

    File dockerignore = new File(appDir, '.dockerignore')
    if (!dockerignore.exists() || !dockerignore.text.contains('_custom'))
        dockerignore << "\n_custom/\n"

    log.info("Blueprint {} copied to {}", BLUEPRINT, appDir)

    // ── b) strip the sample ANALYTICS + PAYSLIP code (billing portal only) ───
    //     NOTE: PaymentController + StripeService + PayPalService are deliberately KEPT — payment
    //     is core to a billing portal. The overrides add bp_ Invoice compatibility shims so they
    //     compile, and a PaymentGatewayService simulates when no Stripe/PayPal keys are configured.
    def strip = [
        'grails-app/controllers/com/flowkraft/ChartsController.groovy',
        'grails-app/controllers/com/flowkraft/DashboardsController.groovy',
        'grails-app/controllers/com/flowkraft/DataWarehouseController.groovy',
        'grails-app/controllers/com/flowkraft/HomeController.groovy',
        'grails-app/controllers/com/flowkraft/PivotTablesController.groovy',
        'grails-app/controllers/com/flowkraft/ReportParametersController.groovy',
        'grails-app/controllers/com/flowkraft/ReportsController.groovy',
        'grails-app/controllers/com/flowkraft/TabulatorController.groovy',
        'grails-app/controllers/com/flowkraft/YourCanvasController.groovy',
        'grails-app/controllers/com/flowkraft/PayslipController.groovy',
        'grails-app/controllers/com/flowkraft/PortalPayslipController.groovy',
        'grails-app/domain/com/flowkraft/Payslip.groovy',
        // The playground's key/value settings store. It has to GO, not just sit unused: AuthInterceptor
        // gates by controller name, `settings` is not one of the names it knows, and its final
        // `return true` means anything unrecognised is PUBLIC. So it stayed reachable through the
        // catch-all URL mapping as an anonymous read/write of the settings table — GET /settings to
        // read it all, POST /settings/save to write any key. Nothing in the billing portal uses it
        // (the Next twin strips its equivalent), and the interceptor now denies by default too, so
        // this is belt and braces. Its domain goes with it — nothing that survives references Setting:
        // the two blueprint files that did (AdminController, BootStrap) are both replaced by overrides.
        'grails-app/controllers/com/flowkraft/SettingsController.groovy',
        'grails-app/domain/com/flowkraft/Setting.groovy',
        'grails-app/views/charts', 'grails-app/views/dashboards', 'grails-app/views/dataWarehouse',
        'grails-app/views/home', 'grails-app/views/pivotTables', 'grails-app/views/reportParameters',
        'grails-app/views/reports', 'grails-app/views/tabulator', 'grails-app/views/yourCanvas',
        'grails-app/views/payslip', 'grails-app/views/portalPayslip',
    ]
    int stripped = 0
    strip.each { rel ->
        File f = new File(appDir, rel)
        if (f.isDirectory()) { FileUtils.deleteDirectory(f); stripped++ }
        else if (f.delete()) { stripped++ }
    }
    log.info("Stripped {} of {} sample files/dirs", stripped, strip.size())
}

// ── c) apply overrides (every run — re-applies the billing-portal customization) ──
File overridesDir = new File(customDir, 'overrides')
if (overridesDir.isDirectory()) {
    FileUtils.copyDirectory(overridesDir, appDir,
        { File f -> f.name != 'HOW-OVERRIDES-WORK.md' } as java.io.FileFilter)
    log.info("Overrides applied from {}", overridesDir)
}

// ── d) write the DataPallas PUSH report (every run) ──────────────────────────
// The "Customer Invoices" report: a ds.scriptfile over the BUNDLED Northwind sample DB (no
// seeding). Per invoice, DataPallas's NATIVE HTTP upload (settings.xml <httpcommand> curl, run by
// the built-in upload.groovy) posts the rendered JSON to <portalUrl>/api/invoices. DataPallas
// renders NOTHING customer-facing — the portal renders the invoices, from the very same fields the
// 0010 video's Apache FOP template renders to PDF. Grails (:8500) / Next (:8501) get separate folders.
writePushReport(
    Utils, log, vendor,
    APP_ID,                              // config/reports/billing-portal-grails
    'Bills Portal (Grails)',             // UI label (settings.xml <template>)
    (params?.connectionCode ?: '').toString(),
    portalUrl, apiKey)

// ── e) reveal the app card (first run flips visible: false -> true) ───────────
File manifest = new File(customDir, 'app.json')
if (manifest.isFile() && manifest.text.contains('"visible": false')) {
    manifest.text = manifest.text.replace('"visible": false', '"visible": true')
    log.info('app.json: "visible" set to true — the app card appears on the next Apps refresh')
}

// ── f) hand over the Playwright e2e project (first run only, never overwritten) ───────────────
copyE2EProjectIfAbsent(appsDir, log)

log.info("=== {}: complete — portal scaffolded; it self-seeds demo data on first boot ===", APP_ID)


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


// ═════════════════════════════════════════════════════════════════════════════
// writePushReport — writes config/reports/<reportId>/ so a Burst pushes each
// Northwind invoice to <portalUrl>/api/invoices. NO seeding, NO vendor-specific SQL.
//
// This is the SAME report the 0010 report-generation video builds (see
// e2e/specs/screenshots/docs/reporting.screens.ts → "Customer Invoices → PDF Apache FOP"):
// a ds.scriptfile whose Groovy script reads the bundled Northwind sample DB (Orders +
// Order Details for ALFKI + ANATR), nests each order's line items, and emits exactly the
// fields the professional "Northwind Traders" invoice design expects. There, those fields
// feed an Apache FOP template that renders a PDF; HERE the very same fields feed a JSON
// payload that curl POSTs to the portal, whose _invoiceDocument.gsp / InvoiceDoc.tsx render
// the identical invoice in HTML. One report, two renderings.
//
// Four files are written:
//   1) <reportId>-script.groovy — the ds.scriptfile data script. MUST be named exactly this:
//      the engine resolves <scriptname> against the report's own config folder (roots[0] in
//      AbstractReporter.setUpScriptingRoots), and the frontend editor hard-codes the
//      "<reportId>-script.groovy" convention. A MISSING or EMPTY script silently yields zero
//      rows (Scripting.java's Utils.isEmptyFile guard) — no error, just an empty Burst.
//   2) reporting.xml — ds.scriptfile + the source connection.
//   3) push-payload.json — the FreeMarker JSON body (output.any).
//   4) settings.xml — COPIED from the default; only the minimum nodes change (curl
//      <httpcommand>, report label, flags).
// Grails (:8500) and Next (:8501) each get their OWN report folder.
// ═════════════════════════════════════════════════════════════════════════════
def writePushReport(Utils, log, String vendor, String reportId, String reportLabel,
                    String conncode, String portalUrl, String apiKey) {

    File reportDir = new File(Utils.resolvePathAgainstPortableDir('config/reports/' + reportId))
    reportDir.mkdirs()

    // ── formatting-tolerant XML edits (used for BOTH reporting.xml and settings.xml below) ──────
    // Both files are produced the same way: COPY the canonical default from config/_defaults and
    // patch only the few values this push report needs. That is what keeps them correct when a future
    // DataPallas revises those defaults — the new shape is inherited, not re-hand-assembled here.
    //
    // The edits go through these helpers rather than literal String.replace so they match an element
    // HOWEVER the base wraps it across lines: (?s) lets . span newlines, \\s* absorbs whitespace around
    // the value. (A literal replace missed <burstfilename> for exactly this reason, and the default
    // leaked through as .xml.) The closure / Matcher.quoteReplacement form keeps $ in a new value
    // (${email}, ${extracted_file_path}, …) literal, so the report engine — not this script —
    // resolves it per invoice.
    //   repEl      — <tag>oldVal</tag> -> <tag>newVal</tag>, value-specific, every match.
    //   repEl1     — like repEl but the FIRST match only (a tag that repeats across two blocks).
    //   setEl      — set <tag>'s content whatever it is now (empty pair, self-closed <tag/>, or value).
    //   setInBlock — set <tag> ONLY inside a given <parent> block (e.g. the scriptoptions <idcolumn>,
    //                when the same tag also appears in csv/xml/excel/sql blocks that must stay put).
    def repEl = { String xml, String tag, String oldVal, String newVal ->
        xml.replaceAll('(?s)<' + tag + '>\\s*' + java.util.regex.Pattern.quote(oldVal) + '\\s*</' + tag + '>') {
            '<' + tag + '>' + newVal + '</' + tag + '>'
        }
    }
    def repEl1 = { String xml, String tag, String oldVal, String newVal ->
        xml.replaceFirst('(?s)<' + tag + '>\\s*' + java.util.regex.Pattern.quote(oldVal) + '\\s*</' + tag + '>',
                         java.util.regex.Matcher.quoteReplacement('<' + tag + '>' + newVal + '</' + tag + '>'))
    }
    def setEl = { String xml, String tag, String newVal ->
        xml.replaceAll('(?s)<' + tag + '\\s*/>|<' + tag + '>.*?</' + tag + '>') {
            '<' + tag + '>' + newVal + '</' + tag + '>'
        }
    }
    def setInBlock = { String xml, String parent, String tag, String newVal ->
        xml.replaceAll('(?s)<' + parent + '>.*?</' + parent + '>') { block ->
            block.replaceAll('(?s)<' + tag + '\\s*/>|<' + tag + '>.*?</' + tag + '>') {
                '<' + tag + '>' + newVal + '</' + tag + '>'
            }
        }
    }

    // ── 1) the ds.scriptfile data script ─────────────────────────────────────
    // Single-quoted heredoc: NOTHING below is interpolated by this seed script — the whole
    // body is written verbatim and runs later, inside the report engine, with its own ctx/log.
    String dataScript = '''// Customer Invoices — the DataPallas->Portal push data script.
//
// Reads the BUNDLED Northwind sample DB (no seeding required) for the two sample customers
// ALFKI + ANATR, nests each order's line items, and emits one row per invoice. Mirrors
// e2e/_resources/screenshots/docs/invoice-report-script.groovy (the 0010 video's report),
// with two deliberate differences for the REST push:
//   * dates are emitted ISO (yyyy-MM-dd) - the portal stores DATA and formats it itself;
//     the FOP variant pre-formats MM/dd/yyyy because it renders straight to PDF.
//   * an email is synthesised per customer (Northwind has none) - the portal keys its
//     idempotent customer upsert + auto-created login on it, so it MUST be stable + unique.
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate

def dbSql = ctx.dbSql

log.info("Starting Customer Invoices push script...")

// Northwind OrderDate/ShippedDate come back as Timestamp, String, or - in the BUNDLED
// sqlite/duckdb sample - a Unix EPOCH-MILLIS number (e.g. 1710457200000). Normalise all
// of them to a LocalDate. The epoch branch is essential: without it LocalDate.parse()
// chokes on "1710457200", the catch swallows it, and every invoice pushes blank dates.
def toEpochDate = { long ms -> java.time.Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault()).toLocalDate() }
def toLocalDate = { v ->
    if (v == null) return null
    if (v instanceof java.sql.Timestamp) return v.toLocalDateTime().toLocalDate()
    if (v instanceof java.sql.Date) return v.toLocalDate()
    if (v instanceof java.util.Date) return new java.sql.Timestamp(v.time).toLocalDateTime().toLocalDate()
    if (v instanceof Number) return toEpochDate(((Number) v).longValue())
    def s = v.toString().trim()
    if (s.isEmpty()) return null
    if (s.isLong()) return toEpochDate(s.toLong())
    if (s.length() >= 10) {
        try { return LocalDate.parse(s.substring(0, 10)) } catch (ex) { return null }
    }
    return null
}

def masterSql = """
SELECT
    O."OrderID",
    O."OrderDate",
    O."ShippedDate",
    O."CustomerID",
    C."CompanyName",
    C."ContactName",
    C."Address",
    C."City",
    C."Country",
    O."Freight"
FROM "Orders" O
JOIN "Customers" C ON O."CustomerID" = C."CustomerID"
WHERE O."CustomerID" IN ('ALFKI', 'ANATR')
ORDER BY O."OrderID"
"""

def detailSql = """
SELECT
    OD."Quantity",
    OD."UnitPrice",
    OD."Discount",
    P."ProductName",
    Cat."CategoryName"
FROM "Order Details" OD
JOIN "Products" P ON OD."ProductID" = P."ProductID"
JOIN "Categories" Cat ON P."CategoryID" = Cat."CategoryID"
WHERE OD."OrderID" = ?
ORDER BY P."ProductName"
"""

def allInvoicesData = []

try {
    def masterRows = dbSql.rows(masterSql)
    log.info("Fetched {} invoice rows.", masterRows.size())

    masterRows.each { masterRow ->
        def invoiceData = new LinkedHashMap<String, Object>()

        def orderDate = toLocalDate(masterRow.OrderDate)
        def shipped = toLocalDate(masterRow.ShippedDate)

        invoiceData.put("invoice_id", masterRow.OrderID)
        invoiceData.put("invoice_date", orderDate != null ? orderDate.toString() : "")
        // Northwind has no due date - present Net-30 from the order date.
        invoiceData.put("due_date", orderDate != null ? orderDate.plusDays(30).toString() : "")
        // Northwind has no invoice status - a shipped order reads as PAID, else DUE (the
        // portal's own vocabulary; its overdue job flips DUE->OVERDUE past the due date).
        invoiceData.put("status", shipped != null ? "PAID" : "DUE")
        invoiceData.put("freight", masterRow.Freight)
        invoiceData.put("company_name", masterRow.CompanyName)
        invoiceData.put("contact_name", masterRow.ContactName)
        invoiceData.put("address", masterRow.Address)
        invoiceData.put("city", masterRow.City)
        invoiceData.put("country", masterRow.Country)
        // Stable synthetic address - Northwind carries no email, and the portal upserts on it.
        // MUST use a domain under example.com: ".example" is an RFC 2606 RESERVED TLD which
        // commons-validator (Grails' `email: true` constraint on Customer.email) REJECTS, so every
        // push died with "is not a valid e-mail address" -> 500 -> 0 invoices ingested. example.com
        // is likewise reserved for documentation (so nothing can ever reach a real inbox) but has a
        // real TLD, so it validates.
        invoiceData.put("email", (masterRow.CustomerID ?: "").toString().toLowerCase() + "@northwind.example.com")
        invoiceData.put("notes", "Net 30. Please quote the invoice number with your payment.")
        // Per-invoice pay token — what makes the emailed "Pay this invoice" link work without a
        // login. The portal generates one itself on ingest, but the burst must KNOW the token to put
        // it in the email, so we generate it here and push it in the payload (ApiInvoiceController /
        // the Next ingest route persist it verbatim).
        // DERIVED, not random, on purpose: it must be identical on every re-Burst, or each run would
        // rotate the token and silently dead-link every invoice already emailed.
        // Example-grade — a production portal should store a random, non-derivable token per invoice.
        invoiceData.put("pay_token",
            UUID.nameUUIDFromBytes(("bp-pay|" + masterRow.OrderID).toString().getBytes("UTF-8")).toString())

        def detailRows = dbSql.rows(detailSql, masterRow.OrderID)

        def detailsList = []
        BigDecimal subtotal = BigDecimal.ZERO

        detailRows.each { detailRow ->
            def detailMap = new LinkedHashMap<String, Object>()

            BigDecimal price = detailRow.UnitPrice instanceof BigDecimal ? detailRow.UnitPrice : new BigDecimal(detailRow.UnitPrice.toString())
            BigDecimal qty = new BigDecimal(detailRow.Quantity.toString())
            BigDecimal discount = detailRow.Discount instanceof BigDecimal ? detailRow.Discount : new BigDecimal((detailRow.Discount ?: 0).toString())
            BigDecimal lineTotal = price.multiply(qty).multiply(BigDecimal.ONE.subtract(discount))

            detailMap.put("product_name", detailRow.ProductName)
            detailMap.put("category", detailRow.CategoryName)
            detailMap.put("quantity", detailRow.Quantity)
            detailMap.put("unit_price", price.setScale(2, RoundingMode.HALF_UP))
            detailMap.put("discount", discount)
            detailMap.put("line_total", lineTotal.setScale(2, RoundingMode.HALF_UP))

            subtotal = subtotal.add(lineTotal)
            detailsList.add(detailMap)
        }

        invoiceData.put("details", detailsList)

        BigDecimal freight = masterRow.Freight instanceof BigDecimal ? masterRow.Freight : new BigDecimal((masterRow.Freight ?: 0).toString())
        BigDecimal taxRate = new BigDecimal("0.08")
        BigDecimal taxableAmount = subtotal.add(freight)
        BigDecimal tax = taxableAmount.multiply(taxRate)
        BigDecimal grandTotal = taxableAmount.add(tax)

        invoiceData.put("Subtotal", subtotal.setScale(2, RoundingMode.HALF_UP))
        invoiceData.put("Tax", tax.setScale(2, RoundingMode.HALF_UP))
        invoiceData.put("GrandTotal", grandTotal.setScale(2, RoundingMode.HALF_UP))

        allInvoicesData.add(invoiceData)
    }

    ctx.reportData = allInvoicesData

    if (!allInvoicesData.isEmpty()) {
        ctx.reportColumnNames = new ArrayList<>(allInvoicesData.get(0).keySet().findAll { it != 'details' })
    } else {
        ctx.reportColumnNames = []
    }

    log.info("Finished Customer Invoices push script. Prepared data for {} invoices.", ctx.reportData.size())

} catch (Exception e) {
    log.error("Error during script execution: {}", e.getMessage(), e)
    throw e
}
'''
    new File(reportDir, reportId + '-script.groovy').setText(dataScript, 'UTF-8')

    // ── 2) reporting.xml — COPY the canonical default, patch only the ds.scriptfile bits ─────
    // config/_defaults/reporting.xml is the reference DataPallas ships and its own UI writes: it
    // already carries every datasource block (parser, csv/fixedwidth/xml/excel/sql/script options,
    // transformationoptions). Copying it and changing only what this report needs means a future
    // DataPallas that adds or renames an element is inherited for free — a from-scratch template would
    // omit it and lean on JAXB defaults that may drift.
    File baseReporting = new File(Utils.resolvePathAgainstPortableDir('config/_defaults/reporting.xml'))
    if (!baseReporting.isFile()) {
        log.warn('Default reporting.xml not found at {} — skipping push-report write for {}', baseReporting, reportId)
        return
    }
    String reportingXml = baseReporting.getText('UTF-8')
    // The default is a ds.csvfile skeleton — make it a script datasource.
    reportingXml = repEl(reportingXml, 'type', 'ds.csvfile', 'ds.scriptfile')
    // The SOURCE (Northwind) connection — set in BOTH the sql and script option blocks, as the UI does.
    reportingXml = setEl(reportingXml, 'conncode', conncode)
    // The ds.scriptfile data script, resolved against the report's own folder (roots[0] in
    // AbstractReporter.setUpScriptingRoots). MUST be named <reportId>-script.groovy.
    reportingXml = setEl(reportingXml, 'scriptname', reportId + '-script.groovy')
    // One burst token per INVOICE — but ONLY the scriptoptions <idcolumn>. The same <idcolumn>notused
    // sits in the csv/fixedwidth/xml/excel/sql blocks too, and those must stay notused; block-scoping
    // is exactly why setInBlock exists. (Per customer would collide: the 6 invoices of one customer
    // would share a token and overwrite each other; invoice_id makes each kept payload self-describing.)
    reportingXml = setInBlock(reportingXml, 'scriptoptions', 'idcolumn', 'invoice_id')
    // output.any renders the FreeMarker JSON payload verbatim — no HTML branding footer, no
    // auto-escaping (output.html would corrupt the JSON). documentpath is that payload template.
    reportingXml = setEl(reportingXml, 'outputtype', 'output.any')
    reportingXml = setEl(reportingXml, 'documentpath', 'config/reports/' + reportId + '/push-payload.json')
    // selectfileexplorer already ships 'notused' in the default scriptoptions, which is REQUIRED:
    // leave it anything else and ReportsService defaults it to "globpattern", requiresInputFile()
    // returns true, and #btnGenerateReports stays DISABLED forever waiting for an input file this
    // report never takes. Nothing to patch — the default is already right.
    new File(reportDir, 'reporting.xml').setText(reportingXml, 'UTF-8')

    // ── 3) push-payload.json — the per-invoice JSON body (FreeMarker, no auto-escape) ──
    // `details` is the nested line-item list the script builds, so the lines render inline —
    // no vendor-specific json_group_array / json_agg / JSON_ARRAYAGG SQL anywhere. ?c prints
    // numbers computer-style (no thousands separators) so the JSON stays valid.
    String jsonTemplate = '''{
  "invoice_number": "${(invoice_id!'')?string}",
  "pay_token": "${(pay_token!'')?json_string}",
  "invoice_date": "${(invoice_date!'')?json_string}",
  "due_date": "${(due_date!'')?json_string}",
  "status": "${(status!'DUE')?json_string}",
  "customer": {
    "name": "${(company_name!'')?json_string}",
    "contact_name": "${(contact_name!'')?json_string}",
    "email": "${(email!'')?json_string}",
    "address": "${(address!'')?json_string}",
    "city": "${(city!'')?json_string}",
    "country": "${(country!'')?json_string}"
  },
  "lines": [<#list details![] as d>
    {
      "product_name": "${(d.product_name!'')?json_string}",
      "category": "${(d.category!'')?json_string}",
      "qty": ${(d.quantity!0)?c},
      "unit_price": ${(d.unit_price!0)?c},
      "discount": ${(d.discount!0)?c}
    }<#sep>,</#sep></#list>
  ],
  "subtotal": ${(Subtotal!0)?c},
  "tax": ${(Tax!0)?c},
  "freight": ${(freight!0)?c},
  "total": ${(GrandTotal!0)?c},
  "notes": "${(notes!'')?json_string}"
}
'''
    new File(reportDir, 'push-payload.json').setText(jsonTemplate, 'UTF-8')

    // ── 4) settings.xml — COPY the canonical default, change ONLY the minimum nodes ─────
    // Same reference folder as reporting.xml above. config/_defaults/settings.xml is byte-identical to
    // config/burst/settings.xml today, but _defaults is the pair DataPallas treats as the reference,
    // so both files this function writes now derive from the same place.
    File baseSettings = new File(Utils.resolvePathAgainstPortableDir('config/_defaults/settings.xml'))
    if (!baseSettings.isFile()) {
        log.warn('Default settings.xml not found at {} — skipping push-report write for {}', baseSettings, reportId)
        return
    }
    // The curl PUSH: --data "@${extracted_file_path}" is the per-invoice rendered JSON. ${...} stays
    // literal here (single-quoted) — DataPallas expands it per invoice via getStringFromTemplate.
    // ── the customer notification (rendered per invoice by FreeMarker) ──────
    // XML-escaped: this is dropped straight into settings.xml, and the body is HTML
    // (<htmlemail>true</htmlemail>), so its tags must survive as &lt;…&gt; text.
    // Subject carries the three things a payer scans for: what, how much, by when.
    // Keep it plain ASCII. A single non-ASCII character (an em-dash, a curly quote, £/€) makes the
    // mail library RFC 2047 encode the WHOLE subject into "=?UTF-8?Q?...?=" words — correct, and every
    // client decodes it, but it splits mid-word, so subjects become unreadable in raw logs and in any
    // tooling that reads them literally. A hyphen costs nothing and keeps the subject legible everywhere.
    String emailSubject = 'Invoice ${invoice_id} from Northwind Traders - $${GrandTotal} due ${due_date}'
    // The sign-in link is the portal ROOT, deliberately — NOT a deep link to /portal/invoices.
    // AuthInterceptor bounces a logged-out visitor to /login without remembering where they were
    // headed, and LoginController lands every customer on /portal afterwards. So a deep link never
    // opens the page it names; the root reaches the same place and is the URL a customer recognises.
    String portalSignInUrl = portalUrl
    // The one-click pay link. ${pay_token} is the token the data script generated and the push
    // stored on this very invoice, so this URL settles THIS invoice with no login.
    String payUrl = portalUrl + '/portal/pay?token=${pay_token}'
    String emailHtml = (
        '<p>Hello ${contact_name!company_name},</p>' +
        '<p>Thank you for your order. Your invoice <strong>${invoice_id}</strong> from ' +
        'Northwind Traders is ready.</p>' +
        '<table cellpadding="6" cellspacing="0" border="0">' +
        '<tr><td><strong>Invoice</strong></td><td>${invoice_id}</td></tr>' +
        '<tr><td><strong>Invoice date</strong></td><td>${invoice_date}</td></tr>' +
        '<tr><td><strong>Due date</strong></td><td>${due_date}</td></tr>' +
        '<tr><td><strong>Amount due</strong></td><td><strong>$${GrandTotal}</strong></td></tr>' +
        '</table>' +
        '<p><a href="' + payUrl + '">Pay invoice ${invoice_id} now</a> - no sign-in needed.</p>' +
        '<p>You can also <a href="' + portalSignInUrl + '">sign in to your account</a> (' +
        portalSignInUrl + ') to see all your invoices and payment history.</p>' +
        '<p>${notes}</p>' +
        '<p>Questions? Just reply to this email.</p>' +
        '<p>Thank you for your business!<br/>Northwind Traders</p>'
    ).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

    String curlCmd = '-s -X POST' +
        ' -H "Content-Type: application/json"' +
        ' -H "X-Api-Key: ' + apiKey + '"' +
        ' --data "@${extracted_file_path}"' +
        ' "' + portalUrl + '/api/invoices"'

    // Patched with the repEl / repEl1 / setEl helpers defined at the top of this function.
    String settingsXml = baseSettings.getText('UTF-8')
    settingsXml = repEl(settingsXml, 'reportgenerationmailmerge', 'false', 'true')
    settingsXml = repEl(settingsXml, 'web', 'false', 'true')
    // The recipient of this document is the CUSTOMER, and their address is the `email` column the data
    // script emits. The shipped default is <to>${burst_token}</to>, right for classic bursting (there
    // the token IS the recipient's email — see UploadTest/EmailUploadTest, whose tokens are
    // clyde.grew@northridgehealth.org etc.). Here the token is the invoice number instead, so <to> must
    // name the column, or the burst dies in SendersFactory.makeSenders with
    // "Invalid email address '1' found for the token '1'".
    settingsXml = repEl(settingsXml, 'to', '${burst_token}', '${email}')
    // ── The customer invoice email, wired end-to-end but NOT switched on ──────
    // Everything the notification needs is configured here — SMTP, sender, subject, body, the
    // per-invoice pay link — so nobody has to fill a form to start notifying customers. <email>
    // deliberately stays FALSE (the shipped default): sending is one tick away, in Configuration >
    // Enable/Disable Delivery > "Send documents by Email".
    //
    // Leaving it off is what keeps the demo working out of the box. SMTP points at the BUILT-IN Test
    // Email Server (MailHog: SMTP 1025, web UI :8025), which is NOT running by default — turning
    // delivery on here would make the very first Burst fail 10 emails for anyone who hasn't started it.
    // So: Burst → invoices upload. Start the Test Email Server (or point <host>/<port> at your real
    // SMTP), tick the box → Burst → invoices upload AND email.
    //   <useconn>true → false : use these SMTP fields instead of the 'eml-contact' connection
    //                           (the UI's "Use existing email connection" checkbox).
    // Only the FIRST <emailserver> block (delivery) is retargeted; the second is the
    // quality-assurance/test-server block, which already points at localhost:1025.
    settingsXml = repEl(settingsXml, 'useconn', 'true', 'false')
    settingsXml = repEl(settingsXml, 'host', 'Email Server Host', 'localhost')
    settingsXml = repEl(settingsXml, 'port', '25', '1025')
    // fromaddress/name appear in BOTH emailserver blocks — first-only keeps the QA block as-is.
    settingsXml = repEl1(settingsXml, 'fromaddress', 'from@emailaddress.com', 'billing@northwind.example.com')
    settingsXml = repEl1(settingsXml, 'name', 'From Name', 'Northwind Traders')
    // The customer's "your invoice is ready" notification. ${...} stays literal — FreeMarker fills it
    // per invoice at Burst time (nothing is sent until <email> is ticked on, above).
    settingsXml = setEl(settingsXml, 'subject', emailSubject)
    settingsXml = setEl(settingsXml, 'html', emailHtml)
    // <deletefiles> left at its default (false) — keep each rendered JSON as an upload audit trail.
    settingsXml = setEl(settingsXml, 'documentbursterwebcommand', curlCmd)
    settingsXml = repEl(settingsXml, 'template', 'Bursting', reportLabel)
    // Each rendered payload IS json, so the kept file must be named .json — not the shipped default
    // ${burst_token}.${output_type_extension}, which the engine resolves to the report's output
    // extension (.xml for classic bursting). A .json name keeps the upload audit trail self-describing.
    // This is the element that exposed the whole fragility above: its value sits on its own line in the
    // shipped base, so the old literal replace missed it and the default leaked through as .xml.
    settingsXml = setEl(settingsXml, 'burstfilename', '${burst_token}.json')
    new File(reportDir, 'settings.xml').setText(settingsXml, 'UTF-8')

    log.info('Push report written: {} ("{}") — Burst it to push the Northwind Customer Invoices to {}', reportId, reportLabel, portalUrl)
}
