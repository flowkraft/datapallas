// @description Loads the cube_demo demo data (19 tables, 32,313 rows) used by the Cube Stories
// Bindings provided by SeedScriptRunner:
//   dbSql     — groovy.sql.Sql connected to the target database
//   vendor    — String (uppercase): POSTGRES, MYSQL, MARIADB, SQLSERVER, ORACLE, DB2, SUPABASE,
//                                   TIMESCALEDB, CLICKHOUSE, SQLITE, DUCKDB
//   log       — SLF4J Logger
//   params    — Map (unused here)
//   scriptDir — the folder this script was read from; its cube-demo-data/ subfolder holds the rows
//
// The rows live next to this script, one |-separated file per table, and are loaded as they are:
// this script never invents data, so every run gives the same answers, on every database.

import groovy.sql.Sql
import java.sql.Types
import java.time.LocalDate

// ── where the rows are ───────────────────────────────────────────────────────

if (!scriptDir) {
    throw new IllegalStateException("cube-demo-data.groovy needs its 'cube-demo-data' data folder, "
            + "which sits next to the script. The caller ran the script from text, so the script "
            + "cannot tell where it is. Run it from its file.")
}

File dataDir = new File(scriptDir, 'cube-demo-data')
if (!dataDir.isDirectory()) {
    throw new IllegalStateException("cube-demo-data.groovy found no data folder at "
            + dataDir.absolutePath + ". The 19 .psv files travel with the script; copy the "
            + "'cube-demo-data' folder next to it and run it again.")
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

def value = { String kind, String text ->
    if (text == null || text.isEmpty()) return null
    if (kind == 'INT') return Integer.valueOf(text)
    if (kind == 'DEC') return new BigDecimal(text)
    if (kind == 'DATE') return isSqlite ? text : java.sql.Date.valueOf(LocalDate.parse(text))
    return text
}

// ── load, table by table ─────────────────────────────────────────────────────

log.info("=== cube_demo demo data: loading 19 tables on {} from {} ===", v, dataDir.absolutePath)

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

    // A second run gives the same rows. Oracle 21 has no DROP TABLE IF EXISTS, and a table that
    // was never there is not an error anywhere.
    try {
        exec('DROP TABLE cube_demo.' + table)
    } catch (Exception e) {
        log.debug("cube_demo.{} was not there to drop: {}", table, e.message)
    }

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
            List<String> cells = line.split('\\|', -1) as List
            if (cells.size() != names.size()) {
                throw new IllegalStateException("cube-demo-data.groovy read a row of "
                        + cells.size() + " values in " + file.name + ", where the table has "
                        + names.size() + " columns: " + line)
            }
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
