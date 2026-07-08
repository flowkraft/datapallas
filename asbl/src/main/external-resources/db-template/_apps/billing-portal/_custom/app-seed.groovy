// @description Scaffolds the app from the Grails blueprint, applies _custom/overrides, seeds bp_* demo data (idempotent — safe to re-run)
//
// Bindings provided by GenericSeedExecutor (same as every Seed Data script):
//   dbSql  — groovy.sql.Sql connected to the connection you run this from
//   vendor — String (uppercase): POSTGRES, MYSQL, MARIADB, SQLSERVER, ORACLE, DB2, SUPABASE,
//                                CLICKHOUSE, SQLITE, DUCKDB
//   log    — SLF4J Logger
//   params — Map with optional keys: N (customer count, default 100)
//
// What a custom-app seeder does (this file is the reference example):
//   a) first run  — copy the whole blueprint into _apps/<app>/ (never touches _custom/),
//                   then rename compose service/container/volumes to the app id
//   b) every run  — copy _custom/overrides/** over the app tree (same relative paths)
//   c) every run  — DROP THEN CREATE the app's demo tables on the selected connection
//   d) first run  — flip "visible": false -> true in _custom/app.json so the app card
//                   shows up in Apps Manager on its next refresh

import org.apache.commons.io.FileUtils
import net.datafaker.Faker

String APP_ID    = 'billing-portal'
String BLUEPRINT = 'flowkraft/grails-playground'

File appsDir   = new File(com.sourcekraft.documentburster.utils.Utils.getAppsFolderPath())
File appDir    = new File(appsDir, APP_ID)
File customDir = new File(appDir, '_custom')

log.info("=== {}: scaffold + seed starting (vendor {}) ===", APP_ID, vendor)

// ── a) Copy blueprint (first run only) ───────────────────────────────────────

File composeFile = new File(appDir, 'docker-compose.yml')
if (!composeFile.exists()) {
    File blueprintDir = new File(appsDir, BLUEPRINT)
    if (!blueprintDir.isDirectory())
        throw new IllegalStateException("Blueprint not found: " + blueprintDir)

    def skip = ['_custom', 'node_modules', '.gradle', '.next', 'build', 'data'] as Set
    FileUtils.copyDirectory(blueprintDir, appDir, { File f -> !skip.contains(f.name) } as java.io.FileFilter)

    // folder name = compose service = container name (what 'system service app start/stop'
    // and the Apps Manager status matcher resolve); volumes renamed so this app never
    // collides with the blueprint or a sibling app scaffolded from the same blueprint
    composeFile.text = composeFile.text
            .replace('grails-playground', APP_ID)
            .replace('flowkraft-data', APP_ID + '-data')
            .replace('flowkraft-logs', APP_ID + '-logs')

    // keep authored files out of the Docker image build context
    File dockerignore = new File(appDir, '.dockerignore')
    if (!dockerignore.exists() || !dockerignore.text.contains('_custom'))
        dockerignore << "\n_custom/\n"

    log.info("Blueprint {} copied to {}", BLUEPRINT, appDir)
} else {
    log.info("Already scaffolded — skipping blueprint copy")
}

// ── b) Apply overrides (every run — re-applies your customizations) ──────────

File overridesDir = new File(customDir, 'overrides')
if (overridesDir.isDirectory()) {
    FileUtils.copyDirectory(overridesDir, appDir)
    log.info("Overrides applied from {}", overridesDir)
}

// ── c) Seed demo data (DROP THEN CREATE — clean slate every run) ─────────────

int N = (params?.N instanceof Number ? (params.N as int) :
         params?.N ? Integer.parseInt(params.N.toString()) : 100)
long SEED = 42L

boolean isClickHouse = (vendor == 'CLICKHOUSE')
boolean isOracle     = (vendor == 'ORACLE')

def ddl = { String sql -> dbSql.execute(sql) }   // typed param coerces GString -> String

['bp_invoice', 'bp_customer'].each { t ->
    try { dbSql.execute('DROP TABLE ' + t) }
    catch (Exception e) { log.debug("DROP {} skipped: {}", t, e.getMessage()) }
}

if (isClickHouse) {
    ddl('''CREATE TABLE bp_customer (
               customer_id UInt32,
               name        String,
               email       String,
               city        String
           ) ENGINE = MergeTree() ORDER BY customer_id''')
    ddl('''CREATE TABLE bp_invoice (
               invoice_id   UInt32,
               customer_id  UInt32,
               invoice_date Date,
               amount       Decimal(10,2),
               status       String
           ) ENGINE = MergeTree() ORDER BY invoice_id''')
} else {
    String intType = isOracle ? 'NUMBER(10)' : 'INT'
    String varchar = isOracle ? 'VARCHAR2' : 'VARCHAR'
    ddl("""CREATE TABLE bp_customer (
               customer_id ${intType} PRIMARY KEY,
               name        ${varchar}(120),
               email       ${varchar}(160),
               city        ${varchar}(80)
           )""")
    ddl("""CREATE TABLE bp_invoice (
               invoice_id   ${intType} PRIMARY KEY,
               customer_id  ${intType},
               invoice_date DATE,
               amount       DECIMAL(10,2),
               status       ${varchar}(20)
           )""")
}

Faker faker = new Faker(new Random(SEED))   // fixed seed = identical data every run
Random rnd  = new Random(SEED)

dbSql.withBatch(500, 'INSERT INTO bp_customer (customer_id, name, email, city) VALUES (?, ?, ?, ?)') { ps ->
    (1..N).each { i ->
        ps.addBatch([i, faker.company().name().take(120), faker.internet().emailAddress(),
                     faker.address().city().take(80)])
    }
}

int invoiceCount = 0
List<String> statuses = ['PAID', 'DUE', 'OVERDUE']
dbSql.withBatch(500, 'INSERT INTO bp_invoice (invoice_id, customer_id, invoice_date, amount, status) VALUES (?, ?, ?, ?, ?)') { ps ->
    (1..N).each { customerId ->
        (0..rnd.nextInt(4)).each {
            java.sql.Date invoiceDate = java.sql.Date.valueOf(
                    java.time.LocalDate.of(2026, 1 + rnd.nextInt(6), 1 + rnd.nextInt(28)))
            BigDecimal amount = new BigDecimal(50 + rnd.nextInt(4950)) + 0.99
            ps.addBatch([++invoiceCount, customerId, invoiceDate, amount, statuses[rnd.nextInt(3)]])
        }
    }
}

// ── d) Show the app card in Apps Manager (first run flips visible: false -> true) ──

File manifest = new File(customDir, 'app.json')
if (manifest.isFile() && manifest.text.contains('"visible": false')) {
    manifest.text = manifest.text.replace('"visible": false', '"visible": true')
    log.info('app.json: "visible" set to true — the app card appears on the next Apps refresh')
}

log.info("=== {}: complete — {} customers, {} invoices in bp_* tables ===", APP_ID, N, invoiceCount)
