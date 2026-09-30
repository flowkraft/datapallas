package com.flowkraft.exploredata.export;

import com.flowkraft.embed.UserVariables;
import com.sourcekraft.documentburster.common.reportparameters.DateParameters;

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
 *   <li>Readable by a person — one statement per line, the SQL line by line, a short
 *       comment wherever a rule is not plain from the code, and helpers only when used.</li>
 *   <li>No variable collisions — each widget's {@code sql}, {@code params} and
 *       {@code data} live in its own {@code if} block (prefixed with the widget's
 *       component-ID only when a parameter already has one of those names).</li>
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

    /**
     * The names the published script gives its own helpers. A dashboard parameter becomes a script
     * variable of its own name, so it cannot take one of these.
     */
    private static final Set<String> HELPER_NAMES = Set.of(
            "asDeclaredType", "dayAfter", "listHasValues", "numberOrText", "addInList"
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
     *  before the IN clause) to be passed to the runtime {@code addInList} helper. */
    private record SqlLine(String text, List<String> params, String inListParam) {
        SqlLine(String text, List<String> params) { this(text, params, null); }
    }

    /**
     * What the script binds for one parameter: the value itself when the dashboard declared no type
     * for it — which is every parameter of every dashboard published before types were bound, so
     * their scripts are written exactly as they were — and the value through {@code asDeclaredType}
     * otherwise.
     */
    private static String bindExpression(String paramName, Map<String, String> paramTypes) {
        String type = paramTypes.get(paramName);
        return type == null ? paramName : "asDeclaredType('" + paramName + "', '" + type + "', " + paramName + ")";
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
                // A widget published as the cube itself has no SQL in the dashboard at all: the
                // viewer's questions are answered live, against the cube file, through the runtime
                // endpoints. It is left out here rather than further down so that nothing of it
                // reaches the data script - no block, no parameter binding, no builtin variable.
                // Unticked cube widgets are untouched: their SQL is frozen, as before.
                .filter(w -> !LiveCubeWidgets.isLive(w))
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
        List<Map<String, Object>> declaredParams =
                parametersList == null ? List.<Map<String, Object>>of() : parametersList;
        List<String> paramNames = declaredParams.stream()
                .map(p -> {
                    Object id = p.get("id");
                    return id instanceof String s ? s : null;
                })
                .filter(s -> s != null && !s.isBlank())
                // A dp_ name is the server's, never a dashboard's. It is refused when the parameters
                // spec is saved, so one can only reach here in a hand-edited file; dropping it keeps
                // the script from declaring the same name twice, and the server's value still wins
                // because the block below declares it from userVars anyway.
                .filter(name -> !UserVariables.isBuiltinName(name))
                .toList();

        // The type each parameter was declared with on the canvas ("Date", "Integer", …). Every
        // value reaches the script as text, so this is what a bind has to go through to become the
        // type the database expects — the same conversion the canvas path binds with.
        Map<String, String> paramTypes = new LinkedHashMap<>();
        for (Map<String, Object> declared : declaredParams) {
            Object id = declared.get("id");
            Object type = declared.get("type");
            if (id instanceof String name && !name.isBlank() && type instanceof String t && !t.isBlank())
                paramTypes.put(name, t);
        }

        // A date range of whole days ends at midnight after the last day, and the SQL the canvas
        // generated names that day as a parameter of its own (`${to__next_day}`). It is declared
        // beside the parameter it derives from, with the same declared type, and from there on it is
        // a parameter like any other: the line guard, the bind and the "no value, no filter" rule all
        // read it as one. The value itself comes from DateParameters - the conversion the canvas path
        // derives it with too, so a published dashboard and the canvas it came from ask the same
        // question.
        // Every query this dashboard runs, whichever way the author wrote it: a widget built on the
        // canvas asks its question through the SQL the builder generated for it, so a date range
        // drawn in the builder names its own day-after there and nowhere else. Read through
        // resolveSql, the one place that knows where a widget's SQL is - reading `sql` alone left a
        // visual date range with `${to__next_day}` standing in the statement.
        StringBuilder everyQuery = new StringBuilder();
        for (Map<String, Object> w : widgets) {
            String query = resolveSql(w);
            everyQuery.append(query != null ? query : "").append('\n')
                      .append(dsField(w, "script")).append('\n');
        }
        List<String> withDerived = new ArrayList<>(paramNames);
        for (String name : paramNames) {
            if (!DateParameters.isDayType(paramTypes.get(name)))
                continue;
            String derived = DateParameters.nextDayName(name);
            if (withDerived.contains(derived))
                continue;
            // Only what a widget actually asks for: a Date parameter used plainly - or given a list of
            // days for an IN - has no day after it, and nothing is written for it.
            if (!DateParameters.mentions(everyQuery.toString(), derived))
                continue;
            withDerived.add(derived);
            paramTypes.put(derived, paramTypes.get(name));
        }
        paramNames = withDerived;

        // ── The builtin variables ─────────────────────────────────────────────
        // ${dp_…} needs no declaration: whatever a widget's SQL names, the server sets on every
        // request (UserVariables), so the script declares each one it finds and binds it like any
        // other value. Sorted, so the same widgets always assemble to the same bytes.
        Set<String> builtinsUsed = new TreeSet<>();
        for (Map<String, Object> w : widgets) {
            String sqlOf = resolveSql(w);
            findBuiltinTokens(sqlOf, builtinsUsed);
            findBuiltinTokens(dsField(w, "script"), builtinsUsed);
        }
        if (!builtinsUsed.isEmpty()) {
            List<String> withBuiltins = new ArrayList<>(paramNames);
            for (String builtin : builtinsUsed) {
                if (!withBuiltins.contains(builtin))
                    withBuiltins.add(builtin);
                // Today is a date and now is a timestamp, so they are compared with a date and a
                // timestamp column rather than with their own text. Everything else is text.
                if (UserVariables.DATE_NAMES.contains(builtin))
                    paramTypes.put(builtin, "Date");
                else if (UserVariables.TIMESTAMP_NAMES.contains(builtin))
                    paramTypes.put(builtin, "Timestamp");
            }
            paramNames = withBuiltins;
        }

        // 4. Build script text + line-to-widget blame map
        //
        // The script is written for a person to read, as if by hand: one statement per line, the
        // SQL line by line, and a short comment wherever a rule is not plain from the code itself.
        // Each helper is written above the widgets with a comment saying what it does, and only
        // when some widget calls it.
        StringBuilder sb          = new StringBuilder();
        Map<Integer, String> blame = new LinkedHashMap<>();

        // What the widgets' SQL needs, known before anything is written.
        Map<Map<String, Object>, List<SqlLine>> linesOf = new IdentityHashMap<>();
        boolean anyList = false;
        boolean anyFilterList = false;
        for (Map<String, Object> w : widgets) {
            if ("script".equals(dsField(w, "mode"))) continue;
            String sqlOf = resolveSql(w);
            if (sqlOf == null || sqlOf.isBlank()) continue;
            List<SqlLine> lines = analyzeSqlLines(sqlOf, paramNames);
            linesOf.put(w, lines);
            for (SqlLine l : lines) {
                if (l.inListParam() == null) continue;
                anyList = true;
                if (!SqlParameterLines.usesBuiltin(used(l))) anyFilterList = true;
            }
        }
        boolean anyTyped  = paramNames.stream().anyMatch(paramTypes::containsKey);
        boolean anyDayAfter = paramNames.stream().anyMatch(DateParameters::isNextDayName);

        // A parameter becomes a script variable of the same name, so one named like a helper would
        // be declared twice. Refused here, in words, rather than by the Groovy compiler.
        for (String name : paramNames) {
            if (HELPER_NAMES.contains(name))
                throw new CanvasExportException("The parameter '" + name + "' has the name of a helper"
                        + " the published script defines; please give the parameter another name.", null);
        }

        // Each SQL widget's block keeps its own `sql`, `params` and `data`. Only when a dashboard
        // parameter already has one of those names do they carry the widget's name as well.
        boolean plainLocals = Collections.disjoint(paramNames, List.of("sql", "params", "data"));

        if (anyTyped) hoistedImports.add("import com.sourcekraft.documentburster.common.reportparameters.ParameterTypes");
        if (anyDayAfter) hoistedImports.add("import com.sourcekraft.documentburster.common.reportparameters.DateParameters");

        // ── Header ────────────────────────────────────────────────────────────
        sb.append("// AUTO-GENERATED by CanvasExportService. DO NOT EDIT MANUALLY.\n");
        sb.append("// Regenerated on every Save-to-DataPallas.\n");
        sb.append("//\n");
        sb.append("// Fetches the data of the dashboard's widgets, one block per widget. An SQL widget builds its\n");
        sb.append("// query line by line, and every value reaches the database as a ? parameter, never pasted\n");
        sb.append("// into the SQL text.\n\n");

        sb.append("import groovy.sql.Sql\n");
        for (String imp : hoistedImports) sb.append(imp.trim()).append("\n");
        sb.append("\n");

        sb.append("// componentId names the one widget asking for its data (none: every widget).\n");
        sb.append("// userVars holds the filter values, and the values the server sets for the viewer.\n");
        sb.append("def dbSql       = ctx.dbSql\n");
        sb.append("def componentId = ctx.variables?.get('componentId')\n");
        sb.append("def userVars    = ctx.variables.getUserVariables(ctx.token ?: '')\n");
        sb.append("\n");

        // ── Declared-type conversion ──────────────────────────────────────────
        // The same ParameterTypes the canvas path binds through, so a published dashboard and the
        // canvas it was published from ask the database the same question. A parameter with no
        // declared type is never handed to it: the generator writes the bare value.
        if (anyTyped) {
            sb.append("// Converts a filter value from text to the type the dashboard declared for it (Date,\n");
            sb.append("// Integer, ...), so the database compares a date with a date and a number with a number.\n");
            sb.append("// An empty value stays empty.\n");
            sb.append("def asDeclaredType = { String name, String type, value ->\n");
            sb.append("    if (value == null || value.toString().isEmpty()) {\n");
            sb.append("        return value\n");
            sb.append("    }\n");
            sb.append("    return ParameterTypes.typed(name, type, value.toString())\n");
            sb.append("}\n\n");
        }

        // ── The day after a Date parameter ────────────────────────────────────
        // The upper bound of a range of whole days, derived from the parameter it follows and never
        // written in SQL (nine vendors, nine texts for "+ 1 day").
        if (anyDayAfter) {
            sb.append("// The day after a date: where a range of whole days ends, so that its last day counts\n");
            sb.append("// in full. An empty value stays empty.\n");
            sb.append("def dayAfter = { String name, String type, value ->\n");
            sb.append("    if (value == null || value.toString().isEmpty()) {\n");
            sb.append("        return value\n");
            sb.append("    }\n");
            sb.append("    return DateParameters.nextDay(name, type, value.toString())\n");
            sb.append("}\n\n");
        }

        // ── IN lists ──────────────────────────────────────────────────────────
        // `IN (${p})` cannot bind a comma-separated value as one ? (PostgreSQL refuses integer =
        // varchar), so the list is spread into one ? per item at run time. Long → Double → String
        // mirrors QueriesService, so numeric columns get number binds.
        if (anyFilterList) {
            sb.append("// A list filter is off when it has no values, or when it is '*' (all values).\n");
            sb.append("def listHasValues = { listValue ->\n");
            sb.append("    def text = listValue.toString().trim()\n");
            sb.append("    if (text == '*') {\n");
            sb.append("        return false\n");
            sb.append("    }\n");
            sb.append("    return text.split(',').any { it.trim() }\n");
            sb.append("}\n\n");
        }
        if (anyList) {
            sb.append("// A list item with no declared type is sent as a whole number, a decimal or text,\n");
            sb.append("// whichever it reads as.\n");
            sb.append("def numberOrText = { String item ->\n");
            sb.append("    try {\n");
            sb.append("        return Long.parseLong(item)\n");
            sb.append("    } catch (NumberFormatException notWhole) {\n");
            sb.append("        try {\n");
            sb.append("            return Double.parseDouble(item)\n");
            sb.append("        } catch (NumberFormatException notANumber) {\n");
            sb.append("            return item\n");
            sb.append("        }\n");
            sb.append("    }\n");
            sb.append("}\n\n");
            sb.append("// Adds the line with its list, `... IN (?, ?, ?)`, one ? per comma-separated item, and\n");
            sb.append("// sends the items as the values of those ?s: each through `convert` when one is given.\n");
            sb.append("// A list with no items still gets one, an empty one, which matches no row: that only\n");
            sb.append("// happens for a list the server sets for the viewer, such as their groups.\n");
            sb.append("def addInList = { sql, params, listValue, lineBeforeList, convert = null ->\n");
            sb.append("    def items = (listValue ?: '').toString().split(',').collect { it.trim() }.findAll { it }\n");
            sb.append("    if (items.isEmpty()) {\n");
            sb.append("        items = ['']\n");
            sb.append("    }\n");
            sb.append("    sql << lineBeforeList + ' (' + items.collect { '?' }.join(', ') + ')\\n'\n");
            sb.append("    items.each { item ->\n");
            sb.append("        params << (convert ? convert(item) : numberOrText(item))\n");
            sb.append("    }\n");
            sb.append("}\n\n");
        }

        // ── Canvas parameters ─────────────────────────────────────────────────
        List<String> filterParams = paramNames.stream().filter(p -> !UserVariables.isBuiltinName(p)).toList();
        List<String> serverParams = paramNames.stream().filter(UserVariables::isBuiltinName).toList();
        if (!filterParams.isEmpty()) {
            sb.append("// ─── Filter values: an empty one turns its filter off ───\n");
            for (String paramName : filterParams) {
                if (DateParameters.isNextDayName(paramName)) {
                    // Derived, not read from the filter bar: the day after the one it follows.
                    String base = DateParameters.baseName(paramName);
                    sb.append("def ").append(paramName)
                      .append(" = dayAfter('").append(base).append("', '")
                      .append(paramTypes.get(paramName)).append("', ").append(base).append(")\n");
                } else {
                    sb.append("def ").append(paramName)
                      .append(" = userVars?.get('").append(paramName).append("')?.toString()\n");
                }
                sb.append("def has").append(capitalize(paramName))
                  .append(" = (").append(paramName)
                  .append(" != null && !").append(paramName).append(".isEmpty())\n");
            }
            sb.append("\n");
        }
        // A builtin gets no has<P> at all: see the emission of its lines below.
        if (!serverParams.isEmpty()) {
            sb.append("// ─── Set by the server for the viewer, never by the request ───\n");
            sb.append("// An empty one still filters: it matches no row.\n");
            for (String paramName : serverParams) {
                sb.append("def ").append(paramName)
                  .append(" = userVars?.get('").append(paramName).append("')?.toString()\n");
            }
            sb.append("\n");
        }

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
                List<SqlLine> sqlLines = linesOf.get(w);

                if (sqlLines == null) {
                    sb.append("// ─── Widget: ").append(compId)
                      .append(" (type=").append(wtype).append(") — no data source configured ───\n");
                } else {
                    String vp   = varPrefix(compId);
                    String sql  = plainLocals ? "sql"    : vp + "_sql";
                    String prms = plainLocals ? "params" : vp + "_params";
                    String data = plainLocals ? "data"   : vp + "_data";
                    boolean hasCond = sqlLines.stream().anyMatch(l -> !used(l).isEmpty());
                    // True while no line is sure to be written: only then can the query end up empty.
                    boolean canBeEmpty = true;

                    sb.append("// ─── Widget: ").append(compId)
                      .append(" (type=").append(wtype)
                      .append(", dataSource=").append(mode).append(") ───\n");
                    sb.append("if (!componentId || componentId == '").append(compId).append("') {\n");
                    sb.append("    def ").append(sql).append(" = new StringBuilder()\n");
                    if (hasCond) {
                        sb.append("    def ").append(prms).append(" = []\n");
                    }
                    for (SqlLine sl : sqlLines) {
                        List<String> used = used(sl);
                        if (used.isEmpty()) {
                            sb.append("    ").append(sql).append(" << '")
                              .append(escapeForGroovySingleQuoted(sl.text())).append("\\n'\n");
                            canBeEmpty = false;
                        } else if (SqlParameterLines.usesBuiltin(used)) {
                            // A line that uses a builtin is never behind a has<P> guard (a security
                            // rule): the guard means "no value, no filter", and for
                            // `WHERE email = ${dp_user_email}` asked by a person with no email that
                            // would drop the WHERE and show every row. Written unconditionally, the
                            // empty value binds as empty and matches nothing. A dashboard parameter
                            // sharing the line loses its guard with it - the line is one condition,
                            // and half a condition is not a safe thing to write. Likewise an empty
                            // ${dp_user_groups} list binds one empty item instead of dropping the
                            // clause, and a '*' in it is a group named '*', not "all".
                            List<String> builtins = used.stream().filter(UserVariables::isBuiltinName).toList();
                            sb.append("    // Always applied: ").append(String.join(" and ", builtins))
                              .append(builtins.size() == 1 ? " is" : " are").append(" set by the server, and an empty ")
                              .append(sl.inListParam() != null ? "list" : "value").append(" matches no row\n");
                            appendLineWithValues(sb, "    ", sql, prms, sl, paramTypes);
                            canBeEmpty = false;
                        } else {
                            // No value, no filter - and the line keeps the query whole by asking
                            // something always true (`WHERE 1=1`) instead of vanishing and leaving the
                            // next line opening with AND. SqlParameterLines.notAppliedForm is that
                            // rule, the one the canvas applies to the same SQL.
                            String condition = guard(paramNames, used);
                            if (sl.inListParam() != null)
                                condition += " && listHasValues(" + sl.inListParam() + ")";
                            String noop = SqlParameterLines.notAppliedForm(sl.text());
                            sb.append("    if (").append(condition).append(") {\n");
                            appendLineWithValues(sb, "        ", sql, prms, sl, paramTypes);
                            if (noop != null) {
                                sb.append("    } else {\n");
                                sb.append("        ").append(sql).append(" << '")
                                  .append(escapeForGroovySingleQuoted(noop)).append("\\n'   // ")
                                  .append(sl.inListParam() != null ? "no values, or '*' (all)" : "no value")
                                  .append(": this filter is off\n");
                                canBeEmpty = false;
                            }
                            sb.append("    }\n");
                        }
                    }
                    String run = prms + ".isEmpty() ? dbSql.rows(" + sql + ".toString()) : dbSql.rows("
                            + sql + ".toString(), " + prms + ")";
                    if (!hasCond) {
                        sb.append("    def ").append(data).append(" = dbSql.rows(").append(sql).append(".toString())\n");
                    } else if (canBeEmpty) {
                        sb.append("    def ").append(data).append(" = []   // no rows when every line of the query is a filter that is off\n");
                        sb.append("    if (").append(sql).append(".length() > 0) {\n");
                        sb.append("        ").append(data).append(" = ").append(run).append("\n");
                        sb.append("    }\n");
                    } else {
                        sb.append("    def ").append(data).append(" = ").append(run).append("\n");
                    }
                    sb.append("    ctx.reportData('").append(compId).append("', ").append(data).append(")\n");
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
     *
     * <p>Package-private rather than private so a test in this package can name a widget the way
     * the dashboard names it: the Dashboard Demos' claims are written against widget ids, and the
     * rows a published dashboard reports are keyed by this.
     */
    static String componentId(Map<String, Object> widget) {
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
     * Splits user SQL into per-line records, through {@link SqlParameterLines} - the one parser
     * the canvas reads the same SQL with, so what a line uses, and therefore when it applies, is
     * decided once for the dashboard and for the canvas it was published from.
     */
    private static List<SqlLine> analyzeSqlLines(String sql, List<String> paramNames) {
        List<SqlLine> result = new ArrayList<>();
        for (SqlParameterLines.Line line : SqlParameterLines.split(sql, paramNames)) {
            result.add(new SqlLine(line.jdbcText(), line.params(), line.inListParam()));
        }
        return result;
    }


    /** Matches one {@code ${dp_…}} token — the reserved namespace, whatever the name after it. */
    private static final Pattern BUILTIN_TOKEN = Pattern.compile("\\$\\{(" + UserVariables.PREFIX + "[a-z0-9_]+)\\}");

    /** Collects every builtin variable a piece of SQL (or user Groovy) names. */
    private static void findBuiltinTokens(String text, Set<String> into) {
        if (text == null || text.isBlank()) return;
        Matcher m = BUILTIN_TOKEN.matcher(text);
        while (m.find()) into.add(m.group(1));
    }

    /** Every parameter a line uses: its scalars, and the one spread into its IN list. */
    private static List<String> used(SqlLine line) {
        if (line.inListParam() == null) return line.params();
        List<String> all = new ArrayList<>(line.params());
        all.add(line.inListParam());
        return all;
    }

    /**
     * One SQL line and the values of its {@code ?}s, one statement per line: the line, then one
     * {@code params << value} per placeholder in the order they appear. A line with an IN list
     * sends the values written before the list first, then {@code addInList} writes the line with
     * its list and sends one value per item, each through the declared type when there is one.
     */
    private static void appendLineWithValues(StringBuilder sb, String indent, String sql, String params,
                                             SqlLine line, Map<String, String> paramTypes) {
        String text = escapeForGroovySingleQuoted(line.text());
        if (line.inListParam() == null)
            sb.append(indent).append(sql).append(" << '").append(text).append("\\n'\n");
        for (String p : line.params())
            sb.append(indent).append(params).append(" << ").append(bindExpression(p, paramTypes)).append("\n");
        if (line.inListParam() == null)
            return;
        String list = line.inListParam();
        sb.append(indent).append("addInList(").append(sql).append(", ").append(params).append(", ")
          .append(list).append(", '").append(text).append("')");
        String type = paramTypes.get(list);
        if (type != null)
            sb.append(" { asDeclaredType('").append(list).append("', '").append(type).append("', it) }");
        sb.append("\n");
    }

    /** {@code hasA && hasB} — each param the line uses, once, in definition order. */
    private static String guard(List<String> paramNames, Collection<String> used) {
        return paramNames.stream().filter(used::contains)
                .map(p -> "has" + capitalize(p)).collect(Collectors.joining(" && "));
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
