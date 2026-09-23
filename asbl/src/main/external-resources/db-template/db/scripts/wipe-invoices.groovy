// @description Drops all seed_inv_* tables from the target database (convention-based — survives schema evolution)
// Bindings provided by GenericSeedExecutor:
//   dbSql  — groovy.sql.Sql connected to the target database
//   vendor — String (uppercase): POSTGRES, MYSQL, MARIADB, SQLSERVER, ORACLE, DB2, SUPABASE,
//                                CLICKHOUSE, SQLITE, DUCKDB
//   log    — SLF4J Logger
//   params — Map (unused by this template)

log.info("=== Wipe Seeded Invoice Data: Starting for {} ===", vendor)

boolean isClickHouse    = (vendor == 'CLICKHOUSE')
boolean isMysqlFamily   = (vendor in ['MYSQL', 'MARIADB'])
boolean isPostgresFamily = (vendor in ['POSTGRES', 'SUPABASE', 'POSTGRESQL'])
boolean isSqlServer     = (vendor == 'SQLSERVER')
boolean isOracle        = (vendor == 'ORACLE')
boolean isDb2           = (vendor in ['DB2', 'IBMDB2'])
boolean isSqlite        = (vendor == 'SQLITE')

// ── 1. Discover existing seed_inv_* tables (vendor-specific catalog) ──────────
// The seeder creates these parent-first (customer, product, invoice, invoice_line), so the
// only safe drop order is its exact reverse. The catalog queries below sort by name purely
// for stable logs: DROP_ORDER, not the catalog, decides the order the drops run in.
// Alphabetical DESC was NOT that order — it puts seed_inv_product, a PARENT of
// seed_inv_invoice_line via fk_sinv_line_prod, first. Vendors that bypass FKs while dropping
// (MySQL FOREIGN_KEY_CHECKS=0, Postgres/Oracle CASCADE) never noticed; SQL Server has neither
// — T-SQL has no DROP ... CASCADE and NOCHECK CONSTRAINT does not apply to DDL — so it
// rejected the first drop with Msg 3726 and silently left the table behind.
final List<String> DROP_ORDER = [
    'seed_inv_invoice_line', 'seed_inv_invoice', 'seed_inv_product', 'seed_inv_customer',
]

// Unknown seed_inv_* tables sort to the front (indexOf returns -1): a table this script has
// not been taught about can only be a child of the canonical four, never a parent of them.
// toLowerCase() because Oracle returns its catalog names as SEED_INV_*.
def childFirst = { List<String> ts -> ts.sort { DROP_ORDER.indexOf(it.toLowerCase()) } }

def discover = { ->

List<String> tables = []

try {
    if (isOracle) {
        dbSql.eachRow("SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME LIKE 'SEED_INV_%' ORDER BY TABLE_NAME DESC") { row ->
            tables << row.TABLE_NAME
        }
    } else if (isSqlServer) {
        dbSql.eachRow("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' AND TABLE_NAME LIKE 'seed_inv_%' ORDER BY TABLE_NAME DESC") { row ->
            tables << row.TABLE_NAME
        }
    } else if (isClickHouse) {
        dbSql.eachRow("SELECT name FROM system.tables WHERE name LIKE 'seed_inv_%' ORDER BY name DESC") { row ->
            tables << row.name
        }
    } else if (isSqlite) {
        // SQLite has no INFORMATION_SCHEMA — use sqlite_master
        dbSql.eachRow("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'seed_inv_%' ORDER BY name DESC") { row ->
            tables << row.name
        }
    } else {
        // PostgreSQL, MySQL, MariaDB, DB2, DuckDB, Supabase
        dbSql.eachRow("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'seed_inv_%' ORDER BY TABLE_NAME DESC") { row ->
            tables << (row.TABLE_NAME ?: row.table_name)
        }
    }
} catch (Exception e) {
    log.warn("Could not query catalog for {} ({}). Falling back to fixed table list.", vendor, e.getMessage())
    // Fall back to the canonical four tables in child-first order
    tables = new ArrayList<String>(DROP_ORDER)
}

    return tables
}

List<String> tables = childFirst(discover())

if (tables.isEmpty()) {
    log.info("No seed_inv_* tables found — nothing to wipe.")
    return
}

log.info("Tables to drop: {}", tables)

// ── 2. Disable FK constraints, drop tables, re-enable ────────────────────────

def safeDdl = { String sql ->
    try { dbSql.execute(sql) }
    catch (Exception e) { log.debug("DDL skipped: {}", e.getMessage()) }
}

def doDrop = {
    if (isMysqlFamily) {
        dbSql.execute("SET FOREIGN_KEY_CHECKS = 0")
        tables.each { t -> safeDdl("DROP TABLE IF EXISTS ${t}".toString()) }
        dbSql.execute("SET FOREIGN_KEY_CHECKS = 1")
    } else if (isPostgresFamily) {
        tables.each { t -> safeDdl("DROP TABLE IF EXISTS ${t} CASCADE".toString()) }
    } else if (isSqlServer) {
        tables.each { t ->
            safeDdl("IF OBJECT_ID('${t}','U') IS NOT NULL DROP TABLE ${t}".toString())
        }
    } else if (isOracle) {
        tables.each { t ->
            safeDdl("DROP TABLE ${t} CASCADE CONSTRAINTS PURGE".toString())
        }
    } else if (isClickHouse) {
        tables.each { t -> safeDdl("DROP TABLE IF EXISTS ${t}".toString()) }
    } else {
        // DB2, SQLite, DuckDB, and fallback
        tables.each { t -> safeDdl("DROP TABLE IF EXISTS ${t}".toString()) }
    }
}

// DROP TABLE is DDL on every vendor (Oracle / MySQL / MariaDB / SQL Server / DB2 /
// PostgreSQL / SQLite / DuckDB / ClickHouse) — it auto-commits and cannot participate
// in a rollback. Wrapping it in dbSql.withTransaction would be misleading dressing,
// so we just run the drops directly. Each individual DROP is wrapped in safeDdl to
// tolerate "table doesn't exist" / FK-blocked / locked-by-other-session conditions.
int intended = tables.size()
doDrop()

// Verify instead of assuming. safeDdl swallows an FK-blocked DROP into debug, so reporting
// tables.size() here reported INTENT, not fact: a partial wipe logged as a clean success.
// Re-query, and if anything survived, drop once more — by then every survivor has lost its
// dependents, so a second pass clears any dependency this script has not been taught.
List<String> remaining = childFirst(discover())
if (!remaining.isEmpty()) {
    tables = remaining
    doDrop()
    remaining = discover()
}

if (remaining.isEmpty()) {
    log.info("=== Wipe Seeded Invoice Data: COMPLETED — dropped {} table(s) for vendor {} ===", intended, vendor)
} else {
    // Loud on purpose: this path leaves the database dirty, and the old code reported it as
    // a success. Kept OFF the safeDdl path, which swallows the routine "table does not exist"
    // that Oracle's bare DROP throws on every clean wipe.
    log.warn("=== Wipe Seeded Invoice Data: INCOMPLETE for {} — {} of {} table(s) survived: {} ===",
             vendor, remaining.size(), intended, remaining)
}
