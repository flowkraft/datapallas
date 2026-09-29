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
    @DisplayName("One param on a line: guarded append, one bind, one statement per line")
    void singleParam() throws Exception {
        String s = assemble("SELECT *\nFROM t\nWHERE x = ${a}", "a");
        assertTrue(s.contains("    sql << 'SELECT *\\n'\n"), s);
        assertTrue(s.contains(
              "    if (hasA) {\n"
            + "        sql << 'WHERE x = ?\\n'\n"
            + "        params << a\n"
            + "    } else {\n"
            + "        sql << 'WHERE 1=1\\n'   // no value: this filter is off\n"
            + "    }\n"), s);
    }

    @Test
    @DisplayName("Two params on a line bind in the order they appear, not the order they were defined")
    void bindOrderFollowsLine() throws Exception {
        String s = assemble("WHERE d BETWEEN ${to} AND ${from}", "from", "to");
        assertTrue(s.contains(
              "    if (hasFrom && hasTo) {\n"
            + "        sql << 'WHERE d BETWEEN ? AND ?\\n'\n"
            + "        params << to\n"
            + "        params << from\n"
            + "    } else {\n"), s);
    }

    @Test
    @DisplayName("A param used twice on a line is bound twice, guarded once")
    void repeatedParam() throws Exception {
        String s = assemble("WHERE a = ${p} OR b = ${p}", "p");
        assertTrue(s.contains(
              "    if (hasP) {\n"
            + "        sql << 'WHERE a = ? OR b = ?\\n'\n"
            + "        params << p\n"
            + "        params << p\n"
            + "    } else {\n"), s);
    }

    @Test
    @DisplayName("Quoted and backslash forms are consumed whole, and still bind in line order")
    void quotedAndBackslashForms() throws Exception {
        String s = assemble("WHERE a = '${p}' AND b = \"${q}\" AND c = \\${p} AND d = '\\${q}' AND e = \"\\${p}\"",
            "q", "p");
        assertTrue(s.contains(
              "    if (hasQ && hasP) {\n"
            + "        sql << 'WHERE a = ? AND b = ? AND c = ? AND d = ? AND e = ?\\n'\n"
            + "        params << p\n"
            + "        params << q\n"
            + "        params << p\n"
            + "        params << q\n"
            + "        params << p\n"
            + "    } else {\n"), s);
    }

    @Test
    @DisplayName("A param whose name starts another's is not confused with it")
    void prefixNames() throws Exception {
        String s = assemble("WHERE a = ${pp} AND b = ${p}", "p", "pp");
        assertTrue(s.contains(
              "    if (hasP && hasPp) {\n"
            + "        sql << 'WHERE a = ? AND b = ?\\n'\n"
            + "        params << pp\n"
            + "        params << p\n"
            + "    } else {\n"), s);
    }

    @Test
    @DisplayName("IN (${p}) goes through addInList, and only when the list has values")
    void inList() throws Exception {
        String s = assemble("SELECT *\nFROM t\nWHERE id IN (${ids})", "ids");
        assertTrue(s.contains(
              "    if (hasIds && listHasValues(ids)) {\n"
            + "        addInList(sql, params, ids, 'WHERE id IN')\n"
            + "    } else {\n"
            + "        sql << 'WHERE 1=1\\n'   // no values, or '*' (all): this filter is off\n"
            + "    }\n"), s);
    }

    @Test
    @DisplayName("No params: plain appends, no bind list, no helpers; an undeclared token is left alone")
    void noParams() throws Exception {
        String s = assemble("SELECT '${other}' AS x\nFROM t");
        assertTrue(s.contains("    sql << 'SELECT \\'${other}\\' AS x\\n'\n"), s);
        assertTrue(s.contains("    def data = dbSql.rows(sql.toString())\n"), s);
        assertFalse(s.contains("def params"), s);
    }

    @Test
    @DisplayName("A script gets only the helpers it calls")
    void onlyTheHelpersItCalls() throws Exception {
        String s = assemble("SELECT *\nFROM t\nWHERE x = ${a}", "a");
        for (String helper : List.of("asDeclaredType", "dayAfter", "listHasValues", "numberOrText", "addInList"))
            assertFalse(s.contains("def " + helper), helper + "\n" + s);
    }

    @Test
    @DisplayName("A value the server sets is always applied: no guard, a comment that says so, its list never dropped")
    void builtinLinesAreAlwaysApplied() throws Exception {
        String s = assemble("SELECT *\nFROM t\nWHERE customer_id = ${dp_attr_customer_id}\nAND g IN (${dp_user_groups})");
        assertTrue(s.contains(
              "    // Always applied: dp_attr_customer_id is set by the server, and an empty value matches no row\n"
            + "    sql << 'WHERE customer_id = ?\\n'\n"
            + "    params << dp_attr_customer_id\n"), s);
        assertTrue(s.contains(
              "    // Always applied: dp_user_groups is set by the server, and an empty list matches no row\n"
            + "    addInList(sql, params, dp_user_groups, 'AND g IN')\n"), s);
        assertTrue(s.contains("// ─── Set by the server for the viewer, never by the request ───\n"), s);
        assertFalse(s.contains("hasDp_"), s);
        assertFalse(s.contains("listHasValues"), s);
    }

    @Test
    @DisplayName("A parameter named like one of the script's helpers is refused, in words")
    void helperNameIsRefused() {
        CanvasExportException e = assertThrows(CanvasExportException.class,
            () -> assemble("SELECT *\nFROM t\nWHERE x IN (${addInList})", "addInList"));
        assertTrue(e.getMessage().contains("'addInList'"), e.getMessage());
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
    @DisplayName("Run: a line whose param has no value is not applied - it asks 1=1, and its binds are gone")
    void runMissingParam() throws Exception {
        // P2: the filter is not applied, but the line stays as something always true, so the
        // question is still whole - a line that simply vanished would leave the next one
        // opening with AND, and the database would refuse the whole query.
        List<List<Object>> calls = run(assemble("SELECT *\nFROM t\nWHERE a = ${p} OR b = ${p}", "p"), Map.of());
        assertEquals(List.of(Arrays.asList("SELECT *\nFROM t\nWHERE 1=1\n", null)), calls);
    }

    @Test
    @DisplayName("IN (${p}) with a scalar param earlier on the line: both substituted, scalar passed as `before`")
    void inListWithScalarPrefix() throws Exception {
        String s = assemble("AND y = ${b} AND id IN (${ids})", "ids", "b");
        assertTrue(s.contains(
              "    if (hasIds && hasB && listHasValues(ids)) {\n"
            + "        params << b\n"
            + "        addInList(sql, params, ids, 'AND y = ? AND id IN')\n"
            + "    } else {\n"
            + "        sql << 'AND 1=1\\n'   // no values, or '*' (all): this filter is off\n"
            + "    }\n"), s);
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
    @DisplayName("Run: IN wildcard '*' leaves the whole line out, its scalar bind too, and asks 1=1 instead")
    void runInListWildcardDropsScalar() throws Exception {
        String sql = "SELECT *\nFROM t\nWHERE 1 = 1\nAND y = ${b} AND id IN (${ids})";
        List<List<Object>> calls = run(assemble(sql, "ids", "b"), Map.of("b", "x", "ids", "*"));
        assertEquals(List.of(Arrays.asList("SELECT *\nFROM t\nWHERE 1 = 1\nAND 1=1\n", null)), calls);
    }

    // ── Declared parameter types (P1) ───────────────────────────

    @Test
    @DisplayName("A parameter with no declared type binds its bare value, and no conversion is written")
    void untypedParamIsUnchanged() throws Exception {
        String s = assemble("SELECT *\nFROM t\nWHERE d <= ${to}", "to");
        assertTrue(s.contains("        params << to\n"), s);
        assertFalse(s.contains("asDeclaredType"), s);
    }

    @Test
    @DisplayName("A declared type travels into the script: the bind goes through the one conversion")
    void typedParamBindsThroughTheConversion() throws Exception {
        String s = assembleTyped("SELECT *\nFROM t\nWHERE d <= ${to}", Map.of("to", "Date"));
        assertTrue(s.contains("        params << asDeclaredType('to', 'Date', to)\n"), s);
        assertTrue(s.contains("import com.sourcekraft.documentburster.common.reportparameters.ParameterTypes\n"), s);
        assertTrue(s.contains("    return ParameterTypes.typed(name, type, value.toString())\n"), s);
    }

    @Test
    @DisplayName("Run: the published script converts, so JDBC is sent a date and a number, not their text")
    void runTypedParams() throws Exception {
        String sql = "SELECT *\nFROM t\nWHERE d <= ${to} AND n > ${min}";
        List<List<Object>> calls = run(assembleTyped(sql, Map.of("to", "Date", "min", "Integer")),
            Map.of("to", "2026-01-31", "min", "32000"));
        assertEquals(1, calls.size());
        List<Object> bound = (List<Object>) calls.get(0).get(1);
        assertEquals(java.time.LocalDate.parse("2026-01-31"), bound.get(0));
        assertEquals(32000L, bound.get(1));
    }

    @Test
    @DisplayName("Run: every value of a typed IN list is converted, not only the first")
    void runTypedInList() throws Exception {
        String sql = "SELECT *\nFROM t\nWHERE d IN (${days})";
        List<List<Object>> calls = run(assembleTyped(sql, Map.of("days", "Date")),
            Map.of("days", "2026-01-05, 2026-01-31"));
        assertEquals(List.of(List.of("SELECT *\nFROM t\nWHERE d IN (?, ?)\n",
            List.of(java.time.LocalDate.parse("2026-01-05"), java.time.LocalDate.parse("2026-01-31")))), calls);
    }

    @Test
    @DisplayName("Run: a value the declared type refuses names the parameter and the form it wanted")
    void runTypedParamRefusesABadValue() throws Exception {
        String script = assembleTyped("SELECT *\nFROM t\nWHERE d <= ${to}", Map.of("to", "Date"));
        Exception thrown = assertThrows(Exception.class, () -> run(script, Map.of("to", "31/01/2026")));
        String message = String.valueOf(thrown.getMessage()) + String.valueOf(
            thrown.getCause() == null ? "" : thrown.getCause().getMessage());
        assertTrue(message.contains("'to'") && message.contains("yyyy-MM-dd"), message);
    }

    @Test
    @DisplayName("Run: an empty server list binds one empty item, and a '*' in it is a name, not all")
    void runBuiltinList() throws Exception {
        String script = assemble("SELECT *\nFROM t\nWHERE customer_id = ${dp_attr_customer_id}\nAND g IN (${dp_user_groups})");
        assertEquals(List.of(List.of("SELECT *\nFROM t\nWHERE customer_id = ?\nAND g IN (?)\n", List.of("", ""))),
            run(script, Map.of("dp_attr_customer_id", "", "dp_user_groups", "")));
        assertEquals(List.of(List.of("SELECT *\nFROM t\nWHERE customer_id = ?\nAND g IN (?)\n", List.of("7", "*"))),
            run(script, Map.of("dp_attr_customer_id", "7", "dp_user_groups", "*")));
    }

    @Test
    @DisplayName("Run: parameters named like the script's own words still compile, and bind in order")
    void runParametersNamedLikeTheScriptsWords() throws Exception {
        String sql = "SELECT *\nFROM t\nWHERE a = ${sql} AND b = ${params} AND c = ${data}\n"
            + "AND d = ${name} AND e = ${type} AND f = ${value}\nAND g IN (${items})\nAND h = ${item} AND i = ${text}";
        List<Map<String, Object>> params = new ArrayList<>();
        for (String id : List.of("sql", "params", "data", "name", "type", "item", "text"))
            params.add(Map.of("id", id));
        params.add(Map.of("id", "value", "type", "Integer"));
        params.add(Map.of("id", "items", "type", "Integer"));
        String script = assembleWith(sql, params);
        assertTrue(script.contains("    def tabulator_a_sql = new StringBuilder()\n"), script);
        Map<String, String> values = new LinkedHashMap<>();
        for (String id : List.of("sql", "params", "data", "name", "type", "item", "text")) values.put(id, id);
        values.put("value", "5");
        values.put("items", "1, 2");
        assertEquals(List.of(List.of(
            "SELECT *\nFROM t\nWHERE a = ? AND b = ? AND c = ?\nAND d = ? AND e = ? AND f = ?\nAND g IN (?, ?)\nAND h = ? AND i = ?\n",
            List.of("sql", "params", "data", "name", "type", 5L, 1L, 2L, "item", "text"))), run(script, values));
    }

    @Test
    @DisplayName("Run: a filter the bind chip bound to a builtin is bound by the exported script, declared by nobody")
    void runAFilterTheChipBoundToABuiltin() throws Exception {
        // What the canvas writes once the chip offers the server's own names (18c): the widget's
        // SQL carries ${dp_user_email} and the groups as a list, and the dashboard declares
        // neither - the server sets them for whoever is looking, so the line is always applied.
        String script = assemble("SELECT *\nFROM support_tickets\nWHERE agent_email = ${dp_user_email}"
            + "\nAND team IN (${dp_user_groups})");
        assertTrue(script.contains(
              "    // Always applied: dp_user_email is set by the server, and an empty value matches no row\n"
            + "    sql << 'WHERE agent_email = ?\\n'\n"
            + "    params << dp_user_email\n"), script);
        assertFalse(script.contains("hasDp_user_email"), script);

        String chiara = "chiara.muller@support.cube-demo.example";
        assertEquals(List.of(List.of(
            "SELECT *\nFROM support_tickets\nWHERE agent_email = ?\nAND team IN (?, ?)\n",
            List.of(chiara, "Billing", "Tier 2"))),
            run(script, Map.of("dp_user_email", chiara, "dp_user_groups", "Billing, Tier 2")));
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

    /** The same widget, with the parameter definitions given as they are. */
    private static String assembleWith(String sql, List<Map<String, Object>> params) throws Exception {
        Map<String, Object> ds = new LinkedHashMap<>();
        ds.put("mode", "sql");
        ds.put("sql", sql);
        Map<String, Object> w = new LinkedHashMap<>();
        w.put("id", "w-a");
        w.put("type", "tabulator");
        w.put("dataSource", ds);
        return ScriptAssembler.assemble(List.of(w), params).text();
    }

    /** The same widget, with a declared type beside each parameter id. */
    private static String assembleTyped(String sql, Map<String, String> types) throws Exception {
        Map<String, Object> ds = new LinkedHashMap<>();
        ds.put("mode", "sql");
        ds.put("sql", sql);
        Map<String, Object> w = new LinkedHashMap<>();
        w.put("id", "w-a");
        w.put("type", "tabulator");
        w.put("dataSource", ds);
        List<Map<String, Object>> params = new ArrayList<>();
        for (Map.Entry<String, String> one : types.entrySet())
            params.add(Map.of("id", one.getKey(), "type", one.getValue()));
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
