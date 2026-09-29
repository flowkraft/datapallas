// @description Loads the dash_demo demo data (23 tables, 219,491 rows) used by the Dashboard Demos
// Bindings provided by SeedScriptRunner:
//   dbSql     - groovy.sql.Sql connected to the target database
//   vendor    - String (uppercase). This script runs on DUCKDB only: the dashboards demo ships in
//               the product's DuckDB sample, and nothing else reads it. On any other vendor it
//               says so and stops without touching anything.
//   log       - SLF4J Logger
//   params    - Map; 'today' (yyyy-MM-dd) is the day the data should be current for. Left out, the
//               script uses the real today, so a fresh install is current on the day it is made.
//               'wipe' ('true'/'false') overrides WIPE_ALL_DATA below.
//               'dataDir' - the folder holding the 23 .psv.gz files. Left out, the script
//               reads them from db/scripts/dashboards-demo-data of the installation.
//
// The rows live in one |-separated file per table, gzipped, and are loaded as they are: this
// script never invents data, so every run gives the same answers.
//
// It runs once: the first run loads, every later run finds the data complete and does nothing, so
// nobody loses what they changed in dash_demo by clicking Run again. To reload, run it with wipe.
//
// There is no transaction, for the reason cube-demo-data.groovy gives: the marker is written last,
// so a run that fails halfway leaves no marker, and the next run loads everything again.

import java.time.LocalDate
import java.util.zip.GZIPInputStream

// ── the two constants a reader may want to change ──────────────────────────

// false: the data is loaded once and left alone afterwards. true: the 23 tables are dropped
// and loaded again, which with the date shift below means data current for today - the case of an
// installation that is a year old. A caller can override it with params.wipe; from the Seed Data
// tab, where the script runs as pasted text with no params, set it to true here in the pasted copy
// and run it. Only these 23 tables in dash_demo are ever dropped: never the schema, the
// database, the user, or anything else.
final boolean WIPE_ALL_DATA = false

// The version of the rows this script ships with, bumped whenever the .psv files change, or the
// tables they are loaded into do. A database holding an older version is NOT reloaded on its own -
// that would break the promise above - the script only says a newer one exists.
final int DATA_VERSION = 1

// ── the vendor ─────────────────────────────────────────────────────────────

String v = (vendor ?: '').toString().toUpperCase()
if (v != 'DUCKDB') {
    log.info("dashboards-demo-data.groovy is DuckDB only for now, and the database it was given "
            + "is {}; nothing was changed. The Dashboard Demos read dash_demo in the product's "
            + "DuckDB sample.", (vendor ?: 'unknown'))
    return
}

// ── where the rows are ─────────────────────────────────────────────────────

// One rule, whichever way the script is run. A caller that already knows where the files are - the
// package build, a test - passes dataDir. Everyone else gets the installation's copy, the same
// db/scripts the Seed Data tab's Examples dropdown lists this script from.

File dataDir
String askedDataDir = params?.get('dataDir')?.toString()?.trim()
if (askedDataDir) {
    dataDir = new File(askedDataDir)
} else {
    def Utils = com.sourcekraft.documentburster.utils.Utils
    dataDir = new File(Utils.resolvePathAgainstPortableDir('db/scripts/dashboards-demo-data'))
}

if (!dataDir.isDirectory()) {
    throw new IllegalStateException("dashboards-demo-data.groovy found no data folder at "
            + dataDir.absolutePath + ". The 23 .psv.gz files travel with the script: copy the "
            + "'dashboards-demo-data' folder into db/scripts/ of the installation, or run the "
            + "script with dataDir set to the folder that holds them.")
}

// ── the frozen "today", and the shift that moves it to the caller's today ───
// The rows were generated for one day: 2026-09-30. Loaded as they are, a question about "this
// quarter" or "the last 30 days" answers nothing once the calendar passes it. So every day in the
// rows moves - but in whole 52-week steps, never by a part of a week, because these dashboards
// are read by weekday and by hour: a Monday stays a Monday, a Saturday peak stays on Saturday,
// and every gap, duration, ordering and NULL is exactly what it was.

final LocalDate DATA_TODAY = LocalDate.parse('2026-09-30')
final long STEP_DAYS = 364L

String askedToday = params?.get('today')?.toString()?.trim()
LocalDate today
if (askedToday) {
    try {
        today = LocalDate.parse(askedToday)
    } catch (Exception badDay) {
        throw new IllegalStateException("dashboards-demo-data.groovy was given today='" + askedToday
                + "', which is not a yyyy-MM-dd day: " + badDay.message)
    }
} else {
    today = LocalDate.now()
}

// The latest whole step that is not after today: 0 on the day the rows were generated for, one
// step a year afterwards. The data's own today is DATA_TODAY + shiftDays, which can be up to 363
// days before the day the seed runs. That is the design: a whole number of weeks, or nothing.
long steps = Math.floorDiv(java.time.temporal.ChronoUnit.DAYS.between(DATA_TODAY, today), STEP_DAYS)
long shiftDays = steps * STEP_DAYS

boolean wipe = WIPE_ALL_DATA
String askedWipe = params?.get('wipe')?.toString()?.trim()?.toLowerCase()
if (askedWipe) {
    if (!(askedWipe in ['true', 'false'])) {
        throw new IllegalStateException("dashboards-demo-data.groovy was given wipe='" + askedWipe
                + "', which is neither 'true' nor 'false'.")
    }
    wipe = (askedWipe == 'true')
}

log.info("=== dash_demo demo data: today is {}, the rows were made for {}, so every day moves {} "
        + "days ({} whole 52-week steps) and the data's own today becomes {} ===",
        today, DATA_TODAY, shiftDays, steps, DATA_TODAY.plusDays(shiftDays))

// -- the tables: the columns in file order, with the type each one is loaded as
// The types are the ones truths_dashboards_demo.py loads the same files with, so what the truths
// script computed and what the product queries are the same rows in the same columns.

def TABLES = [
    geo_cities          : 'city_id:INTEGER;city:VARCHAR(60);country_code:VARCHAR(2);country:VARCHAR(60);region:VARCHAR(10);latitude:DECIMAL(9,4);longitude:DECIMAL(9,4)',
    customers           : 'customer_id:INTEGER;customer_type:VARCHAR(10);name:VARCHAR(120);company_name:VARCHAR(120);segment:VARCHAR(20);country_code:VARCHAR(2);city_id:INTEGER;signup_date:DATE;acquisition_channel:VARCHAR(20);payment_terms_days:INTEGER;credit_limit:DECIMAL(12,2);account_manager_id:INTEGER',
    products            : 'product_id:INTEGER;sku:VARCHAR(20);name:VARCHAR(120);category:VARCHAR(40);subcategory:VARCHAR(40);brand:VARCHAR(40);unit_cost:DECIMAL(12,2);list_price:DECIMAL(12,2);launch_date:DATE;discontinued:BOOLEAN;rating:DECIMAL(3,1)',
    orders              : 'order_id:INTEGER;customer_id:INTEGER;order_ts:TIMESTAMP;channel:VARCHAR(20);device:VARCHAR(10);status:VARCHAR(10);country_code:VARCHAR(2);city_id:INTEGER;subtotal:DECIMAL(12,2);discount_amount:DECIMAL(12,2);shipping_fee:DECIMAL(12,2);tax_amount:DECIMAL(12,2);total_amount:DECIMAL(12,2);warehouse_id:INTEGER;carrier:VARCHAR(20);shipped_ts:TIMESTAMP;promised_date:DATE;delivered_ts:TIMESTAMP',
    order_lines         : 'order_id:INTEGER;line_no:INTEGER;product_id:INTEGER;qty:INTEGER;unit_price:DECIMAL(12,2);discount_pct:DECIMAL(5,2);line_amount:DECIMAL(12,2);line_cost:DECIMAL(12,2)',
    web_sessions        : 'session_id:INTEGER;started_ts:TIMESTAMP;customer_id:INTEGER;traffic_source:VARCHAR(20);device:VARCHAR(10);country_code:VARCHAR(2);pages_viewed:INTEGER;duration_sec:INTEGER;reached_product:BOOLEAN;reached_cart:BOOLEAN;reached_checkout:BOOLEAN;purchased:BOOLEAN;order_id:INTEGER',
    crm_opportunities   : 'opportunity_id:INTEGER;customer_id:INTEGER;owner_employee_id:INTEGER;stage:VARCHAR(20);lead_source:VARCHAR(20);amount:DECIMAL(12,2);probability_pct:INTEGER;created_date:DATE;expected_close_date:DATE;closed_date:DATE',
    sales_targets       : 'month:DATE;region:VARCHAR(10);revenue_target:DECIMAL(12,2);orders_target:INTEGER',
    kpi_targets         : 'area:VARCHAR(20);kpi:VARCHAR(40);target:DECIMAL(12,2);direction:VARCHAR(20);unit:VARCHAR(10)',
    rep_quotas          : 'employee_id:INTEGER;quarter_start:DATE;quota:DECIMAL(12,2)',
    invoices            : 'invoice_id:INTEGER;invoice_no:VARCHAR(30);customer_id:INTEGER;source:VARCHAR(10);order_id:INTEGER;subscription_id:INTEGER;issue_date:DATE;due_date:DATE;amount:DECIMAL(12,2);tax_amount:DECIMAL(12,2);status:VARCHAR(20);last_paid_date:DATE',
    invoice_payments    : 'payment_id:INTEGER;invoice_id:INTEGER;paid_date:DATE;amount:DECIMAL(12,2);method:VARCHAR(20)',
    subscriptions       : 'subscription_id:INTEGER;customer_id:INTEGER;plan:VARCHAR(10);seats:INTEGER;mrr:DECIMAL(12,2);start_date:DATE;cancel_date:DATE;cancel_reason:VARCHAR(40);status:VARCHAR(10)',
    subscription_changes: 'change_id:INTEGER;subscription_id:INTEGER;change_date:DATE;change_type:VARCHAR(20);mrr_delta:DECIMAL(12,2)',
    departments         : 'department_id:INTEGER;name:VARCHAR(40);cost_center:VARCHAR(20)',
    employees           : 'employee_id:INTEGER;name:VARCHAR(120);department_id:INTEGER;job_title:VARCHAR(60);level:VARCHAR(4);country_code:VARCHAR(2);city_id:INTEGER;hire_date:DATE;termination_date:DATE;termination_reason:VARCHAR(60);employment_type:VARCHAR(20);base_salary_annual:DECIMAL(12,2);manager_id:INTEGER',
    payroll_lines       : 'period_month:DATE;employee_id:INTEGER;gross_pay:DECIMAL(12,2);base_pay:DECIMAL(12,2);bonus:DECIMAL(12,2);overtime_pay:DECIMAL(12,2);overtime_hours:DECIMAL(6,1);employer_taxes:DECIMAL(12,2);benefits:DECIMAL(12,2);net_pay:DECIMAL(12,2)',
    warehouses          : 'warehouse_id:INTEGER;name:VARCHAR(60);city_id:INTEGER;latitude:DECIMAL(9,4);longitude:DECIMAL(9,4);capacity_units:INTEGER',
    stock_levels        : 'product_id:INTEGER;warehouse_id:INTEGER;qty_on_hand:INTEGER;reorder_level:INTEGER;reorder_qty:INTEGER;last_received_date:DATE;last_sold_date:DATE',
    stock_movements     : 'movement_id:INTEGER;product_id:INTEGER;warehouse_id:INTEGER;movement_ts:TIMESTAMP;movement_type:VARCHAR(20);qty:INTEGER',
    support_agents      : 'agent_id:INTEGER;employee_id:INTEGER;name:VARCHAR(120);team:VARCHAR(20);country_code:VARCHAR(2);hire_date:DATE',
    support_tickets     : 'ticket_id:INTEGER;customer_id:INTEGER;order_id:INTEGER;agent_id:INTEGER;opened_ts:TIMESTAMP;first_response_ts:TIMESTAMP;resolved_ts:TIMESTAMP;status:VARCHAR(10);priority:VARCHAR(10);channel:VARCHAR(10);category:VARCHAR(20);sla_hours:INTEGER;sla_breached:BOOLEAN;csat_score:INTEGER;reopened:BOOLEAN',
]

// ── the keys and the indexes ───────────────────────────────────────────────
// One list, next to the tables above, and the only place either is written down (section 6.6). The
// key is the table's id, or the columns a table is really keyed by; an index goes on every column
// naming another table's row that is not already a key's first column. There are no FOREIGN KEYs:
// the references are checked by queries, in the truths script and in DashboardsDemoDataScriptTest.
// as_of holds one row and gets neither.

def KEYS = [
    geo_cities          : 'city_id',
    customers           : 'customer_id',
    products            : 'product_id',
    orders              : 'order_id',
    order_lines         : 'order_id,line_no',
    web_sessions        : 'session_id',
    crm_opportunities   : 'opportunity_id',
    sales_targets       : 'month,region',
    kpi_targets         : 'area,kpi',
    rep_quotas          : 'employee_id,quarter_start',
    invoices            : 'invoice_id',
    invoice_payments    : 'payment_id',
    subscriptions       : 'subscription_id',
    subscription_changes: 'change_id',
    departments         : 'department_id',
    employees           : 'employee_id',
    payroll_lines       : 'period_month,employee_id',
    warehouses          : 'warehouse_id',
    stock_levels        : 'product_id,warehouse_id',
    stock_movements     : 'movement_id',
    support_agents      : 'agent_id',
    support_tickets     : 'ticket_id',
]

def INDEXES = [
    customers           : 'city_id,account_manager_id',
    orders              : 'customer_id,city_id,warehouse_id',
    order_lines         : 'product_id',
    web_sessions        : 'customer_id,order_id',
    crm_opportunities   : 'customer_id,owner_employee_id',
    invoices            : 'customer_id,order_id,subscription_id',
    invoice_payments    : 'invoice_id',
    subscriptions       : 'customer_id',
    subscription_changes: 'subscription_id',
    employees           : 'department_id,city_id,manager_id',
    payroll_lines       : 'employee_id',
    warehouses          : 'city_id',
    stock_levels        : 'warehouse_id',
    stock_movements     : 'product_id,warehouse_id',
    support_agents      : 'employee_id',
    support_tickets     : 'customer_id,order_id,agent_id',
]

// Unlike cube-demo-data.groovy, which ships on Oracle too, this one only ever runs on DuckDB, so
// an index name is simply ix_<table>_<column>; it only has to be unique.
def indexName = { String table, String column -> 'ix_' + table + '_' + column }

// Two things can go wrong in the three lists above, and both are said here, before anything is
// dropped: a key or an index naming a column the table does not have, and two indexes ending up
// with the same name.
TABLES.each { String table, String spec ->
    List<String> names = spec.split(';').collect { it.trim().split(':')[0] }
    ([KEYS[table]] + [INDEXES[table]]).each { String columns ->
        columns?.split(',')?.collect { it.trim() }?.each { String column ->
            if (!names.contains(column)) {
                throw new IllegalStateException("dashboards-demo-data.groovy keys or indexes "
                        + "dash_demo." + table + " by '" + column + "', which is not one of its "
                        + "columns: " + names + ".")
            }
        }
    }
}

Set<String> indexNames = new HashSet<String>()
INDEXES.each { String table, String spec ->
    spec.split(',').collect { it.trim() }.each { String column ->
        if (!indexNames.add(indexName(table, column))) {
            throw new IllegalStateException("dashboards-demo-data.groovy would make two indexes "
                    + "called " + indexName(table, column) + "; the second one is on dash_demo."
                    + table + " (" + column + ").")
        }
    }
}

// ── the marker table ───────────────────────────────────────────────────────
// dash_demo.as_of is both the demo's "today" and the marker: one row, written last, holding the
// day the rows were made for, the day they were seeded on, the days they moved and the version.
// Every dashboard reads its as_of column instead of the real today, so a card that says "last 30
// days" means the last 30 days of the data.

final String AS_OF = 'as_of'

// ── the schema ─────────────────────────────────────────────────────────────

def exec = { String sql -> dbSql.execute(sql) }

exec('CREATE SCHEMA IF NOT EXISTS dash_demo')

def dropTable = { String table -> exec('DROP TABLE IF EXISTS dash_demo.' + table) }

// ── is the data already there? ─────────────────────────────────────────────
// Complete means: the marker row is there AND every table holds exactly the rows its file holds.
// The expected counts are read from the files themselves, so there is no second list to keep in
// step, and a table emptied or dropped by hand is caught as surely as a missing one.

def fileOf = { String table ->
    File file = new File(dataDir, table + '.psv.gz')
    if (!file.isFile()) {
        throw new IllegalStateException("dashboards-demo-data.groovy found no rows for '" + table
                + "': " + file.absolutePath + " is missing. The 23 .psv.gz files travel with "
                + "the script.")
    }
    return file
}

def headerOf = { String table ->
    String first = null
    new GZIPInputStream(new FileInputStream(fileOf(table))).withReader('UTF-8') { reader ->
        first = reader.readLine()
    }
    if (first == null) {
        throw new IllegalStateException("dashboards-demo-data.groovy found " + table + ".psv.gz "
                + "empty: it starts with a header line naming its columns.")
    }
    return first.split('\\|', -1).collect { it.trim() }
}

// The whole file, line by line: only the marker's two lines are read this way.
def linesOf = { String table ->
    List<String> out = new ArrayList<String>()
    new GZIPInputStream(new FileInputStream(fileOf(table))).withReader('UTF-8') { reader ->
        String line
        while ((line = reader.readLine()) != null) {
            if (!line.trim().isEmpty()) out.add(line)
        }
    }
    return out
}

def rowsInFile = { String table ->
    int lines = 0
    new GZIPInputStream(new FileInputStream(fileOf(table))).withReader('UTF-8') { reader ->
        String line
        while ((line = reader.readLine()) != null) {
            if (!line.trim().isEmpty()) lines++
        }
    }
    return lines - 1
}

def countIn = { String table ->
    try {
        return (dbSql.firstRow('SELECT COUNT(*) AS n FROM dash_demo.' + table)?.n) as Long
    } catch (Exception notThere) {
        log.debug("dash_demo.{} cannot be counted: {}", table, notThere.message)
        return null
    }
}

if (wipe) {
    log.info("dash_demo: wipe was asked for, so the {} tables are dropped and loaded again",
            TABLES.size() + 1)
} else {

    def marker = null
    try {
        marker = dbSql.firstRow('SELECT as_of, data_today, seeded_on, shift_days, data_version '
                + 'FROM dash_demo.as_of')
    } catch (Exception noMarker) {
        log.debug("dash_demo.as_of cannot be read: {}", noMarker.message)
    }

    if (marker) {
        String missing = TABLES.keySet().find { String table -> countIn(table) != (rowsInFile(table) as Long) }
        if (missing) {
            log.info("dash_demo has a marker but is not complete (dash_demo.{} holds {} rows, the "
                    + "shipped data has {}), so everything is loaded again",
                    missing, countIn(missing), rowsInFile(missing))
        } else if ((marker.data_version as int) < DATA_VERSION) {
            log.info("newer demo data available ({} -> {}); run with wipe to reload",
                    marker.data_version, DATA_VERSION)
            return
        } else {
            log.info("dash_demo already complete (seeded on {}, data today {}), nothing done; "
                    + "run with wipe to reload", marker.seeded_on, marker.as_of)
            return
        }
    } else {
        log.info("dash_demo has no demo data yet, so it is loaded")
    }
}

// ── the types ──────────────────────────────────────────────────────────────
// The kind is the first word of the type, which is all the binding needs; the type itself goes
// into the CREATE TABLE as it stands.

def kindOf = { String type ->
    int paren = type.indexOf('(')
    return (paren < 0 ? type : type.substring(0, paren)).trim().toUpperCase()
}

// A month, a quarter or a payroll period is a period, not a day: it moves by whole calendar years,
// one per step, so it still starts on the first of its month and lines up with the days around it.
def PERIOD_COLUMNS = ['sales_targets.month', 'rep_quotas.quarter_start',
                      'payroll_lines.period_month'] as Set

// A year written inside a text column follows the day it belongs to, so an invoice raised in
// January still reads INV-<that January's year>-00001.
def YEAR_FROM_DATE = ['invoices.invoice_no': 'issue_date']

// The column as the loading SELECT reads it: itself when nothing moves, and otherwise the day, the
// timestamp or the year inside the text moved by the shift. Doing it here means the rows are
// written once, already shifted, and no key column is ever UPDATEd afterwards.
def shifted = { String table, String column, String kind ->
    if (shiftDays == 0L) return column
    String from = YEAR_FROM_DATE[table + '.' + column]
    if (from) {
        return "regexp_replace(" + column + ", '\\d{4}', strftime(" + from +
                " + INTERVAL '" + shiftDays + " days', '%Y'))"
    }
    if (kind == 'DATE') {
        return PERIOD_COLUMNS.contains(table + '.' + column)
                ? 'CAST(' + column + " + INTERVAL '" + steps + " years' AS DATE)"
                : 'CAST(' + column + " + INTERVAL '" + shiftDays + " days' AS DATE)"
    }
    if (kind == 'TIMESTAMP') {
        return 'CAST(' + column + " + INTERVAL '" + shiftDays + " days' AS TIMESTAMP)"
    }
    return column
}

// ── load, table by table ───────────────────────────────────────────────────

log.info("=== dash_demo demo data: loading {} tables from {} ===", TABLES.size() + 1,
        dataDir.absolutePath)

// The marker goes first: from here until the last table is in, there is no row saying the data is
// complete, so a run that fails halfway is seen for what it is by the next one.
dropTable(AS_OF)

int loaded = 0

TABLES.each { String table, String spec ->

    List<List<String>> columns = spec.split(';').collect { it.trim().split(':') as List }
    List<String> names = columns.collect { it[0] }
    List<String> types = columns.collect { it[1] }
    List<String> kinds = types.collect { kindOf(it) }
    List<String> keyColumns = KEYS[table].split(',').collect { it.trim() }

    List<String> header = headerOf(table)
    if (header != names) {
        throw new IllegalStateException("dashboards-demo-data.groovy reads " + table + ".psv.gz "
                + "with the columns " + names + ", but the file's header says " + header + ".")
    }

    dropTable(table)

    exec('CREATE TABLE dash_demo.' + table + ' (' +
            [names, types].transpose().collect { n, t ->
                n + ' ' + t + (keyColumns.contains(n) ? ' NOT NULL' : '')
            }.join(', ') +
            ', PRIMARY KEY (' + keyColumns.join(', ') + '))')

    // One statement per table: the database reads the gzipped file itself, with the columns and
    // the types written above rather than guessed, and the date shift is part of the SELECT. The
    // same file, the same delimiter and the same empty-is-NULL rule the truths script reads with.
    String columnTypes = [names, types].transpose().collect { n, t ->
        "'" + n + "': '" + t + "'"
    }.join(', ')
    String selected = [names, kinds].transpose().collect { n, k ->
        shifted(table, n, k) + ' AS ' + n
    }.join(', ')

    exec('INSERT INTO dash_demo.' + table + ' SELECT ' + selected + " FROM read_csv('"
            + fileOf(table).absolutePath.replace('\\', '/') + "', delim = '|', header = true, "
            + "nullstr = '', compression = 'gzip', auto_detect = false, columns = {"
            + columnTypes + '})')

    long rows = countIn(table)
    long expected = rowsInFile(table) as Long
    if (rows != expected) {
        throw new IllegalStateException("dashboards-demo-data.groovy loaded " + rows + " rows into "
                + "dash_demo." + table + ", where " + table + ".psv.gz holds " + expected + ".")
    }

    loaded += rows
    log.info("dash_demo.{}: {} rows", table, rows)
}

log.info("=== dash_demo demo data: {} rows in {} tables ===", loaded, TABLES.size())

// ── the indexes ────────────────────────────────────────────────────────────
// After the rows, because a bulk load is faster into a table that has none.

int made = 0
INDEXES.each { String table, String spec ->
    spec.split(',').collect { it.trim() }.each { String column ->
        exec('CREATE INDEX ' + indexName(table, column) + ' ON dash_demo.' + table
                + ' (' + column + ')')
        made++
    }
}
log.info("=== dash_demo demo data: {} indexes on {} tables ===", made, INDEXES.size())

// ── the marker: the demo's today, and what was loaded when ─────────────────
// One row, written after the 23 tables. as_of is the data's own today - DATA_TODAY moved by
// the whole steps taken - and seeded_on is the day the load ran, which is the same day or up to
// 363 days later. web_session_sample_rate comes from the file: the generator wrote one session in
// that many, and a query that wants "all sessions" multiplies by it.

List<String> markerLines = linesOf(AS_OF)
List<String> markerNames = markerLines.remove(0).split('\\|', -1).collect { it.trim() }
List<String> markerCells = markerLines.get(0).split('\\|', -1).collect { it.trim() }
int sampleRate = Integer.valueOf(markerCells[markerNames.indexOf('web_session_sample_rate')])

exec('CREATE TABLE dash_demo.as_of (as_of DATE, web_session_sample_rate INTEGER, '
        + 'data_today DATE, seeded_on TIMESTAMP, shift_days INTEGER, data_version INTEGER)')

dbSql.execute('INSERT INTO dash_demo.as_of (as_of, web_session_sample_rate, data_today, '
        + 'seeded_on, shift_days, data_version) VALUES (?, ?, ?, ?, ?, ?)',
        [java.sql.Date.valueOf(DATA_TODAY.plusDays(shiftDays)), sampleRate,
         java.sql.Date.valueOf(DATA_TODAY), java.sql.Timestamp.valueOf(today.atStartOfDay()),
         shiftDays as int, DATA_VERSION])

log.info("dash_demo.as_of: as_of {}, data_today {}, seeded_on {}, shift_days {}, data_version {}",
        DATA_TODAY.plusDays(shiftDays), DATA_TODAY, today, shiftDays, DATA_VERSION)
