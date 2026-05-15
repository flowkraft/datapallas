package com.sourcekraft.documentburster._helpers;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.Statement;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import groovy.sql.Sql;

/**
 * Test utilities for multi-database scenarios. Provides a SECONDARY in-memory
 * H2 instance (distinct from {@link NorthwindTestUtils}) holding a small
 * customer_segments table that complements Northwind CustomerIDs.
 *
 * Used by tests proving the ctx.getConnection(code) API works for cross-DB
 * merges in Groovy scripts.
 */
public final class MultiDbTestUtils {

    private static final Logger log = LoggerFactory.getLogger(MultiDbTestUtils.class);

    public static final String H2_SECONDARY_URL = "jdbc:h2:mem:customer_meta_test;DB_CLOSE_DELAY=-1;DATABASE_TO_UPPER=FALSE;MODE=LEGACY";
    public static final String H2_SECONDARY_USER = "sa";
    public static final String H2_SECONDARY_PASS = "";
    public static final String SECONDARY_CONN_CODE = "customer-meta-h2";
    public static final String H2_DRIVER = "org.h2.Driver";

    private MultiDbTestUtils() {}

    /**
     * Creates the customer_segments table and seeds it with rows mapping
     * Northwind CustomerIDs to segments + churn risk values.
     */
    public static void setupSecondaryCustomerMetaDb() throws Exception {
        log.info("Setting up secondary customer_meta H2 database...");
        Class.forName(H2_DRIVER);
        try (Connection conn = DriverManager.getConnection(H2_SECONDARY_URL, H2_SECONDARY_USER, H2_SECONDARY_PASS);
             Statement st = conn.createStatement()) {
            st.executeUpdate("DROP TABLE IF EXISTS customer_segments");
            st.executeUpdate(
                "CREATE TABLE customer_segments (" +
                "  customer_id VARCHAR(5) PRIMARY KEY," +
                "  segment VARCHAR(20)," +
                "  churn_risk DECIMAL(3,2)" +
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
        log.info("Secondary customer_meta H2 setup complete (10 rows seeded).");
    }

    private static void seed(PreparedStatement ps, String custId, String segment, BigDecimal risk) throws Exception {
        ps.setString(1, custId);
        ps.setString(2, segment);
        ps.setBigDecimal(3, risk);
        ps.executeUpdate();
    }

    /**
     * Opens a Groovy {@link Sql} instance against the secondary H2. The test
     * fixture pre-populates ctx.namedDbSql with this instance so the script's
     * ctx.getConnection(SECONDARY_CONN_CODE) returns it without hitting the
     * dbManager file-loading path (which would require a real connection
     * XML file on disk).
     */
    public static Sql openSecondarySqlForTest() throws Exception {
        return Sql.newInstance(H2_SECONDARY_URL, H2_SECONDARY_USER, H2_SECONDARY_PASS, H2_DRIVER);
    }
}
