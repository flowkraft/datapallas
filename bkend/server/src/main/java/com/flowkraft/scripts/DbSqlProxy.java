package com.flowkraft.scripts;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import groovy.lang.Closure;
import groovy.lang.GString;

import com.flowkraft.queries.services.QueriesService;

/**
 * Minimal Groovy-compatible SQL proxy for inline script execution.
 * Exposes rows() and firstRow() by delegating to QueriesService,
 * reusing the existing connection infrastructure.
 *
 * Groovy duck-typing: ctx.dbSql.rows(sql) dispatches here without
 * requiring a full groovy.sql.Sql instance.
 *
 * GString overloads (rows(GString) / firstRow(GString)) are preferred by
 * Groovy's method dispatch when the caller passes a GString such as
 * "WHERE col = ${param}".  The GString is decomposed into a JDBI
 * named-parameter query so the values are bound via PreparedStatement —
 * injection-safe without any change to script syntax.
 */
public class DbSqlProxy {

    private final String connectionId;
    private final QueriesService queriesService;

    public DbSqlProxy(String connectionId, QueriesService queriesService) {
        this.connectionId = connectionId;
        this.queriesService = queriesService;
    }

    // ── String overloads (plain SQL, no interpolation) ────────────────────────

    public List<Map<String, Object>> rows(String sql) throws Exception {
        return queriesService.executeQuery(connectionId, sql, null);
    }

    public Map<String, Object> firstRow(String sql) throws Exception {
        List<Map<String, Object>> rows = queriesService.executeQuery(connectionId, sql, null);
        return rows.isEmpty() ? null : rows.get(0);
    }

    // ── Positional-param overload: rows(sql, [v1, v2, ...]) ──────────────────
    // Converts JDBC-style ? placeholders to JDBI :p0, :p1, … for safe binding.

    public List<Map<String, Object>> rows(String sql, List<?> params) throws Exception {
        if (params == null || params.isEmpty()) {
            return queriesService.executeQuery(connectionId, sql, null);
        }
        Map<String, Object> named = new LinkedHashMap<>();
        StringBuilder namedSql = new StringBuilder();
        int idx = 0;
        for (char c : sql.toCharArray()) {
            if (c == '?') {
                String p = "p" + idx;
                namedSql.append(':').append(p);
                named.put(p, idx < params.size() ? params.get(idx) : null);
                idx++;
            } else {
                namedSql.append(c);
            }
        }
        return queriesService.executeQuery(connectionId, namedSql.toString(), named);
    }

    // ── GString overloads — injection-safe, preferred by Groovy dispatch ──────
    // When script writes: ctx.dbSql.rows("WHERE col = ${param}")
    // Groovy prefers rows(GString) over rows(String) — the GString structure
    // (static parts + values) is preserved and converted to JDBI named params.

    public List<Map<String, Object>> rows(GString gstring) throws Exception {
        return queriesService.executeQuery(connectionId, gstringSql(gstring), gstringParams(gstring));
    }

    public Map<String, Object> firstRow(GString gstring) throws Exception {
        List<Map<String, Object>> rows = rows(gstring);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public Map<String, Object> firstRow(String sql, List<?> params) throws Exception {
        List<Map<String, Object>> rows = rows(sql, params);
        return rows.isEmpty() ? null : rows.get(0);
    }

    // ── eachRow: the shipped dashboards' scripts walk a result the way groovy.sql.Sql does ──

    public void eachRow(String sql, Closure<?> perRow) throws Exception {
        for (Map<String, Object> row : rows(sql)) perRow.call(row);
    }

    public void eachRow(String sql, List<?> params, Closure<?> perRow) throws Exception {
        for (Map<String, Object> row : rows(sql, params)) perRow.call(row);
    }

    public void eachRow(GString gstring, Closure<?> perRow) throws Exception {
        for (Map<String, Object> row : rows(gstring)) perRow.call(row);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Reconstructs the SQL template with :p0, :p1, … in place of GString slots. */
    private static String gstringSql(GString g) {
        String[] parts = g.getStrings();
        Object[] values = g.getValues();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            sb.append(parts[i]);
            if (i < values.length) sb.append(":p").append(i);
        }
        return sb.toString();
    }

    /** Builds the named-param map {p0: v0, p1: v1, …} from the GString values. */
    private static Map<String, Object> gstringParams(GString g) {
        Object[] values = g.getValues();
        Map<String, Object> params = new LinkedHashMap<>();
        for (int i = 0; i < values.length; i++) {
            params.put("p" + i, values[i] != null ? values[i].toString() : null);
        }
        return params;
    }
}
