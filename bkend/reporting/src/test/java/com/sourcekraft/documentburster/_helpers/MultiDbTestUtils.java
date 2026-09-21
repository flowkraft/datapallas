package com.sourcekraft.documentburster._helpers;

import java.io.File;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.Statement;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import groovy.sql.Sql;

/**
 * Test utilities for multi-database scenarios. Provides a SECONDARY database
 * (distinct from {@link NorthwindTestUtils}) holding a small customer_segments
 * table that complements Northwind CustomerIDs.
 *
 * Used by tests proving the ctx.getConnection(code) API works for cross-DB
 * merges in Groovy scripts.
 *
 * WHY SQLITE AND NOT A SECOND DUCKDB. The point of this helper is that the two
 * connections are genuinely different databases - if both were DuckDB, a test
 * that accidentally read the segments out of Northwind would still pass. SQLite
 * is a different engine with a different driver and different type affinity, so
 * a cross-wired connection fails loudly. Its driver is already a compile-scope
 * dependency and ships in lib/burst, so this costs the build nothing.
 *
 * FILE-BASED, NOT IN-MEMORY. SQLite's :memory: database is private to a single
 * connection, exactly as DuckDB's is. The seeding connection and the Groovy Sql
 * instance the script uses are two different connections, so the data has to
 * live in a file for the second one to see it. It goes under target/ so that
 * mvn clean disposes of it.
 */
public final class MultiDbTestUtils {

    private static final Logger log = LoggerFactory.getLogger(MultiDbTestUtils.class);

    private static final String SECONDARY_DB_DIR = "./target/test-customer-meta";
    private static final String SECONDARY_DB_PATH = SECONDARY_DB_DIR + "/customer_meta.sqlite";

    public static final String SECONDARY_URL = "jdbc:sqlite:" + SECONDARY_DB_PATH;

    /** SQLite is embedded and has no authentication; these exist so the JDBC-shaped APIs have something to pass. */
    public static final String SECONDARY_USER = "";
    public static final String SECONDARY_PASS = "";

    public static final String SECONDARY_CONN_CODE = "customer-meta-sqlite";
    public static final String SECONDARY_DRIVER = "org.sqlite.JDBC";

    private MultiDbTestUtils() {}

    /**
     * Creates the customer_segments table and seeds it with rows mapping
     * Northwind CustomerIDs to segments + churn risk values.
     */
    public static void setupSecondaryCustomerMetaDb() throws Exception {
        log.info("Setting up the secondary customer_meta SQLite database at {} ...", SECONDARY_DB_PATH);
        new File(SECONDARY_DB_DIR).mkdirs();
        Class.forName(SECONDARY_DRIVER);
        try (Connection conn = DriverManager.getConnection(SECONDARY_URL, SECONDARY_USER, SECONDARY_PASS);
             Statement st = conn.createStatement()) {
            st.executeUpdate("DROP TABLE IF EXISTS customer_segments");
            st.executeUpdate(
                "CREATE TABLE customer_segments (" +
                "  customer_id TEXT PRIMARY KEY," +
                "  segment TEXT," +
                "  churn_risk NUMERIC" +
                ")");
            try (PreparedStatement ins = conn.prepareStatement(
                    "INSERT INTO customer_segments (customer_id, segment, churn_risk) VALUES (?, ?, ?)")) {
                seed(ins, "ALFKI", "midmarket", new BigDecimal("0.15"));
                seed(ins, "ANATR", "longtail",  new BigDecimal("0.62"));
                seed(ins, "ANTON", "whale",     new BigDecimal("0.05"));
                seed(ins, "AROUT", "midmarket", new BigDecimal("0.28"));
                seed(ins, "BERGS", "longtail",  new BigDecimal("0.71"));
                seed(ins, "BLAUS", "midmarket", new BigDecimal("0.42"));
                seed(ins, "BLONP", "whale",     new BigDecimal("0.08"));
                seed(ins, "BOLID", "midmarket", new BigDecimal("0.35"));
                seed(ins, "BONAP", "longtail",  new BigDecimal("0.55"));
                seed(ins, "BOTTM", "whale",     new BigDecimal("0.12"));
            }
        }
        log.info("Secondary customer_meta SQLite setup complete (10 rows seeded).");
    }

    private static void seed(PreparedStatement ps, String custId, String segment, BigDecimal risk) throws Exception {
        ps.setString(1, custId);
        ps.setString(2, segment);
        ps.setBigDecimal(3, risk);
        ps.executeUpdate();
    }

    /**
     * Opens a Groovy {@link Sql} instance against the secondary database. The
     * test fixture pre-populates ctx.namedDbSql with this instance so the
     * script's ctx.getConnection(SECONDARY_CONN_CODE) returns it without
     * hitting the dbManager file-loading path (which would require a real
     * connection XML file on disk).
     */
    public static Sql openSecondarySqlForTest() throws Exception {
        return Sql.newInstance(SECONDARY_URL, SECONDARY_USER, SECONDARY_PASS, SECONDARY_DRIVER);
    }
}
