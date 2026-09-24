package com.flowkraft.exploredata.export;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import groovy.lang.Binding;
import groovy.lang.GroovyShell;

/**
 * Tests for ScriptAssembler's SQL-mode widgets: how {@code ${param}} tokens become JDBC
 * {@code ?} placeholders, and which values get bound to them.
 *
 * <p>JDBC binds by position, so the bind list must follow the placeholders on the line —
 * one entry per {@code ?}, in the order they appear — whatever order the params were defined in.
 */
class ScriptAssemblerTest {

    // ── Generated text ────────────────────────────────────────────────────────

    @Test
    @DisplayName("One param on a line: guarded append, one bind (unchanged)")
    void singleParam() throws Exception {
        String s = assemble("SELECT *\nFROM t\nWHERE x = ${a}", "a");
        assertTrue(s.contains("    tabulator_a_sb.append('SELECT *\\n')\n"), s);
        assertTrue(s.contains(
            "    if (hasA) { tabulator_a_sb.append('WHERE x = ?\\n'); tabulator_a_params << a }\n"), s);
    }

    @Test
    @DisplayName("Two params on a line bind in the order they appear, not the order they were defined")
    void bindOrderFollowsLine() throws Exception {
        String s = assemble("WHERE d BETWEEN ${to} AND ${from}", "from", "to");
        assertTrue(s.contains("    if (hasFrom && hasTo) { tabulator_a_sb.append('WHERE d BETWEEN ? AND ?\\n')"
            + "; tabulator_a_params << to; tabulator_a_params << from }\n"), s);
    }

    @Test
    @DisplayName("A param used twice on a line is bound twice, guarded once")
    void repeatedParam() throws Exception {
        String s = assemble("WHERE a = ${p} OR b = ${p}", "p");
        assertTrue(s.contains("    if (hasP) { tabulator_a_sb.append('WHERE a = ? OR b = ?\\n')"
            + "; tabulator_a_params << p; tabulator_a_params << p }\n"), s);
    }

    @Test
    @DisplayName("Quoted and backslash forms are consumed whole, and still bind in line order")
    void quotedAndBackslashForms() throws Exception {
        String s = assemble("WHERE a = '${p}' AND b = \"${q}\" AND c = \\${p} AND d = '\\${q}' AND e = \"\\${p}\"",
            "q", "p");
        assertTrue(s.contains("tabulator_a_sb.append('WHERE a = ? AND b = ? AND c = ? AND d = ? AND e = ?\\n')"
            + "; tabulator_a_params << p; tabulator_a_params << q; tabulator_a_params << p"
            + "; tabulator_a_params << q; tabulator_a_params << p }\n"), s);
        assertTrue(s.contains("    if (hasQ && hasP) {"), s);
    }

    @Test
    @DisplayName("A param whose name starts another's is not confused with it")
    void prefixNames() throws Exception {
        String s = assemble("WHERE a = ${pp} AND b = ${p}", "p", "pp");
        assertTrue(s.contains("    if (hasP && hasPp) { tabulator_a_sb.append('WHERE a = ? AND b = ?\\n')"
            + "; tabulator_a_params << pp; tabulator_a_params << p }\n"), s);
    }

    @Test
    @DisplayName("IN (${p}) still goes through __bindInList (unchanged)")
    void inList() throws Exception {
        String s = assemble("SELECT *\nFROM t\nWHERE id IN (${ids})", "ids");
        assertTrue(s.contains(
            "    if (hasIds) { __bindInList(tabulator_a_sb, tabulator_a_params, ids, 'WHERE id IN') }\n"), s);
    }

    @Test
    @DisplayName("No params: plain appends, no bind list; an undeclared token is left alone (unchanged)")
    void noParams() throws Exception {
        String s = assemble("SELECT '${other}' AS x\nFROM t");
        assertTrue(s.contains("    tabulator_a_sb.append('SELECT \\'${other}\\' AS x\\n')\n"), s);
        assertTrue(s.contains("    def tabulator_a_data = dbSql.rows(tabulator_a_sb.toString())\n"), s);
        assertFalse(s.contains("_params"), s);
    }

    // ── What reaches JDBC ─────────────────────────────────────────────────────

    @Test
    @DisplayName("Run: BETWEEN ${to} AND ${from} sends to's value first")
    void runBetween() throws Exception {
        List<List<Object>> calls = run(assemble("SELECT *\nFROM t\nWHERE d BETWEEN ${to} AND ${from}", "from", "to"),
            Map.of("from", "2024-01-01", "to", "2024-12-31"));
        assertEquals(List.of(List.of("SELECT *\nFROM t\nWHERE d BETWEEN ? AND ?\n",
            List.of("2024-12-31", "2024-01-01"))), calls);
    }

    @Test
    @DisplayName("Run: one bind per placeholder, across lines, IN lists included")
    void runMixed() throws Exception {
        String sql = "SELECT *\nFROM t\nWHERE (a = ${p} OR b = ${p})\nAND c = '${q}'\nAND id IN (${ids})";
        List<List<Object>> calls = run(assemble(sql, "ids", "q", "p"),
            Map.of("p", "x", "q", "y", "ids", "1, 2"));
        assertEquals(List.of(List.of(
            "SELECT *\nFROM t\nWHERE (a = ? OR b = ?)\nAND c = ?\nAND id IN (?, ?)\n",
            List.of("x", "x", "y", 1L, 2L))), calls);
    }

    @Test
    @DisplayName("Run: a line whose param is missing is dropped with its binds")
    void runMissingParam() throws Exception {
        List<List<Object>> calls = run(assemble("SELECT *\nFROM t\nWHERE a = ${p} OR b = ${p}", "p"), Map.of());
        assertEquals(List.of(Arrays.asList("SELECT *\nFROM t\n", null)), calls);
    }

    @Test
    @DisplayName("IN (${p}) with a scalar param earlier on the line: both substituted, scalar passed as `before`")
    void inListWithScalarPrefix() throws Exception {
        String s = assemble("AND y = ${b} AND id IN (${ids})", "ids", "b");
        assertTrue(s.contains("    if (hasIds && hasB) { __bindInList(tabulator_a_sb, tabulator_a_params, ids, "
            + "'AND y = ? AND id IN', [b]) }\n"), s);
    }

    @Test
    @DisplayName("Run: scalar binds before the IN values on the same line")
    void runInListWithScalarPrefix() throws Exception {
        String sql = "SELECT *\nFROM t\nWHERE y = ${b} AND id IN (${ids})\nAND z = ${c}";
        List<List<Object>> calls = run(assemble(sql, "ids", "c", "b"),
            Map.of("b", "x", "ids", "3, 4", "c", "z"));
        assertEquals(List.of(List.of(
            "SELECT *\nFROM t\nWHERE y = ? AND id IN (?, ?)\nAND z = ?\n",
            List.of("x", 3L, 4L, "z"))), calls);
    }

    @Test
    @DisplayName("Run: IN wildcard '*' drops the whole line, its scalar bind too")
    void runInListWildcardDropsScalar() throws Exception {
        String sql = "SELECT *\nFROM t\nWHERE 1 = 1\nAND y = ${b} AND id IN (${ids})";
        List<List<Object>> calls = run(assemble(sql, "ids", "b"), Map.of("b", "x", "ids", "*"));
        assertEquals(List.of(Arrays.asList("SELECT *\nFROM t\nWHERE 1 = 1\n", null)), calls);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static String assemble(String sql, String... paramIds) throws Exception {
        Map<String, Object> ds = new LinkedHashMap<>();
        ds.put("mode", "sql");
        ds.put("sql", sql);
        Map<String, Object> w = new LinkedHashMap<>();
        w.put("id", "w-a");
        w.put("type", "tabulator");
        w.put("dataSource", ds);
        List<Map<String, Object>> params = new ArrayList<>();
        for (String id : paramIds) params.add(Map.of("id", id));
        return ScriptAssembler.assemble(List.of(w), params).text();
    }

    /** Runs the generated script against a stub ctx; returns each dbSql.rows call as [sql, params]. */
    @SuppressWarnings("unchecked")
    private static List<List<Object>> run(String script, Map<String, String> userVars) {
        Binding b = new Binding();
        List<List<Object>> calls = new ArrayList<>();
        b.setVariable("calls", calls);
        b.setVariable("userVarsIn", new LinkedHashMap<>(userVars));
        GroovyShell sh = new GroovyShell(b);
        b.setVariable("ctx", sh.evaluate("""
            def dbSql = new Expando()
            dbSql.rows = { String sql, List p = null -> calls << [sql, p == null ? null : new ArrayList(p)]; [] }
            def vars = new Expando()
            vars.get = { k -> null }
            vars.getUserVariables = { t -> userVarsIn }
            def ctx = new Expando(dbSql: dbSql, variables: vars, token: '')
            ctx.reportData = { id, rows -> }
            ctx
            """));
        sh.evaluate(script);
        return calls;
    }
}
