package com.flowkraft.exploredata.export;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import com.sourcekraft.documentburster.common.reportparameters.BuiltinVariables;

/**
 * What a line of dashboard SQL uses, and whether that line applies.
 *
 * <p>A dashboard filter is written one condition per line, and a filter with no value is not a
 * filter: the line that uses it is left out and the query answers as if the filter were not there.
 * The published script has always done exactly that - {@code if (hasTo) { … }} around each line,
 * and {@code listHasValues} answering false for an empty list - and the canvas now asks the
 * database the same question through {@link #linesThatApply}. Both read the SQL with the parser
 * below, so there is one rule, in one place: change it here and the canvas and the dashboard it
 * was published as change together.
 *
 * <p>Only {@code ${p}} is a dashboard parameter, as in the script. The other placeholder forms
 * {@code DatabaseHelper} understands ({@code #{p}}, {@code @p@}) belong to report SQL, are never
 * written by the canvas, and are left alone here as they are there.
 */
public final class SqlParameterLines {

    private SqlParameterLines() {}

    /**
     * One line of SQL.
     *
     * @param text        the line as the user wrote it
     * @param jdbcText    the same line with every {@code ${p}} token replaced by a JDBC {@code ?};
     *                    for an IN-list line, the text before the brackets (e.g. {@code WHERE "id" IN})
     * @param params      the scalar parameters the line binds, in placeholder order, one entry per
     *                    placeholder - a parameter used twice is bound twice
     * @param inListParam the parameter this line spreads into an {@code IN (…)} list, or null
     */
    public record Line(String text, String jdbcText, List<String> params, String inListParam) {

        /** Every parameter the line needs a value for. */
        public List<String> used() {
            List<String> all = new ArrayList<>(params);
            if (inListParam != null && !all.contains(inListParam)) all.add(inListParam);
            return all;
        }
    }

    /**
     * Splits SQL into per-line records. Any {@code ${paramName}} token - including surrounding
     * single or double quotes, e.g. {@code '${p}'} - is a bind; a line ending in
     * {@code IN (${p})} or {@code NOT IN (${p})} is an IN-list line, whose text stops before the
     * brackets because the list's length is only known once the value is in. Lines with no
     * parameter are returned as they are. Trailing blank lines are stripped.
     */
    public static List<Line> split(String sql, Collection<String> paramNames) {
        List<String> names = List.copyOf(paramNames);
        List<Line> result = new ArrayList<>();
        Pattern scalarP = scalarTokenPattern(names);
        for (String rawLine : sql.stripTrailing().split("\n", -1)) {
            // The IN-list shape first: the prefix (operator + column, e.g. `WHERE "id"`) is what
            // the line contributes, and the runtime helper appends ` (?, ?, …)` to it.
            String inListParam = null;
            String processed = rawLine;
            for (String p : names) {
                Pattern inListP = Pattern.compile(
                    "^(.*?)\\s+(IN|NOT\\s+IN)\\s*\\(\\s*\\$\\{" + Pattern.quote(p) + "\\}\\s*\\)\\s*;?\\s*$",
                    Pattern.CASE_INSENSITIVE);
                Matcher m = inListP.matcher(rawLine);
                if (m.matches()) {
                    String prefix = m.group(1).trim();
                    String op = m.group(2).toUpperCase().replaceAll("\\s+", " ");
                    processed = prefix + " " + op; // e.g. `WHERE "id" IN`
                    inListParam = p;
                    break;
                }
            }
            List<String> lineParams = new ArrayList<>();
            processed = substituteScalars(processed, scalarP, lineParams);
            result.add(new Line(rawLine, processed, Collections.unmodifiableList(lineParams), inListParam));
        }
        return result;
    }

    /** A condition line: {@code WHERE …}, {@code AND …} or {@code OR …}, and what it opens with. */
    private static final Pattern CONNECTOR = Pattern.compile("(?i)^(\\s*)(WHERE|AND|OR)\\s+\\S[\\s\\S]*$");

    /**
     * The line as it reads when its filter is not applied: the condition replaced by one that is
     * always true, {@code WHERE 1=1} / {@code AND 1=1}, which every vendor this product supports
     * accepts. Null when the line is not a condition at all, and is then simply left out.
     *
     * <p>Why not drop the line outright: a query is written one condition per line and the first of
     * them carries the WHERE, so dropping that line leaves the next one opening with AND and the
     * database refusing the whole query. It is the same no-op the Visualize step already writes for
     * a filter whose value box is empty and for an empty IN list. A condition spread over several
     * lines is not covered - neither the canvas nor the script has ever written one.
     */
    public static String notAppliedForm(String lineText) {
        Matcher m = CONNECTOR.matcher(lineText);
        if (!m.matches()) return null;
        return m.group(1) + m.group(2) + " 1=1";
    }

    /**
     * The SQL as it reads with every filter that has no value not applied: each of those lines
     * becomes its {@link #notAppliedForm}, or is left out when it is not a condition. A parameter
     * that is not declared on the dashboard is not a filter and never touches a line.
     *
     * <p>Returns the SQL unchanged - the same bytes - when every parameter has a value, so the
     * ordinary case is the query the user wrote.
     */
    public static String linesThatApply(String sql, Collection<String> paramNames, Map<String, Object> values) {
        if (sql == null || sql.isBlank() || paramNames.isEmpty()) return sql;
        List<Line> lines = split(sql, paramNames);
        boolean anyDropped = false;
        List<String> kept = new ArrayList<>();
        for (Line line : lines) {
            // A line that uses a built-in is never left out, whatever its value is. An empty
            // ${dp_user_email} has to match no row; turning its line into `WHERE 1=1` would show
            // the viewer every row instead - the same leak the script's has<P> guard would be.
            // A dashboard parameter sharing the line loses the courtesy with it: the line is one
            // condition, and half a condition is not a safe thing to write.
            if (usesBuiltin(line.used())) {
                kept.add(line.text());
                continue;
            }
            boolean applies = true;
            for (String p : line.params()) {
                if (notApplied(values == null ? null : values.get(p))) applies = false;
            }
            if (line.inListParam() != null && listNotApplied(values == null ? null : values.get(line.inListParam())))
                applies = false;
            if (applies) {
                kept.add(line.text());
                continue;
            }
            anyDropped = true;
            String noop = notAppliedForm(line.text());
            if (noop != null) kept.add(noop);
        }
        return anyDropped ? String.join("\n", kept) : sql;
    }

    /** True when any of these names is the server's to fill - see {@link BuiltinVariables}. */
    public static boolean usesBuiltin(Collection<String> names) {
        return names != null && names.stream().anyMatch(BuiltinVariables::isBuiltinName);
    }

    /**
     * No value, so the filter is not applied. The script's {@code hasX} guard, in Java:
     * a parameter is either something or nothing, and whitespace is something (a filter on a
     * column whose value really is a space must stay possible).
     */
    public static boolean notApplied(Object value) {
        return value == null || value.toString().isEmpty();
    }

    /**
     * The same for a parameter spread into an {@code IN (…)} list, as {@code listHasValues} sees it:
     * nothing, or nothing but separators. The "all" wildcard {@code *} is not handled here - it is
     * a value that means every row, and {@code DatabaseHelper.convertToJdbiParameters} already
     * turns its clause into {@code 1=1}.
     */
    public static boolean listNotApplied(Object value) {
        if (notApplied(value)) return true;
        for (String item : value.toString().split(",")) {
            if (!item.trim().isEmpty()) return false;
        }
        return true;
    }

    /**
     * Matches one {@code ${p}} token of any declared param, together with what surrounds it:
     * {@code '${p}'} or {@code "${p}"} (quotes consumed, the value is bound), and an optional
     * leading backslash - {@code \${p}} surfaces when SQL is pasted from a TS template-literal
     * source where {@code \$} escapes the interpolation; Monaco keeps the backslash and it has no
     * meaning in SQL. Group 1, 2 or 3 holds the param name. Null when there are no params.
     */
    public static Pattern scalarTokenPattern(Collection<String> paramNames) {
        if (paramNames.isEmpty()) return null;
        String names = paramNames.stream().map(Pattern::quote).collect(Collectors.joining("|"));
        String tok = "\\\\?\\$\\{(" + names + ")\\}";
        return Pattern.compile("'" + tok + "'|\"" + tok + "\"|" + tok);
    }

    /**
     * Scalar param substitution: one left-to-right scan, so a param used twice is bound twice and
     * params bind in the order they appear, not the order they were defined
     * ({@code BETWEEN ${to} AND ${from}} must not swap the values). Each token becomes {@code ?};
     * its param name is appended to {@code params}.
     */
    public static String substituteScalars(String text, Pattern scalarP, List<String> params) {
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
}
