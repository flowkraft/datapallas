package com.flowkraft.exploredata.export;

import groovy.lang.GroovyShell;
import org.codehaus.groovy.control.CompilationFailedException;
import org.codehaus.groovy.control.CompilerConfiguration;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Assembles the {@code {reportCode}-script.groovy} dispatcher from a list of
 * canvas widgets and the filter-bar DSL.
 *
 * <p>Design goals (from the Phase-6 plan):
 * <ul>
 *   <li>Same input → same output bytes (canonical widget ordering, TreeSet
 *       import dedup, parameters in definition order).</li>
 *   <li>Zero variable collisions — all generated variables are prefixed with a
 *       sanitized widget component-ID.</li>
 *   <li>Full scope isolation for user Groovy — each script-mode widget is
 *       wrapped in a closure-IIFE {@code { -> ... }()} so every {@code def}
 *       inside is block-local.</li>
 *   <li>Import hoisting — {@code import} lines are regex-extracted from user
 *       Groovy bodies, deduplicated via {@link TreeSet}, and emitted at the
 *       top of the compilation unit (the only valid location for imports in
 *       Groovy).</li>
 *   <li>Atomic safety net — the assembled text is parsed (not executed) via
 *       {@code GroovyShell.parse()} before being returned; on
 *       {@link CompilationFailedException} a line-to-widget blame map is
 *       consulted and a {@link CanvasExportException} naming the responsible
 *       widget is thrown.  Nothing is written to disk until the check
 *       passes.</li>
 * </ul>
 */
public class ScriptAssembler {

    // ── Constants ─────────────────────────────────────────────────────────────

    /** Widget types that produce rows and therefore need a script block. */
    private static final Set<String> DATA_TYPES = Set.of(
            "chart", "tabulator", "pivot", "number", "map",
            "sankey", "gauge", "trend", "progress", "detail"
    );

    /** Matches a full import statement on its own line. */
    private static final Pattern IMPORT_PATTERN = Pattern.compile(
            "^\\s*import\\s+[\\w.*]+(\\s+as\\s+\\w+)?\\s*(;\\s*)?$",
            Pattern.MULTILINE
    );

    /** Matches "@ line N" in Groovy compilation error messages. */
    private static final Pattern ERROR_LINE_PATTERN = Pattern.compile("@ line (\\d+)");

    // ── Public record ─────────────────────────────────────────────────────────

    /**
     * Result returned by {@link #assemble}.
     *
     * @param text           the fully assembled, compile-verified Groovy text
     * @param lineToWidgetId 1-based line number → original widget {@code id}
     *                       (used to blame-map compiler errors back to widgets)
     */
    public record AssembledScript(String text, Map<Integer, String> lineToWidgetId) {}

    /** One line of user SQL, with {@code ${param}} tokens replaced by JDBC {@code ?}.
     *  When {@code inListParam} is non-null, the line was originally
     *  {@code ... IN (${param})} and {@code text} carries an SQL prefix (everything
     *  before the IN clause) to be passed to the runtime {@code __bindInList} helper. */
    private record SqlLine(String text, List<String> params, String inListParam) {
        SqlLine(String text, List<String> params) { this(text, params, null); }
    }

    // ── Public entry point ────────────────────────────────────────────────────

    /**
     * Assembles and compile-checks the dispatcher script.
     *
     * @param allWidgets   all canvas widgets (non-data widgets are ignored)
     * @param parametersList canonical Map list of dashboard parameter definitions
     *                       (from {@code parametersConfig.parameters}); may be empty
     * @return assembled script + blame map
     * @throws CanvasExportException if the assembled script fails to compile;
     *         {@link CanvasExportException#widgetId} names the responsible widget
     *         when the error line can be traced back to one
     */
    public static AssembledScript assemble(List<Map<String, Object>> allWidgets,
                                           List<Map<String, Object>> parametersList) throws CanvasExportException {

        // 1. Filter to data widgets and sort canonically: (y, x, id)
        List<Map<String, Object>> widgets = allWidgets.stream()
                .filter(w -> DATA_TYPES.contains(str(w, "type")))
                .sorted(Comparator.comparingInt((Map<String, Object> w) -> gridInt(w, "y"))
                        .thenComparingInt(w -> gridInt(w, "x"))
                        .thenComparing(w -> str(w, "id")))
                .toList();

        // 2. Hoist imports from script-mode widgets (dedup + sort via TreeSet)
        TreeSet<String> hoistedImports = new TreeSet<>();
        for (Map<String, Object> w : widgets) {
            if ("script".equals(dsField(w, "mode"))) {
                String body = dsField(w, "script");
                if (!body.isBlank()) extractImports(body).forEach(hoistedImports::add);
            }
        }

        // 3. Read parameter IDs straight from the canonical Map — no DSL parse needed.
        List<String> paramNames = (parametersList == null ? List.<Map<String, Object>>of() : parametersList).stream()
                .map(p -> {
                    Object id = p.get("id");
                    return id instanceof String s ? s : null;
                })
                .filter(s -> s != null && !s.isBlank())
                .toList();

        // 4. Build script text + line-to-widget blame map
        StringBuilder sb          = new StringBuilder();
        Map<Integer, String> blame = new LinkedHashMap<>();

        // ── Header ────────────────────────────────────────────────────────────
        sb.append("// AUTO-GENERATED by CanvasExportService. DO NOT EDIT MANUALLY.\n");
        sb.append("// Regenerated on every Save-to-DataPallas.\n\n");

        sb.append("import groovy.sql.Sql\n");
        for (String imp : hoistedImports) sb.append(imp.trim()).append("\n");
        sb.append("\n");

        sb.append("def dbSql       = ctx.dbSql\n");
        sb.append("def componentId = ctx.variables?.get('componentId')\n");
        sb.append("def userVars    = ctx.variables.getUserVariables(ctx.token ?: '')\n");
        sb.append("\n");

        // ── IN-list expansion helper ──────────────────────────────────────────
        // At runtime, splits a CSV param value (\"1, 5, 10\") into a real SQL list.
        // Without this, IN (${p}) emits IN (?) and binds the entire CSV string as
        // one VARCHAR — Postgres rejects integer = varchar. Long → Double → String
        // coercion mirrors QueriesService so numeric columns get integer binds.
        // Wildcard '*' returns false so the caller skips the IN clause entirely
        // → query runs without that filter → user sees rows for every value.
        // `before` = the binds of scalar params earlier on the same line; they are
        // added only when the line is appended, and ahead of the list values.
        sb.append("def __bindInList = { sb, params, csv, sqlPrefix, before = [] ->\n");
        sb.append("    if (!csv) return false\n");
        sb.append("    if (csv.toString().trim() == '*') return false\n");
        sb.append("    def vals = csv.toString().split(',').collect { it.trim() }.findAll { it }\n");
        sb.append("    if (vals.isEmpty()) return false\n");
        sb.append("    sb.append(sqlPrefix + ' (' + vals.collect { '?' }.join(', ') + ')\\n')\n");
        sb.append("    params.addAll(before)\n");
        sb.append("    vals.each { v ->\n");
        sb.append("        try { params << Long.parseLong(v) }\n");
        sb.append("        catch (e) { try { params << Double.parseDouble(v) } catch (e2) { params << v } }\n");
        sb.append("    }\n");
        sb.append("    return true\n");
        sb.append("}\n\n");

        // ── Canvas parameters ─────────────────────────────────────────────────
        for (String paramName : paramNames) {
            sb.append("def ").append(paramName)
              .append(" = userVars?.get('").append(paramName).append("')?.toString()\n");
            sb.append("def has").append(capitalize(paramName))
              .append(" = (").append(paramName)
              .append(" != null && !").append(paramName).append(".isEmpty())\n");
        }
        if (!paramNames.isEmpty()) sb.append("\n");

        // ── Per-widget blocks ─────────────────────────────────────────────────
        for (Map<String, Object> w : widgets) {
            int blockStart   = lineCount(sb);
            String compId    = componentId(w);
            String origId    = str(w, "id");
            String mode      = dsField(w, "mode");
            String wtype     = str(w, "type");

            if ("script".equals(mode)) {
                String rawBody = dsField(w, "script");
                // Strip import lines that were hoisted to the top
                String body = IMPORT_PATTERN.matcher(rawBody).replaceAll("").trim();

                sb.append("// ─── Widget: ").append(compId)
                  .append(" (type=").append(wtype).append(", dataSource=script) ───\n");
                sb.append("if (!componentId || componentId == '").append(compId).append("') {\n");
                sb.append("    def ").append(varPrefix(compId)).append("_data = { ->\n");
                for (String line : body.split("\n", -1)) {
                    sb.append("        ").append(line).append("\n");
                }
                sb.append("    }()\n");
                sb.append("    ctx.reportData('").append(compId).append("', ")
                  .append(varPrefix(compId)).append("_data)\n");
                sb.append("}\n");

            } else {
                // SQL mode: visual → generatedSql; ai-sql / sql → sql field
                String sql = resolveSql(w);

                if (sql == null || sql.isBlank()) {
                    sb.append("// ─── Widget: ").append(compId)
                      .append(" (type=").append(wtype).append(") — no data source configured ───\n");
                } else {
                    String vp = varPrefix(compId);
                    List<SqlLine> sqlLines = analyzeSqlLines(sql, paramNames);
                    boolean hasCond = sqlLines.stream().anyMatch(
                        l -> !l.params().isEmpty() || l.inListParam() != null);

                    sb.append("// ─── Widget: ").append(compId)
                      .append(" (type=").append(wtype)
                      .append(", dataSource=").append(mode).append(") ───\n");
                    sb.append("if (!componentId || componentId == '").append(compId).append("') {\n");
                    sb.append("    def ").append(vp).append("_sb = new StringBuilder()\n");
                    if (hasCond) {
                        sb.append("    def ").append(vp).append("_params = []\n");
                    }
                    for (SqlLine sl : sqlLines) {
                        String esc = escapeForGroovySingleQuoted(sl.text());
                        if (sl.inListParam() != null) {
                            // IN-list: runtime expansion via __bindInList helper.
                            String p = sl.inListParam();
                            List<String> used = new ArrayList<>(sl.params());
                            used.add(p);
                            sb.append("    if (").append(guard(paramNames, used)).append(") { ")
                              .append("__bindInList(").append(vp).append("_sb, ")
                              .append(vp).append("_params, ").append(p).append(", '")
                              .append(esc).append("'");
                            if (!sl.params().isEmpty()) {
                                sb.append(", [").append(String.join(", ", sl.params())).append("]");
                            }
                            sb.append(") }\n");
                        } else if (sl.params().isEmpty()) {
                            sb.append("    ").append(vp).append("_sb.append('").append(esc).append("\\n')\n");
                        } else {
                            // Binds (below): one per `?`, in the order the placeholders appear.
                            sb.append("    if (").append(guard(paramNames, sl.params())).append(") { ")
                              .append(vp).append("_sb.append('").append(esc).append("\\n')");
                            for (String p : sl.params()) {
                                sb.append("; ").append(vp).append("_params << ").append(p);
                            }
                            sb.append(" }\n");
                        }
                    }
                    if (hasCond) {
                        sb.append("    def ").append(vp).append("_data = ").append(vp).append("_sb.length() == 0 ? [] : ").append(vp).append("_params.isEmpty()\n");
                        sb.append("        ? dbSql.rows(").append(vp).append("_sb.toString())\n");
                        sb.append("        : dbSql.rows(").append(vp).append("_sb.toString(), ").append(vp).append("_params)\n");
                    } else {
                        sb.append("    def ").append(vp).append("_data = dbSql.rows(").append(vp).append("_sb.toString())\n");
                    }
                    sb.append("    ctx.reportData('").append(compId).append("', ").append(vp).append("_data)\n");
                    sb.append("}\n");
                }
            }

            // Record line range for blame mapping
            int blockEnd = lineCount(sb);
            for (int line = blockStart; line < blockEnd; line++) {
                blame.put(line, origId.isBlank() ? compId : origId);
            }
            sb.append("\n");
        }

        // 5. Pre-write compile check — nothing is written until this passes
        String scriptText = sb.toString();
        compileCheck(scriptText, blame);

        return new AssembledScript(scriptText, blame);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Component ID formula — must match {@code DashboardFileGenerator.componentId()} and
     * the TypeScript {@code getCanvasComponentIds()} helper.
     * When a semantic slug can be inferred from widget data (field name, table name, etc.)
     * the format is {@code type_slug_suffix}; otherwise falls back to {@code type_strippedId}.
     */
    private static String componentId(Map<String, Object> widget) {
        String type    = str(widget, "type");
        String id      = str(widget, "id");
        String stripped = id.replaceFirst("^w-", "");
        String slug    = inferSemanticSlug(type, widget);
        if (slug.isEmpty()) return type + "_" + stripped;
        int lastDash = stripped.lastIndexOf('-');
        String suffix = lastDash >= 0 ? stripped.substring(lastDash + 1) : stripped;
        return type + "_" + slug + "_" + suffix;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> displayConfig(Map<String, Object> widget) {
        Object dc = widget.get("displayConfig");
        return dc instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    @SuppressWarnings("unchecked")
    private static List<String> listOfStr(Map<String, Object> map, String key) {
        Object v = map.get(key);
        if (v instanceof List<?> l)
            return l.stream().filter(Objects::nonNull).map(Object::toString).collect(Collectors.toList());
        return List.of();
    }

    private static String visualQueryTable(Map<String, Object> widget) {
        Object ds = widget.get("dataSource");
        if (ds instanceof Map<?, ?> dsMap) {
            Object vq = dsMap.get("visualQuery");
            if (vq instanceof Map<?, ?> vqMap) {
                Object t = vqMap.get("table");
                return t != null ? String.valueOf(t) : "";
            }
        }
        return "";
    }

    private static String strOr(Map<String, Object> map, String key, String def) {
        Object v = map.get(key);
        if (v instanceof String s && !s.isBlank()) return s;
        return def;
    }

    private static String inferSemanticSlug(String type, Map<String, Object> widget) {
        Map<String, Object> dc = displayConfig(widget);
        // Primary: field/table name derived from data binding — most precise
        String raw = switch (type) {
            case "number"      -> strOr(dc, "numberField",  "");
            case "chart"       -> { List<String> f = listOfStr(dc, "xFields");   yield f.isEmpty() ? "" : f.get(0); }
            case "tabulator"   -> visualQueryTable(widget);
            case "pivot"       -> { List<String> r = listOfStr(dc, "pivotRows"); yield r.isEmpty() ? "" : r.get(0); }
            case "filter-pane" -> strOr(dc, "filterField",  "");
            case "gauge"       -> strOr(dc, "field",        "");
            case "trend"       -> strOr(dc, "dateField",    "");
            case "sankey"      -> strOr(dc, "sourceField",  "");
            default            -> "";
        };
        if (!raw.isBlank()) return slugify(raw);
        // Fallback: user-provided title/label — semantic because the user chose it
        String label = switch (type) {
            case "number"      -> strOr(dc, "numberLabel",     "");
            case "chart"       -> strOr(dc, "chartTitle",      "");
            case "filter-pane" -> strOr(dc, "filterPaneLabel", "");
            case "gauge"       -> strOr(dc, "label",           "");
            case "trend"       -> strOr(dc, "label",           "");
            default            -> "";
        };
        return label.isBlank() ? "" : slugify(label);
    }

    private static String slugify(String s) {
        return s.toLowerCase().replaceAll("[^a-z0-9]+", "_").replaceAll("(^_+|_+$)", "");
    }

    /**
     * Sanitizes a component ID into a valid Groovy variable name prefix.
     * Replaces non-alphanumeric/underscore chars; prepends {@code w_} if the
     * first char is a digit.
     */
    private static String varPrefix(String componentId) {
        String safe = componentId.replaceAll("[^a-zA-Z0-9_]", "_");
        return (safe.isEmpty() || Character.isDigit(safe.charAt(0))) ? "w_" + safe : safe;
    }

    private static String str(Map<String, Object> map, String key) {
        Object v = map.get(key);
        return v != null ? String.valueOf(v) : "";
    }

    @SuppressWarnings("unchecked")
    private static int gridInt(Map<String, Object> widget, String field) {
        Object gp = widget.get("gridPosition");
        if (gp instanceof Map<?, ?> m) {
            Object v = m.get(field);
            if (v instanceof Number n) return n.intValue();
            if (v instanceof String s) { try { return Integer.parseInt(s); } catch (NumberFormatException ignored) {} }
        }
        return 0;
    }

    @SuppressWarnings("unchecked")
    private static String dsField(Map<String, Object> widget, String field) {
        Object ds = widget.get("dataSource");
        if (ds instanceof Map<?, ?> m) {
            Object v = m.get(field);
            return v != null ? String.valueOf(v) : "";
        }
        return "";
    }

    private static String resolveSql(Map<String, Object> widget) {
        String mode = dsField(widget, "mode");
        if ("sql".equals(mode) || "ai-sql".equals(mode)) {
            String sql = dsField(widget, "sql");
            if (!sql.isBlank()) return sql;
        }
        // visual mode: use the pre-compiled generatedSql
        String gen = dsField(widget, "generatedSql");
        return gen.isBlank() ? null : gen;
    }

    /**
     * Splits user SQL into per-line records. Any {@code ${paramName}} token —
     * including surrounding single or double quotes, e.g. {@code '${p}'} — is
     * replaced with a JDBC {@code ?} placeholder and the parameter name is
     * recorded once per placeholder, in the order the placeholders appear on
     * the line (JDBC binds by position). Lines with no parameter references are
     * returned as-is.
     * Trailing blank lines are stripped so the generated SQL has no redundant
     * trailing newlines.
     */
    private static List<SqlLine> analyzeSqlLines(String sql, List<String> paramNames) {
        List<SqlLine> result = new ArrayList<>();
        Pattern scalarP = scalarTokenPattern(paramNames);
        for (String rawLine : sql.stripTrailing().split("\n", -1)) {
            // Detect IN-list pattern first: anything ending with `IN (${p})` or
            // `NOT IN (${p})`. The prefix (operator + column, e.g. `WHERE "id"`)
            // is carried as the line's text; the runtime __bindInList helper appends
            // ` IN (?, ?, ...)` and binds each value with type coercion.
            String inListParam = null;
            String processed = rawLine;
            for (String p : paramNames) {
                Pattern inListP = Pattern.compile(
                    "^(.*?)\\s+(IN|NOT\\s+IN)\\s*\\(\\s*\\$\\{" + Pattern.quote(p) + "\\}\\s*\\)\\s*;?\\s*$",
                    Pattern.CASE_INSENSITIVE);
                Matcher m = inListP.matcher(rawLine);
                if (m.matches()) {
                    String prefix = m.group(1).trim();
                    String op = m.group(2).toUpperCase().replaceAll("\\s+", " ");
                    processed = prefix + " " + op; // e.g. `WHERE "id" IN` — helper appends ` (?, ?, ...)`
                    inListParam = p;
                    break;
                }
            }
            List<String> lineParams = new ArrayList<>();
            processed = substituteScalars(processed, scalarP, lineParams);
            if (inListParam != null) {
                // Scalar params before the IN clause (`AND y = ${b} AND id IN (${ids})`)
                // bind ahead of the list values, via the helper's `before` argument.
                result.add(new SqlLine(processed, Collections.unmodifiableList(lineParams), inListParam));
                continue;
            }
            result.add(new SqlLine(processed, Collections.unmodifiableList(lineParams)));
        }
        return result;
    }

    /**
     * Scalar param substitution: one left-to-right scan, so a param used twice is
     * bound twice and params bind in the order they appear, not the order they were
     * defined ({@code BETWEEN ${to} AND ${from}} must not swap the values). Each
     * token becomes {@code ?}; its param name is appended to {@code params}.
     */
    private static String substituteScalars(String text, Pattern scalarP, List<String> params) {
        if (scalarP == null) return text;
        Matcher m = scalarP.matcher(text);
        StringBuilder out = new StringBuilder();
        while (m.find()) {
            params.add(m.group(1) != null ? m.group(1) : m.group(2) != null ? m.group(2) : m.group(3));
            m.appendReplacement(out, "?");
        }
        m.appendTail(out);
        return out.toString();
    }

    /** {@code hasA && hasB} — each param the line uses, once, in definition order. */
    private static String guard(List<String> paramNames, Collection<String> used) {
        return paramNames.stream().filter(used::contains)
                .map(p -> "has" + capitalize(p)).collect(Collectors.joining(" && "));
    }

    /**
     * Matches one {@code ${p}} token of any declared param, together with what
     * surrounds it: {@code '${p}'} or {@code "${p}"} (quotes consumed, the value is
     * bound), and an optional leading backslash — {@code \${p}} surfaces when SQL
     * is pasted from a TS template-literal source where {@code \$} escapes the
     * interpolation; Monaco keeps the backslash and it has no meaning in SQL.
     * Group 1, 2 or 3 holds the param name. Null when there are no params.
     */
    private static Pattern scalarTokenPattern(List<String> paramNames) {
        if (paramNames.isEmpty()) return null;
        String names = paramNames.stream().map(Pattern::quote).collect(Collectors.joining("|"));
        String tok = "\\\\?\\$\\{(" + names + ")\\}";
        return Pattern.compile("'" + tok + "'|\"" + tok + "\"|" + tok);
    }

    /** Escapes a string for safe embedding inside a Groovy single-quoted string literal. */
    private static String escapeForGroovySingleQuoted(String s) {
        return s.replace("\\", "\\\\").replace("'", "\\'");
    }

    private static List<String> extractImports(String groovyBody) {
        List<String> imports = new ArrayList<>();
        Matcher m = IMPORT_PATTERN.matcher(groovyBody);
        while (m.find()) {
            String line = m.group().trim();
            if (!line.isBlank()) imports.add(line);
        }
        return imports;
    }

/** Returns 1-based line count of the current StringBuilder content. */
    private static int lineCount(StringBuilder sb) {
        int count = 1;
        for (int i = 0; i < sb.length(); i++) {
            if (sb.charAt(i) == '\n') count++;
        }
        return count;
    }

    private static String capitalize(String s) {
        if (s == null || s.isEmpty()) return s;
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    /**
     * Parses (but does not execute) the assembled script with {@link GroovyShell}.
     * On failure, looks up the error line in the blame map and throws
     * {@link CanvasExportException} naming the responsible widget.
     * Nothing has been written to disk at this point, so the previous export
     * state is preserved intact.
     */
    private static void compileCheck(String scriptText, Map<Integer, String> blame)
            throws CanvasExportException {
        try {
            ClassLoader cl = ScriptAssembler.class.getClassLoader();
            new GroovyShell(cl, new CompilerConfiguration()).parse(scriptText);
        } catch (CompilationFailedException e) {
            String errMsg   = e.getMessage();
            int    errLine  = extractErrorLine(errMsg);
            String widgetId = errLine > 0 ? blame.get(errLine) : null;

            String blame2 = widgetId != null
                    ? "Widget '" + widgetId + "' has a Groovy compile error: " + errMsg
                    : "Script assembly compile error: " + errMsg;

            throw new CanvasExportException(blame2, widgetId);
        }
    }

    private static int extractErrorLine(String errorMessage) {
        if (errorMessage == null) return -1;
        Matcher m = ERROR_LINE_PATTERN.matcher(errorMessage);
        return m.find() ? Integer.parseInt(m.group(1)) : -1;
    }
}
