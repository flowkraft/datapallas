package com.sourcekraft.documentburster.common.db.northwind;

import java.io.File;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.hibernate.boot.Metadata;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistry;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.hibernate.boot.spi.MetadataImplementor;
import org.hibernate.mapping.Column;
import org.hibernate.mapping.Table;

/**
 * Verifies that the DuckDB Northwind produced by {@link DuckDBDataWarehouseCreator} still agrees
 * with the JPA entities — the single source of truth every other vendor is generated from.
 *
 * WHY THIS EXISTS. DuckDBDataWarehouseCreator hand-writes its CREATE TABLE statements in Java. It
 * copies DATA from SQLite but never asks the entities what the SHAPE is, so the two drift silently
 * and nothing notices. That is not hypothetical: between 2025-07 and 2026-08 the entities gained
 * Category.Picture, Customer.Email, Employee.Mobile, Employee.Email and Supplier.Email, and the
 * DuckDB sample gained none of them. The Learn SQL lessons were written against the DuckDB file and
 * so taught column counts that were wrong on every other engine, for a year, with a green build.
 *
 *   mvn -q -pl bkend/common compile
 *   java -cp <bkend/common classpath> \
 *        com.sourcekraft.documentburster.common.db.northwind.DuckDBSchemaVerifier <path-to.duckdb>
 *
 * Exits 0 when the schemas agree, 1 when they do not, so it can gate a build.
 *
 * WHAT IT CHECKS, and what it deliberately does not:
 *   TABLES   — every entity table must exist. Star-schema tables (dim_*, fact_*, vw_*) are DuckDB's
 *              own and are ignored; they have no JPA counterpart by design.
 *   COLUMNS  — the column SET must match exactly, both directions.
 *   TYPES    — compared by FAMILY, not by spelling. "VARCHAR" and "character varying" are the same
 *              type wearing two names, and that difference is a lesson in Series 4, not a bug.
 *   ORDER    — NOT checked. JPA does not guarantee column order, so requiring a match would be
 *              requiring something neither side can promise.
 *   CONSTRAINTS — NOT checked, and must never be. The DuckDB sample declares no PK/FK ON PURPOSE:
 *              rebuilding Northwind's integrity layer IS the Data Modeling course. Adding them back
 *              would delete thirteen episodes. See courses/datamodeling/curriculum.yaml.
 */
public class DuckDBSchemaVerifier {

    /** The Northwind entities, i.e. the source of truth. */
    private static final Class<?>[] ENTITIES = {
        com.sourcekraft.documentburster.common.db.northwind.entities.Category.class,
        com.sourcekraft.documentburster.common.db.northwind.entities.Customer.class,
        com.sourcekraft.documentburster.common.db.northwind.entities.CustomerCustomerDemo.class,
        com.sourcekraft.documentburster.common.db.northwind.entities.CustomerDemographics.class,
        com.sourcekraft.documentburster.common.db.northwind.entities.Employee.class,
        com.sourcekraft.documentburster.common.db.northwind.entities.EmployeeTerritories.class,
        com.sourcekraft.documentburster.common.db.northwind.entities.Order.class,
        com.sourcekraft.documentburster.common.db.northwind.entities.OrderDetail.class,
        com.sourcekraft.documentburster.common.db.northwind.entities.Product.class,
        com.sourcekraft.documentburster.common.db.northwind.entities.Region.class,
        com.sourcekraft.documentburster.common.db.northwind.entities.Shipper.class,
        com.sourcekraft.documentburster.common.db.northwind.entities.Supplier.class,
        com.sourcekraft.documentburster.common.db.northwind.entities.Territory.class,
    };

    /** Star-schema objects DuckDB owns outright — no JPA counterpart, correctly absent. */
    private static final Set<String> DUCKDB_ONLY = Set.of(
        "dim_customer", "dim_employee", "dim_product", "dim_time",
        "fact_sales", "vw_sales_detail", "vw_monthly_sales");

    /**
     * Collapse a vendor's spelling to the family it belongs to. Two engines naming the same type
     * differently is expected; storing a different KIND of thing is the bug this looks for.
     */
    static String family(String sqlType) {
        String t = sqlType.toLowerCase(Locale.ROOT).trim();
        int paren = t.indexOf('(');
        String bare = paren > 0 ? t.substring(0, paren).trim() : t;
        if (bare.startsWith("varchar") || bare.startsWith("character varying")
                || bare.equals("text") || bare.equals("char") || bare.equals("character")
                || bare.equals("clob") || bare.equals("nvarchar")) return "text";
        if (bare.equals("decimal") || bare.equals("numeric")) return "decimal";
        if (bare.equals("float") || bare.equals("real") || bare.equals("double")
                || bare.equals("double precision")) return "float";
        if (bare.equals("integer") || bare.equals("int") || bare.equals("int4")
                || bare.equals("serial")) return "integer";
        if (bare.equals("smallint") || bare.equals("int2")) return "smallint";
        if (bare.equals("bigint") || bare.equals("int8")) return "bigint";
        if (bare.equals("boolean") || bare.equals("bool") || bare.equals("bit")) return "boolean";
        if (bare.equals("date")) return "date";
        if (bare.startsWith("timestamp") || bare.startsWith("datetime")) return "timestamp";
        if (bare.equals("blob") || bare.equals("bytea") || bare.equals("oid")
                || bare.equals("varbinary") || bare.equals("binary")) return "binary";
        return bare;
    }

    /**
     * The "(10,4)" / "(40)" part of a type, or "" when unsized. Only meaningful once two types are
     * already known to share a family — VARCHAR(40) vs VARCHAR is a size question, VARCHAR vs BLOB
     * is not.
     */
    static String sizeOf(String sqlType) {
        String t = sqlType.toLowerCase(Locale.ROOT).trim();
        int open = t.indexOf('('), close = t.lastIndexOf(')');
        return (open > 0 && close > open) ? t.substring(open, close + 1).replace(" ", "") : "";
    }

    /** table -> (column -> sql type), as the JPA entities define it. */
    private static Map<String, Map<String, String>> fromEntities() {
        StandardServiceRegistry reg = new StandardServiceRegistryBuilder()
                .applySetting("hibernate.dialect", "org.hibernate.dialect.PostgreSQLDialect")
                .applySetting("hibernate.boot.allow_jdbc_metadata_access", "false")
                .build();
        try {
            MetadataSources ms = new MetadataSources(reg);
            for (Class<?> c : ENTITIES) ms.addAnnotatedClass(c);
            Metadata md = ms.buildMetadata();
            MetadataImplementor mdi = (MetadataImplementor) md;
            Map<String, Map<String, String>> out = new LinkedHashMap<>();
            for (Table t : mdi.getDatabase().getDefaultNamespace().getTables()) {
                Map<String, String> cols = new LinkedHashMap<>();
                for (Column c : t.getColumns()) cols.put(unquote(c.getName()), c.getSqlType(md));
                out.put(unquote(t.getName()), cols);
            }
            return out;
        } finally {
            StandardServiceRegistryBuilder.destroy(reg);
        }
    }

    /** table -> (column -> sql type), as the generated DuckDB file actually is. */
    private static Map<String, Map<String, String>> fromDuckDb(String path) throws Exception {
        Class.forName("org.duckdb.DuckDBDriver");
        Map<String, Map<String, String>> out = new LinkedHashMap<>();
        try (Connection c = DriverManager.getConnection("jdbc:duckdb:" + path);
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery(
                 "SELECT table_name, column_name, data_type FROM information_schema.columns"
               + " WHERE table_schema = 'main' ORDER BY table_name, ordinal_position")) {
            while (rs.next()) {
                out.computeIfAbsent(unquote(rs.getString(1)), k -> new LinkedHashMap<>())
                   .put(unquote(rs.getString(2)), rs.getString(3));
            }
        }
        return out;
    }

    private static String unquote(String s) { return s == null ? null : s.replace("\"", ""); }

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.err.println("usage: DuckDBSchemaVerifier <path-to-northwind.duckdb>");
            System.exit(2);
        }
        File f = new File(args[0]);
        if (!f.isFile()) {
            System.err.println("not a file: " + f.getAbsolutePath());
            System.exit(2);
        }

        List<String> problems = verify(f.getAbsolutePath(), true);
        System.out.println();
        List<String> sizes = lastPrecisionNotes();
        if (!sizes.isEmpty()) {
            System.out.println("NOTES — same type family, different size. Not failures, but a real");
            System.out.println("divergence from the entities, and one a data-types lesson would expose:");
            for (String n : sizes) System.out.println("  - " + n);
            System.out.println();
        }
        if (problems.isEmpty()) {
            System.out.println("PASS — the DuckDB sample agrees with the JPA entities.");
            System.exit(0);
        }
        System.out.println("FAIL — " + problems.size() + " problem(s):");
        for (String p : problems) System.out.println("  - " + p);
        System.out.println();
        System.out.println("Fix DuckDBDataWarehouseCreator (DDL + the matching SELECT/INSERT/arity),");
        System.out.println("re-run it, then re-run this verifier.");
        System.exit(1);
    }

    /**
     * Precision/scale differences found alongside the last {@link #verify} run — e.g. DuckDB holding
     * UnitPrice as DECIMAL(10,4) where the entities say numeric(19,4). These are NOT returned as
     * problems: both are decimals, every Northwind price fits in either, and failing a build over it
     * would be noise. They are still a real divergence from the source of truth, and the kind that
     * makes a "what type is this column?" lesson answer differently per engine — so they are surfaced
     * rather than swallowed.
     */
    private static final List<String> precisionNotes = new ArrayList<>();

    /** Precision/scale differences from the most recent {@link #verify} call. */
    public static List<String> lastPrecisionNotes() { return new ArrayList<>(precisionNotes); }

    /**
     * Compare the file at {@code duckdbPath} against the JPA entities and return every disagreement,
     * empty when they match. This is the entry point {@link DuckDBDataWarehouseCreator} calls on
     * itself so that no generated file escapes unverified; {@link #main} is the same check run by
     * hand. Pass {@code print=true} for the per-table table on stdout.
     */
    public static List<String> verify(String duckdbPath, boolean print) throws Exception {
        precisionNotes.clear();
        Map<String, Map<String, String>> jpa = fromEntities();
        Map<String, Map<String, String>> duck = fromDuckDb(duckdbPath);
        List<String> problems = new ArrayList<>();

        Set<String> jpaTables  = new TreeSet<>(jpa.keySet());
        Set<String> duckTables = new TreeSet<>(duck.keySet());
        duckTables.removeIf(DUCKDB_ONLY::contains);

        for (String t : jpaTables)
            if (!duckTables.contains(t)) problems.add("TABLE MISSING in DuckDB: " + t);
        for (String t : duckTables)
            if (!jpaTables.contains(t))
                problems.add("TABLE in DuckDB with no entity: " + t
                           + "  (if it is a star-schema object, add it to DUCKDB_ONLY)");

        if (print) {
            System.out.printf("%-24s %6s %6s   %s%n", "table", "jpa", "duck", "verdict");
            System.out.println("-".repeat(78));
        }
        for (String t : jpaTables) {
            Map<String, String> jc = jpa.get(t);
            Map<String, String> dc = duck.getOrDefault(t, Map.of());
            Set<String> missing = new LinkedHashSet<>(jc.keySet()); missing.removeAll(dc.keySet());
            Set<String> extra   = new LinkedHashSet<>(dc.keySet()); extra.removeAll(jc.keySet());
            List<String> typeDiffs = new ArrayList<>();
            for (Map.Entry<String, String> e : jc.entrySet()) {
                String d = dc.get(e.getKey());
                if (d == null) continue;
                if (!family(e.getValue()).equals(family(d)))
                    typeDiffs.add(e.getKey() + ": jpa=" + e.getValue() + " duck=" + d);
                else {
                    // Only when BOTH sides state a size. DuckDB does not declare VARCHAR lengths at
                    // all — its VARCHAR is unbounded and length is not enforced — so "varchar(40) vs
                    // VARCHAR" is how the engine works, not a divergence, and reporting it buries the
                    // handful that matter under sixty that do not.
                    String js = sizeOf(e.getValue()), ds = sizeOf(d);
                    if (!js.isEmpty() && !ds.isEmpty() && !js.equals(ds))
                        precisionNotes.add(t + "." + e.getKey() + ": same family, different size — jpa="
                                         + e.getValue() + " duck=" + d);
                }
            }
            String verdict = missing.isEmpty() && extra.isEmpty() && typeDiffs.isEmpty() ? "ok" : "MISMATCH";
            if (print) System.out.printf("%-24s %6d %6d   %s%n", t, jc.size(), dc.size(), verdict);
            if (!missing.isEmpty())  problems.add(t + ": columns missing in DuckDB: " + missing);
            if (!extra.isEmpty())    problems.add(t + ": columns in DuckDB with no entity field: " + extra);
            for (String td : typeDiffs) problems.add(t + "." + td);
        }

        return problems;
    }
}
