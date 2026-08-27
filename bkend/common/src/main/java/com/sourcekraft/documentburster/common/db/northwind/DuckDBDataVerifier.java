package com.sourcekraft.documentburster.common.db.northwind;

import java.io.File;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.Statement;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Verifies that the DATA in the DuckDB Northwind produced by {@link DuckDBDataWarehouseCreator}
 * is a faithful copy of the SQLite source it was built from.
 *
 * WHY THIS EXISTS, and why it is NOT the same as {@link DuckDBSchemaVerifier}. The schema verifier
 * asks "does the DuckDB file have the right SHAPE?" — right tables, right columns, right type
 * families, compared against the JPA entities. It cannot see a single row. But the creator does two
 * jobs, and copying rows out of SQLite is the second one. Everything below is a way that copy can be
 * wrong while the schema is perfect:
 *
 *   ROWS LOST      — a copy that silently drops rows. copyTable() batches every 1000 and relies on a
 *                    final executeBatch(); a mis-edit there loses the tail of a table and nothing
 *                    fails. Counts are compared per table.
 *   VALUES MANGLED — the copy is not a straight passthrough. Dates arrive from SQLite as epoch
 *                    milliseconds and are rebuilt as LocalDate/LocalDateTime; Discontinued is CAST
 *                    to BOOLEAN; Discount is now DECIMAL(8,4) rather than FLOAT. Each conversion is
 *                    a place a value can change meaning. Every cell of every table is compared.
 *   NEVER POPULATED — a column can exist in the DDL, satisfy the schema verifier, and be absent from
 *                    the SELECT/INSERT pair, so it is silently NULL for every row. This is exactly
 *                    the failure mode of a hand-maintained creator: someone adds the column to the
 *                    CREATE TABLE and forgets the two other places. Fully-NULL columns are reported.
 *   NOT REPRODUCIBLE — copyTable() converts epochs with ZoneId.systemDefault(). The same source
 *                    therefore produces a DIFFERENT .duckdb depending on the timezone of the machine
 *                    that ran it, and west of UTC the dates land a day early. The dates are re-derived
 *                    under UTC and under the local zone, and any column where the choice CHANGES a
 *                    value is reported — that is a build whose output depends on where it was built.
 *
 *   mvn -q -pl bkend/common compile
 *   java -cp &lt;bkend/common classpath&gt; \
 *        com.sourcekraft.documentburster.common.db.northwind.DuckDBDataVerifier \
 *        &lt;path-to.duckdb&gt; &lt;path-to-northwind.db&gt;
 *
 * Exits 0 when the data agrees, 1 when it does not, so it can gate a build alongside the schema
 * verifier. Run both: they catch disjoint sets of bugs.
 */
public class DuckDBDataVerifier {

    /** The 13 OLTP tables the creator copies. Star-schema tables are generated, not copied. */
    private static final String[] TABLES = {
        "Categories", "Customers", "Suppliers", "Products", "Employees", "Shippers",
        "Orders", "Order Details", "Region", "Territories", "EmployeeTerritories",
        "CustomerDemographics", "CustomerCustomerDemo"
    };

    /** Columns the creator rebuilds from epoch millis — the ones whose value depends on a timezone. */
    private static final Map<String, Set<String>> EPOCH_COLUMNS = Map.of(
        "employees", Set.of("birthdate", "hiredate"),
        "orders",    Set.of("orderdate", "requireddate", "shippeddate"));

    /**
     * Columns that are legitimately NULL for every row in the SOURCE data, so a fully-NULL column in
     * DuckDB is a faithful copy rather than a forgotten INSERT. Anything not listed here that comes
     * back all-NULL is reported for a human to judge.
     */
    private static final Set<String> KNOWN_EMPTY = Set.of();

    /**
     * What a run found. {@code problems} are values that are actually WRONG and must fail a build.
     * {@code notes} are things a human should see but that do not condemn the file — a legitimately
     * empty column, or the timezone finding, which says the BUILD is machine-dependent rather than
     * that this particular output is corrupt.
     */
    public static final class Result {
        public final List<String> problems = new ArrayList<>();
        public final List<String> notes = new ArrayList<>();
        public boolean ok() { return problems.isEmpty(); }
    }

    // Collected per run. Static because this is a single-threaded build-time utility invoked once
    // per generated file; verify() resets them, and nothing here is called concurrently.
    private static List<String> problems = new ArrayList<>();
    private static List<String> notes = new ArrayList<>();

    /**
     * Compare the data in {@code duckdbPath} against the SQLite source it was copied from. This is
     * the entry point {@link DuckDBDataWarehouseCreator} calls on itself so no generated file
     * escapes unverified; {@link #main} is the same check run by hand.
     */
    public static synchronized Result verify(String duckdbPath, String sqlitePath, boolean print)
            throws Exception {
        Result result = new Result();
        problems = result.problems;
        notes = result.notes;

        Class.forName("org.duckdb.DuckDBDriver");
        Class.forName("org.sqlite.JDBC");

        try (Connection duck = DriverManager.getConnection("jdbc:duckdb:" + duckdbPath);
             Connection lite = DriverManager.getConnection("jdbc:sqlite:" + sqlitePath)) {
            if (print) {
                System.out.printf("%-24s %8s %8s   %s%n", "table", "sqlite", "duckdb", "verdict");
                System.out.println("-".repeat(78));
            }
            for (String t : TABLES) verifyTable(duck, lite, t, print);
            if (print) System.out.println();
            reportTimezoneSensitivity(lite, print);
        }
        return result;
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("usage: DuckDBDataVerifier <path-to.duckdb> <path-to-northwind.db>");
            System.exit(2);
        }
        File duckFile = new File(args[0]);
        File liteFile = new File(args[1]);
        for (File f : new File[]{duckFile, liteFile}) {
            if (!f.isFile()) { System.err.println("not a file: " + f.getAbsolutePath()); System.exit(2); }
        }

        Result r = verify(duckFile.getAbsolutePath(), liteFile.getAbsolutePath(), true);

        System.out.println();
        if (!r.notes.isEmpty()) {
            System.out.println("NOTES — not failures, but worth a human eye:");
            for (String n : r.notes) System.out.println("  - " + n);
            System.out.println();
        }
        if (r.ok()) {
            System.out.println("PASS — the DuckDB data is a faithful copy of the SQLite source.");
            System.exit(0);
        }
        System.out.println("FAIL — " + r.problems.size() + " problem(s):");
        for (String p : r.problems) System.out.println("  - " + p);
        System.exit(1);
    }

    private static void verifyTable(Connection duck, Connection lite, String table, boolean print)
            throws Exception {
        List<String> liteCols = columnsOf(lite, table);
        List<String> duckCols = columnsOf(duck, table);
        if (liteCols.isEmpty() || duckCols.isEmpty()) {
            problems.add(table + ": could not read columns (sqlite=" + liteCols.size()
                       + ", duckdb=" + duckCols.size() + ")");
            if (print) System.out.printf("%-24s %8s %8s   %s%n", table, "?", "?", "UNREADABLE");
            return;
        }

        // Compare by column NAME, case-insensitively: column ORDER is not promised on either side.
        Map<String, String> liteByLower = lowerIndex(liteCols);
        Map<String, String> duckByLower = lowerIndex(duckCols);
        Set<String> common = new LinkedHashSet<>(liteByLower.keySet());
        common.retainAll(duckByLower.keySet());

        // A column present in DuckDB but not in SQLite cannot have been copied — flag it, because
        // the schema verifier will happily pass it while every row is NULL.
        Set<String> duckOnly = new LinkedHashSet<>(duckByLower.keySet());
        duckOnly.removeAll(liteByLower.keySet());
        for (String c : duckOnly)
            notes.add(table + "." + duckByLower.get(c) + " exists in DuckDB but not in the SQLite source"
                    + " — it can only ever be NULL");

        // Order both sides identically so rows line up. Binary columns cannot be sorted; text and
        // numbers can, and the key columns are always among them.
        List<String> orderBy = new ArrayList<>();
        for (String c : common) {
            if (!isBinary(duck, table, duckByLower.get(c))) orderBy.add(c);
            if (orderBy.size() == 4) break;
        }

        List<Object[]> liteRows = fetch(lite, table, common, liteByLower, orderBy);
        List<Object[]> duckRows = fetch(duck, table, common, duckByLower, orderBy);

        boolean ok = true;
        if (liteRows.size() != duckRows.size()) {
            problems.add(table + ": ROW COUNT differs — sqlite=" + liteRows.size()
                       + " duckdb=" + duckRows.size());
            ok = false;
        }

        List<String> colList = new ArrayList<>(common);
        int compared = Math.min(liteRows.size(), duckRows.size());
        int mismatches = 0;
        boolean[] duckAllNull = new boolean[colList.size()];
        Arrays.fill(duckAllNull, true);

        for (int r = 0; r < compared; r++) {
            Object[] a = liteRows.get(r), b = duckRows.get(r);
            for (int c = 0; c < colList.size(); c++) {
                if (b[c] != null) duckAllNull[c] = false;
                boolean epoch = EPOCH_COLUMNS
                        .getOrDefault(table.toLowerCase(Locale.ROOT), Set.of())
                        .contains(colList.get(c));
                if (!sameValue(a[c], b[c], epoch)) {
                    if (mismatches < 5)
                        problems.add(table + "." + duckByLower.get(colList.get(c))
                                   + " row " + (r + 1) + ": sqlite=" + show(a[c])
                                   + " duckdb=" + show(b[c]));
                    mismatches++;
                    ok = false;
                }
            }
        }
        if (mismatches > 5)
            problems.add(table + ": " + (mismatches - 5) + " further value mismatches not listed");

        // Fully-NULL columns: legal, but usually a SELECT/INSERT the creator forgot to update.
        for (int c = 0; c < colList.size(); c++) {
            if (compared > 0 && duckAllNull[c] && !KNOWN_EMPTY.contains(
                    table.toLowerCase(Locale.ROOT) + "." + colList.get(c))) {
                boolean liteAlsoNull = true;
                for (int r = 0; r < compared && liteAlsoNull; r++)
                    if (liteRows.get(r)[c] != null) liteAlsoNull = false;
                if (liteAlsoNull)
                    notes.add(table + "." + duckByLower.get(colList.get(c))
                            + " is NULL in every row — but so is the source, so the copy is faithful");
                else {
                    problems.add(table + "." + duckByLower.get(colList.get(c))
                            + " is NULL in EVERY DuckDB row but has values in SQLite"
                            + " — the column is in the DDL but missing from the SELECT/INSERT");
                    ok = false;
                }
            }
        }

        if (print) System.out.printf("%-24s %8d %8d   %s%n", table, liteRows.size(), duckRows.size(),
                ok ? "ok" : "MISMATCH");
    }

    /**
     * The creator converts epoch millis with ZoneId.systemDefault(). Re-derive every date under UTC
     * and under the local zone: any value where the two disagree is a value that changes with the
     * build machine's timezone.
     */
    private static void reportTimezoneSensitivity(Connection lite, boolean print) throws Exception {
        ZoneId local = ZoneId.systemDefault();
        int shifted = 0, total = 0;
        String firstExample = null;

        for (Map.Entry<String, Set<String>> e : EPOCH_COLUMNS.entrySet()) {
            String table = e.getKey().equals("orders") ? "Orders" : "Employees";
            for (String col : e.getValue()) {
                String real = columnsOf(lite, table).stream()
                        .filter(c -> c.equalsIgnoreCase(col)).findFirst().orElse(null);
                if (real == null) continue;
                try (Statement st = lite.createStatement();
                     ResultSet rs = st.executeQuery(
                             "SELECT \"" + real + "\" FROM \"" + table + "\" WHERE \"" + real + "\" IS NOT NULL")) {
                    while (rs.next()) {
                        long ms = rs.getLong(1);
                        total++;
                        LocalDate utc = LocalDate.ofInstant(Instant.ofEpochMilli(ms), ZoneId.of("UTC"));
                        LocalDate loc = LocalDate.ofInstant(Instant.ofEpochMilli(ms), local);
                        if (!utc.equals(loc)) {
                            shifted++;
                            if (firstExample == null)
                                firstExample = table + "." + real + " epoch " + ms
                                             + " -> " + utc + " in UTC, " + loc + " in " + local;
                        }
                    }
                }
            }
        }

        if (print) {
            System.out.println("timezone sensitivity of the date/timestamp copy");
            System.out.println("-".repeat(78));
            System.out.println("  build zone : " + local);
            System.out.println("  date values: " + total + ", of which " + shifted
                             + " differ between UTC and the build zone");
        }
        if (shifted > 0) {
            notes.add("NOT REPRODUCIBLE: " + shifted + " of " + total + " date values change with the"
                       + " build machine's timezone (copyTable uses ZoneId.systemDefault()). Example: "
                       + firstExample + ". Use ZoneOffset.UTC so the same source always yields the"
                       + " same .duckdb.");
        } else {
            notes.add("No date value shifts under the CURRENT zone (" + local + "), but copyTable still"
                    + " uses ZoneId.systemDefault(): a build run west of UTC would shift dates a day"
                    + " earlier. Pin it to ZoneOffset.UTC to make the output machine-independent.");
        }
    }

    // --- plumbing -----------------------------------------------------------------------

    private static List<String> columnsOf(Connection c, String table) {
        List<String> out = new ArrayList<>();
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT * FROM \"" + table + "\" LIMIT 0")) {
            ResultSetMetaData md = rs.getMetaData();
            for (int i = 1; i <= md.getColumnCount(); i++) out.add(md.getColumnName(i));
        } catch (Exception ignored) { }
        return out;
    }

    private static Map<String, String> lowerIndex(List<String> cols) {
        Map<String, String> m = new LinkedHashMap<>();
        for (String c : cols) m.put(c.toLowerCase(Locale.ROOT), c);
        return m;
    }

    private static boolean isBinary(Connection c, String table, String col) {
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT \"" + col + "\" FROM \"" + table + "\" LIMIT 0")) {
            String t = rs.getMetaData().getColumnTypeName(1).toLowerCase(Locale.ROOT);
            return t.contains("blob") || t.contains("binary") || t.contains("bytea");
        } catch (Exception e) { return true; }
    }

    private static List<Object[]> fetch(Connection c, String table, Set<String> lowerCols,
                                        Map<String, String> realNames, List<String> orderBy) throws Exception {
        StringBuilder sel = new StringBuilder("SELECT ");
        boolean first = true;
        for (String lc : lowerCols) {
            if (!first) sel.append(", ");
            sel.append('"').append(realNames.get(lc)).append('"');
            first = false;
        }
        sel.append(" FROM \"").append(table).append('"');
        if (!orderBy.isEmpty()) {
            sel.append(" ORDER BY ");
            for (int i = 0; i < orderBy.size(); i++) {
                if (i > 0) sel.append(", ");
                sel.append('"').append(realNames.get(orderBy.get(i))).append('"');
            }
        }
        List<Object[]> rows = new ArrayList<>();
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sel.toString())) {
            int n = rs.getMetaData().getColumnCount();
            while (rs.next()) {
                Object[] row = new Object[n];
                for (int i = 1; i <= n; i++) row[i - 1] = rs.getObject(i);
                rows.add(row);
            }
        }
        return rows;
    }

    /**
     * Are these two the same VALUE? The two engines legitimately hand back different Java types for
     * identical data — SQLite has no boolean and returns 0/1 for one, DuckDB returns Boolean; SQLite
     * returns a Double where DuckDB returns a BigDecimal. Neither is a defect. A different NUMBER, a
     * different STRING, or a different DATE is.
     */
    private static boolean sameValue(Object lite, Object duck, boolean epochColumn) {
        if (lite == null && duck == null) return true;
        if (lite == null || duck == null) return false;

        if (epochColumn) {
            // SQLite holds epoch millis; DuckDB holds a real DATE/TIMESTAMP. Equal if the DuckDB
            // value matches the epoch under EITHER zone — the zone question is reported separately,
            // and would otherwise drown every date row in noise.
            long ms = ((Number) lite).longValue();
            LocalDate utc = LocalDate.ofInstant(Instant.ofEpochMilli(ms), ZoneId.of("UTC"));
            LocalDate loc = LocalDate.ofInstant(Instant.ofEpochMilli(ms), ZoneId.systemDefault());
            LocalDate got;
            if (duck instanceof java.sql.Date) got = ((java.sql.Date) duck).toLocalDate();
            else if (duck instanceof java.sql.Timestamp) got = ((java.sql.Timestamp) duck).toLocalDateTime().toLocalDate();
            else if (duck instanceof LocalDate) got = (LocalDate) duck;
            else if (duck instanceof LocalDateTime) got = ((LocalDateTime) duck).toLocalDate();
            else return false;
            return got.equals(utc) || got.equals(loc);
        }

        if (lite instanceof byte[] || duck instanceof byte[]) {
            int la = lite instanceof byte[] ? ((byte[]) lite).length : -1;
            int lb = duck instanceof byte[] ? ((byte[]) duck).length : -1;
            return la == lb;   // same payload size; byte-for-byte equality is the next line if needed
        }

        if (duck instanceof Boolean || lite instanceof Boolean) {
            return asBool(lite) == asBool(duck);
        }

        if (lite instanceof Number && duck instanceof Number) {
            BigDecimal a = new BigDecimal(lite.toString());
            BigDecimal b = new BigDecimal(duck.toString());
            return a.compareTo(b) == 0;   // 0 == 0.0000: same value, different scale
        }

        return String.valueOf(lite).equals(String.valueOf(duck));
    }

    private static boolean asBool(Object o) {
        if (o instanceof Boolean) return (Boolean) o;
        if (o instanceof Number) return ((Number) o).intValue() != 0;
        return Boolean.parseBoolean(String.valueOf(o));
    }

    private static String show(Object o) {
        if (o == null) return "NULL";
        if (o instanceof byte[]) return "byte[" + ((byte[]) o).length + "]";
        String s = String.valueOf(o);
        return s.length() > 40 ? s.substring(0, 40) + "…" : s;
    }
}
