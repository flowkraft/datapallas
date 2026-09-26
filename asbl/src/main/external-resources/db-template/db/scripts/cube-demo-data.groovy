// @description Loads the cube_demo demo data (19 tables, 32,313 rows) used by the Cube Stories
// Bindings provided by SeedScriptRunner:
//   dbSql     — groovy.sql.Sql connected to the target database
//   vendor    — String (uppercase): POSTGRES, MYSQL, MARIADB, SQLSERVER, ORACLE, DB2, SUPABASE,
//                                   TIMESCALEDB, CLICKHOUSE, SQLITE, DUCKDB
//   log       — SLF4J Logger
//   params    — Map; 'today' (yyyy-MM-dd) is the day the data should end on. Left out, the
//               script uses the real today, so a fresh install is current on the day it is made.
//               'wipe' ('true'/'false') overrides WIPE_ALL_DATA below.
//               'dataDir' — the folder holding the 19 .psv files. Left out, the script reads them
//               from db/scripts/cube-demo-data of the installation.
//
// The rows live in one |-separated file per table and are loaded as they are: this script never
// invents data, so every run gives the same answers, on every database.
//
// It runs once: the first run loads, every later run finds the data complete and does nothing, so
// nobody loses what they changed in cube_demo by clicking Run again. To reload, run it with wipe.
//
// There is no transaction, and that is a decision, not an oversight. A single transaction is not
// honest across the eleven vendors: MySQL, MariaDB and Oracle commit implicitly on every CREATE or
// DROP TABLE and ClickHouse has no transactions at all, so only Postgres, SQL Server, Db2, SQLite
// and DuckDB could roll a half-done load back. A transaction would protect half the vendors and
// pretend on the rest, or need a vendor IF, which this codebase does not do. The marker gives the
// same practical safety everywhere: it is written last, so a run that fails halfway leaves no
// marker, and the next run sees "not complete" and loads everything again.

import groovy.sql.Sql
import java.sql.Types
import java.time.LocalDate

// ── the two constants a reader may want to change ────────────────────────────

// false: the data is loaded once and left alone afterwards. true: the 20 tables are dropped and
// loaded again, which with the date shift below means fresh data dated today - the case of an
// installation that is a year old. A caller can override it with params.wipe; from the Seed Data
// tab, where the script runs as pasted text with no params, set it to true here in the pasted copy
// and run it. Only these 20 tables in cube_demo are ever dropped: never the schema, the database,
// the user, or anything else.
final boolean WIPE_ALL_DATA = false

// The version of the rows this script ships with, bumped whenever the .psv files change. 1 was the
// data Phase 1 shipped; 2 is the data after the Phase 1b touch-ups. A database holding an older
// version is NOT reloaded on its own - that would break the promise above - the script only says a
// newer one exists.
final int DATA_VERSION = 2

// ── where the rows are ───────────────────────────────────────────────────────

// One rule, whichever way the script is run. A caller that already knows where the files are - the
// package build, a test - passes dataDir. Everyone else gets the installation's copy, the same
// db/scripts the Seed Data tab's Examples dropdown lists this script from; that is what makes the
// Run tab work, where the script arrives as text and has no folder of its own. It is how the
// custom app seeds find their files too.

File dataDir
String askedDataDir = params?.get('dataDir')?.toString()?.trim()
if (askedDataDir) {
    dataDir = new File(askedDataDir)
} else {
    def Utils = com.sourcekraft.documentburster.utils.Utils
    dataDir = new File(Utils.resolvePathAgainstPortableDir('db/scripts/cube-demo-data'))
}

if (!dataDir.isDirectory()) {
    throw new IllegalStateException("cube-demo-data.groovy found no data folder at "
            + dataDir.absolutePath + ". The 19 .psv files travel with the script: copy the "
            + "'cube-demo-data' folder into db/scripts/ of the installation, or run the script with "
            + "dataDir set to the folder that holds them.")
}

// ── the vendor ───────────────────────────────────────────────────────────────

String v = (vendor ?: '').toString().toUpperCase()

boolean isPostgresFamily = (v in ['POSTGRES', 'POSTGRESQL', 'SUPABASE', 'TIMESCALEDB'])
boolean isMysqlFamily    = (v in ['MYSQL', 'MARIADB'])
boolean isSqlServer      = (v == 'SQLSERVER')
boolean isOracle         = (v == 'ORACLE')
boolean isDb2            = (v in ['DB2', 'IBMDB2'])
boolean isClickHouse     = (v == 'CLICKHOUSE')
boolean isSqlite         = (v == 'SQLITE')
boolean isDuckdb         = (v == 'DUCKDB')

if (!(isPostgresFamily || isMysqlFamily || isSqlServer || isOracle || isDb2 || isClickHouse
        || isSqlite || isDuckdb)) {
    throw new IllegalStateException("cube-demo-data.groovy does not know the database vendor '"
            + vendor + "'. It runs on sqlite, duckdb, postgres (supabase, timescaledb), mysql, "
            + "mariadb, sqlserver, oracle, db2 and clickhouse.")
}

// ── the frozen "today", and the shift that moves it to the caller's today ─────
// The rows were generated for one day: 2026-09-30, the generator's END. Loaded as they are, a
// question about "this quarter" or "the last 30 days" answers nothing once the calendar passes it.
// So every day in the rows moves by the same whole number of days, which keeps every gap, every
// duration, every ordering and every NULL exactly as it was, and makes the statuses (Overdue, In
// Transit, ...) true again for the day the data is loaded.

final LocalDate DATA_TODAY = LocalDate.parse('2026-09-30')

String askedToday = params?.get('today')?.toString()?.trim()
LocalDate today
if (askedToday) {
    try {
        today = LocalDate.parse(askedToday)
    } catch (Exception badDay) {
        throw new IllegalStateException("cube-demo-data.groovy was given today='" + askedToday
                + "', which is not a yyyy-MM-dd day: " + badDay.message)
    }
} else {
    today = LocalDate.now()
}

long shiftDays = java.time.temporal.ChronoUnit.DAYS.between(DATA_TODAY, today)

boolean wipe = WIPE_ALL_DATA
String askedWipe = params?.get('wipe')?.toString()?.trim()?.toLowerCase()
if (askedWipe) {
    if (!(askedWipe in ['true', 'false'])) {
        throw new IllegalStateException("cube-demo-data.groovy was given wipe='" + askedWipe
                + "', which is neither 'true' nor 'false'.")
    }
    wipe = (askedWipe == 'true')
}

// The school data has no real dates: a start year and a term like '2026 Autumn'. Those move by
// whole years, so Spring stays Spring and Autumn stays Autumn; the nearest whole year to the day
// shift is the one that keeps them next to the dated tables.
int shiftYears = Math.round(shiftDays / 365.2425d) as int

log.info("=== cube_demo demo data: today is {}, the rows end on {}, so every day moves {} days "
        + "({} years for the school year) ===", today, DATA_TODAY, shiftDays, shiftYears)

// ── the tables: the columns in file order, with what each one holds ──────────
// INT = whole number, DEC = DECIMAL(12,2), DATE = a day, TEXT = VARCHAR(100).

def TABLES = [
    crm_accounts       : 'account_id:INT,name:TEXT,industry:TEXT,country:TEXT,city:TEXT,employees:INT,account_tier:TEXT',
    crm_sales_reps     : 'rep_id:INT,name:TEXT,region:TEXT,hire_date:DATE,quota_amount:DEC',
    crm_deals          : 'deal_id:INT,deal_name:TEXT,account_id:INT,rep_id:INT,stage:TEXT,lead_source:TEXT,deal_type:TEXT,amount:DEC,probability_pct:INT,created_date:DATE,expected_close_date:DATE,close_date:DATE',
    support_agents     : 'agent_id:INT,name:TEXT,team:TEXT,email:TEXT',
    support_tickets    : 'ticket_id:INT,subject:TEXT,account_id:INT,agent_id:INT,channel:TEXT,category:TEXT,priority:TEXT,status:TEXT,opened_date:DATE,resolved_date:DATE,sla_breached:INT,first_response_minutes:INT,resolution_hours:DEC',
    school_students    : 'student_id:INT,first_name:TEXT,last_name:TEXT,program:TEXT,start_year:INT,country:TEXT',
    school_courses     : 'course_id:INT,code:TEXT,title:TEXT,department:TEXT,credits:INT',
    school_enrollments : 'enrollment_id:INT,student_id:INT,course_id:INT,term:TEXT,score:DEC,attendance_pct:DEC',
    logistics_carriers : 'carrier_id:INT,name:TEXT,transport_mode:TEXT,country:TEXT',
    logistics_depots   : 'depot_id:INT,name:TEXT,city:TEXT,country:TEXT,latitude:DEC,longitude:DEC,capacity_pallets:INT,docks:INT',
    logistics_shipments: 'shipment_id:INT,tracking_no:TEXT,carrier_id:INT,origin_depot_id:INT,booked_date:DATE,delivered_date:DATE,status:TEXT,dest_country:TEXT,dest_city:TEXT,weight_kg:DEC,shipping_cost:DEC,service_level:TEXT,pallets:INT,transit_days:INT',
    shop_customers     : 'customer_id:INT,first_name:TEXT,last_name:TEXT,country:TEXT,city:TEXT,signup_date:DATE',
    shop_products      : 'product_id:INT,sku:TEXT,name:TEXT,category:TEXT,list_price:DEC,cost_price:DEC,brand:TEXT',
    shop_orders        : 'order_id:INT,customer_id:INT,order_date:DATE,status:TEXT,channel:TEXT,shipping_fee:DEC',
    shop_order_lines   : 'order_id:INT,line_no:INT,product_id:INT,qty:INT,unit_price:DEC,discount_pct:INT',
    erp_customers      : 'customer_id:INT,name:TEXT,country:TEXT,payment_terms_days:INT,credit_limit:DEC',
    erp_invoices       : 'invoice_id:INT,invoice_no:TEXT,customer_id:INT,issue_date:DATE,due_date:DATE,status:TEXT,total_amount:DEC',
    erp_invoice_lines  : 'invoice_id:INT,line_no:INT,item:TEXT,qty:INT,unit_price:DEC,amount:DEC',
    erp_payments       : 'payment_id:INT,invoice_id:INT,paid_date:DATE,method:TEXT,amount:DEC',
]

// The ten columns that hold a NULL. ClickHouse needs to be told, column by column; every other
// database lets any column be empty.
def NULLABLE = [
    'crm_deals.close_date',
    'support_tickets.agent_id', 'support_tickets.resolved_date',
    'support_tickets.first_response_minutes', 'support_tickets.resolution_hours',
    'school_enrollments.score',
    'logistics_shipments.carrier_id', 'logistics_shipments.delivered_date',
    'logistics_shipments.transit_days',
    'shop_orders.customer_id',
] as Set

// A year written inside a text column follows the day it belongs to, so an invoice raised in
// January still reads INV-<that January's year>-00001.
def YEAR_FROM_DATE = [
    'erp_invoices.invoice_no'        : 'issue_date',
    'logistics_shipments.tracking_no': 'booked_date',
]

// ── the schema ───────────────────────────────────────────────────────────────

def exec = { String sql -> dbSql.execute(sql) }

if (isSqlite) {
    // SQLite has no schemas: a second database file is attached under the name cube_demo. The
    // caller attaches it, because it owns the file; the script only checks that it is there.
    boolean attached = dbSql.rows('PRAGMA database_list').any { (it.name ?: it.NAME)?.toString() == 'cube_demo' }
    if (!attached) {
        throw new IllegalStateException("On SQLite the demo data goes into a second database file "
                + "attached as 'cube_demo', because SQLite has no schemas. Nothing is attached "
                + "under that name. Run ATTACH DATABASE '<file>' AS cube_demo on this connection "
                + "first, then run the script again.")
    }
} else if (isMysqlFamily || isClickHouse) {
    exec('CREATE DATABASE IF NOT EXISTS cube_demo')
} else if (isSqlServer) {
    exec("IF SCHEMA_ID('cube_demo') IS NULL EXEC('CREATE SCHEMA cube_demo')")
} else if (isDb2) {
    if (!dbSql.firstRow("SELECT COUNT(*) AS n FROM SYSCAT.SCHEMATA WHERE SCHEMANAME = 'CUBE_DEMO'").n) {
        exec('CREATE SCHEMA cube_demo')
    }
} else if (isOracle) {
    if (!dbSql.firstRow("SELECT COUNT(*) AS n FROM ALL_USERS WHERE USERNAME = 'CUBE_DEMO'").n) {
        exec('CREATE USER cube_demo NO AUTHENTICATION')
        exec('ALTER USER cube_demo QUOTA UNLIMITED ON USERS')
    }
} else {
    exec('CREATE SCHEMA IF NOT EXISTS cube_demo')
}

// ── dropping a table that may not be there ──────────────────────────────

// Oracle 21 and Db2 have no DROP TABLE IF EXISTS, so there the failure is caught and ignored.
// Everywhere else the IF EXISTS saves both the round trip and the warning groovy.sql.Sql logs for
// every statement that failed - twenty of them on a first run, which read like something is wrong.
def dropTable = { String table ->
    if (isOracle || isDb2) {
        try {
            exec('DROP TABLE cube_demo.' + table)
        } catch (Exception notThere) {
            log.debug("cube_demo.{} was not there to drop: {}", table, notThere.message)
        }
    } else {
        exec('DROP TABLE IF EXISTS cube_demo.' + table)
    }
}

// ── is the data already there? ──────────────────────────────────────

// Complete means: the marker row is there AND every table holds exactly the rows its .psv file
// holds. The expected counts are read from the files themselves, so there is no second list to
// keep in step, and a table emptied or dropped by hand is caught as surely as a missing one.

def rowsInFile = { String table ->
    File file = new File(dataDir, table + '.psv')
    if (!file.isFile()) {
        throw new IllegalStateException("cube-demo-data.groovy found no rows for '" + table
                + "': " + file.absolutePath + " is missing. The 19 .psv files travel with the "
                + "script.")
    }
    int lines = 0
    file.withReader('UTF-8') { reader ->
        String line
        while ((line = reader.readLine()) != null) {
            if (!line.trim().isEmpty()) lines++
        }
    }
    return lines - 1
}

def countIn = { String table ->
    try {
        return (dbSql.firstRow('SELECT COUNT(*) AS n FROM cube_demo.' + table)?.n) as Long
    } catch (Exception notThere) {
        log.debug("cube_demo.{} cannot be counted: {}", table, notThere.message)
        return null
    }
}

if (wipe) {
    log.info("cube_demo: wipe was asked for, so the {} tables are dropped and loaded again",
            TABLES.size() + 1)
} else {

    // A marker written by an older version of this script has no data_version column, so this read
    // fails, the data counts as not complete and it is loaded again - which is what an upgrade from
    // that version wants anyway.
    def marker = null
    try {
        marker = dbSql.firstRow('SELECT data_today, seeded_on, shift_days, data_version '
                + 'FROM cube_demo.demo_info')
    } catch (Exception noMarker) {
        log.debug("cube_demo.demo_info cannot be read: {}", noMarker.message)
    }

    if (marker) {
        String missing = TABLES.keySet().find { String table -> countIn(table) != (rowsInFile(table) as Long) }
        if (missing) {
            log.info("cube_demo has a marker but is not complete (cube_demo.{} holds {} rows, the "
                    + "shipped data has {}), so everything is loaded again",
                    missing, countIn(missing), rowsInFile(missing))
        } else if ((marker.data_version as int) < DATA_VERSION) {
            log.info("newer demo data available ({} -> {}); run with wipe to reload",
                    marker.data_version, DATA_VERSION)
            return
        } else {
            log.info("cube_demo already complete (seeded on {}, data today {}), nothing done; "
                    + "run with wipe to reload", marker.seeded_on, marker.data_today)
            return
        }
    } else {
        log.info("cube_demo has no demo data yet, so it is loaded")
    }
}

// ── the types ────────────────────────────────────────────────────────────────

def columnType = { String table, String column, String kind ->
    boolean nullable = NULLABLE.contains(table + '.' + column)
    if (isClickHouse) {
        String base = (kind == 'INT') ? 'Int32' : (kind == 'DEC') ? 'Decimal(12,2)'
                : (kind == 'DATE') ? 'Date32' : 'String'
        return nullable ? 'Nullable(' + base + ')' : base
    }
    if (kind == 'INT') return isOracle ? 'NUMBER(10)' : 'INTEGER'
    if (kind == 'DEC') return 'DECIMAL(12,2)'
    if (kind == 'DATE') return 'DATE'
    return isOracle ? 'VARCHAR2(100)' : 'VARCHAR(100)'
}

// An empty value is bound as a typed NULL, so no database has to guess what kind of nothing it is;
// a value that is there is bound as itself, so dates, decimals and apostrophes need no literal of
// their own anywhere.
def sqlType = { String kind ->
    if (kind == 'INT') return Types.INTEGER
    if (kind == 'DEC') return Types.DECIMAL
    // sqlite-jdbc stores a bound java.sql.Date as epoch milliseconds of the local midnight, which
    // reads back as the day before east of UTC. On SQLite the day is written as ISO text instead,
    // which is what the Sales sample's dates look like to a reader anyway.
    if (kind == 'DATE') return isSqlite ? Types.VARCHAR : Types.DATE
    return Types.VARCHAR
}

def shifted = { String text -> LocalDate.parse(text).plusDays(shiftDays) }

def bindDay = { LocalDate day -> isSqlite ? day.toString() : java.sql.Date.valueOf(day) }

// Every column the table map declares DATE goes through here, so the shift cannot miss one.
def value = { String kind, String text ->
    if (text == null || text.isEmpty()) return null
    if (kind == 'INT') return Integer.valueOf(text)
    if (kind == 'DEC') return new BigDecimal(text)
    if (kind == 'DATE') return bindDay(shifted(text))
    return text
}

// The cells that are not a DATE but still hold a day: the year inside invoice_no and tracking_no,
// the school's start year and its term. Returns the row as it should be written.
def shiftCells = { String table, List<String> names, List<String> cells ->
    if (shiftDays == 0L) return cells
    List<String> out = new ArrayList<String>(cells)
    names.eachWithIndex { String name, int i ->
        String cell = cells[i]
        if (!cell) return
        String key = table + '.' + name
        String from = YEAR_FROM_DATE[key]
        if (from) {
            String day = cells[names.indexOf(from)]
            if (day) out[i] = cell.replaceFirst(/\d{4}/, String.valueOf(shifted(day).year))
        } else if (key == 'school_students.start_year') {
            out[i] = String.valueOf(Integer.parseInt(cell) + shiftYears)
        } else if (key == 'school_enrollments.term') {
            out[i] = String.valueOf(Integer.parseInt(cell.substring(0, 4)) + shiftYears) + cell.substring(4)
        }
    }
    return out
}

// ── load, table by table ─────────────────────────────────────────────────────

log.info("=== cube_demo demo data: loading 19 tables on {} from {} ===", v, dataDir.absolutePath)

// The marker goes first: from here until the last table is in, there is no row saying the data is
// complete, so a run that fails halfway is seen for what it is by the next one.
dropTable('demo_info')

int loaded = 0

TABLES.each { String table, String spec ->

    List<List<String>> columns = spec.split(',').collect { it.trim().split(':') as List }
    List<String> names = columns.collect { it[0] }
    List<String> kinds = columns.collect { it[1] }

    File file = new File(dataDir, table + '.psv')
    if (!file.isFile()) {
        throw new IllegalStateException("cube-demo-data.groovy found no rows for '" + table
                + "': " + file.absolutePath + " is missing. The 19 .psv files travel with the "
                + "script.")
    }

    List<String> lines = file.readLines('UTF-8').findAll { !it.trim().isEmpty() }
    List<String> header = lines.remove(0).split('\\|', -1).collect { it.trim() }
    if (header != names) {
        throw new IllegalStateException("cube-demo-data.groovy reads " + file.name + " with the "
                + "columns " + names + ", but the file's header says " + header + ".")
    }

    dropTable(table)

    String ddl = 'CREATE TABLE cube_demo.' + table + ' (' +
            [names, kinds].transpose().collect { n, k -> n + ' ' + columnType(table, n, k) }.join(', ') +
            ')'
    if (isClickHouse) {
        // ClickHouse has no table without an engine, and MergeTree wants a sort key: the id column
        // every one of these tables starts with.
        ddl += ' ENGINE = MergeTree ORDER BY ' + names[0]
    }
    exec(ddl)

    String insert = 'INSERT INTO cube_demo.' + table + ' (' + names.join(', ') + ') VALUES (' +
            names.collect { '?' }.join(', ') + ')'

    dbSql.withBatch(1000, insert) { ps ->
        lines.each { String line ->
            List<String> raw = line.split('\\|', -1) as List
            if (raw.size() != names.size()) {
                throw new IllegalStateException("cube-demo-data.groovy read a row of "
                        + raw.size() + " values in " + file.name + ", where the table has "
                        + names.size() + " columns: " + line)
            }
            List<String> cells = shiftCells(table, names, raw)
            ps.addBatch([names, kinds, cells].transpose().collect { n, k, c ->
                def bound = value(k, c)
                bound == null ? Sql.in(sqlType(k), null) : bound
            })
        }
    }

    loaded += lines.size()
    log.info("cube_demo.{}: {} rows", table, lines.size())
}

log.info("=== cube_demo demo data: {} rows in {} tables ===", loaded, TABLES.size())

// ── the marker: what was loaded, and when ────────────────────────────────────────
// One row, written after the 19 tables: the day the rows were generated for, the day they were
// loaded for, the whole days between them, and which version of the rows these are.
// seeded_on = data_today + shift_days, always, so a reader - or a test - can tell what a date in
// this data means without knowing how it got there. Its presence is also what "the seed finished"
// means: the next run reads it, counts the rows, and does nothing when everything is there.

String infoDdl = 'CREATE TABLE cube_demo.demo_info (data_today ' +
        columnType('demo_info', 'data_today', 'DATE') + ', seeded_on ' +
        columnType('demo_info', 'seeded_on', 'DATE') + ', shift_days ' +
        columnType('demo_info', 'shift_days', 'INT') + ', data_version ' +
        columnType('demo_info', 'data_version', 'INT') + ')'
if (isClickHouse) {
    infoDdl += ' ENGINE = MergeTree ORDER BY data_today'
}
exec(infoDdl)

dbSql.execute('INSERT INTO cube_demo.demo_info (data_today, seeded_on, shift_days, data_version) '
        + 'VALUES (?, ?, ?, ?)',
        [bindDay(DATA_TODAY), bindDay(today), shiftDays as int, DATA_VERSION])

log.info("cube_demo.demo_info: data_today {}, seeded_on {}, shift_days {}, data_version {}",
        DATA_TODAY, today, shiftDays, DATA_VERSION)
