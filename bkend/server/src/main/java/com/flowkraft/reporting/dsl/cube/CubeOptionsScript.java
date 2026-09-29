package com.flowkraft.reporting.dsl.cube;

import com.sourcekraft.documentburster.common.reportparameters.ParamRef;

import groovy.lang.Script;
import groovy.lang.Closure;

import java.util.*;

/**
 * Groovy DSL base for parsing Cube semantic model definitions.
 *
 * DESIGN PRINCIPLES:
 * 1. Uses standard OLAP/BI terminology (dimensions, measures, joins, segments,
 *    hierarchies) — the same vocabulary used by Cube.dev, Looker, Power BI,
 *    Tableau, and dbt since the 1990s.
 * 2. Each dimension/measure/join/segment uses a methodMissing catch-all so that
 *    ANY property works automatically without code changes here.
 * 3. The cube defines WHAT data means (semantic model). Downstream DSLs (tabulator,
 *    chart, pivotTable) define HOW to display it.
 * 4. ${CUBE} is a self-reference placeholder (Cube.js convention) that survives
 *    into the output and gets replaced at query generation time.
 *
 * Usage:
 *   cube {
 *     sql_table 'public.orders'
 *     title 'Orders'
 *     dimension { name 'status'; sql '${CUBE}.status'; type 'string' }
 *     measure { name 'count'; type 'count' }
 *     join { name 'customers'; sql '${CUBE}.customer_id = customers.id'; relationship 'many_to_one' }
 *   }
 */
public abstract class CubeOptionsScript extends Script {

    private final CubeBuilder builder = new CubeBuilder();

    // Named blocks: id → options map
    private final Map<String, Map<String, Object>> namedOptions = new LinkedHashMap<>();

    // DSL root — unnamed (default)
    public void cube(Closure<?> body) {
        body.setDelegate(builder);
        body.setResolveStrategy(Closure.DELEGATE_FIRST);
        body.call();
    }

    // DSL root — named block for multi-cube reports
    public void cube(String id, Closure<?> body) {
        CubeBuilder named = new CubeBuilder();
        body.setDelegate(named);
        body.setResolveStrategy(Closure.DELEGATE_FIRST);
        body.call();
        namedOptions.put(id, named.getOptions());
    }

    /** Return final options map */
    public Map<String, Object> getOptions() {
        return builder.getOptions();
    }

    /** Return named options map (id → options) for multi-cube reports */
    public Map<String, Map<String, Object>> getNamedOptions() {
        return namedOptions;
    }

    @Override
    public Object run() { return null; }

    // ═══════════════════════════════════════════════════════════════════════════
    // CubeBuilder — shared by unnamed root and named blocks (eliminates duplication)
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Builds a single cube definition. Both the unnamed root cube and each named
     * cube block use an instance of this class — no code duplication.
     * Exposes CUBE as a property so ${CUBE} in GStrings resolves to the literal
     * placeholder string "${CUBE}".
     */
    static class CubeBuilder {
        private String sqlTable;
        private String sql;
        private String sqlAlias;
        private String extends_;
        private String title;
        private String description;
        private Boolean public_ = null;
        private Map<String, Object> meta = null;
        private String accessFilter = null;
        private int accessFilters = 0;
        private String currency = null;
        private final List<Map<String, Object>> dimensions = new ArrayList<>();
        private final List<Map<String, Object>> measures = new ArrayList<>();
        private final List<Map<String, Object>> joins = new ArrayList<>();
        private final List<Map<String, Object>> segments = new ArrayList<>();
        private final List<Map<String, Object>> hierarchies = new ArrayList<>();
        private final List<Map<String, Object>> conditions = new ArrayList<>();

        // ${CUBE} self-reference placeholder — survives into output
        public String getCUBE() { return "${CUBE}"; }

        // Data source
        public void sql_table(String table) { this.sqlTable = table; }
        public void sql(String query) { this.sql = query; }
        public void sql_alias(String alias) { this.sqlAlias = alias; }
        public void extends_(String parent) { this.extends_ = parent; }

        // Cube-level metadata
        public void title(String t) { this.title = t; }
        public void description(String d) { this.description = d; }
        public void public_(boolean b) { this.public_ = b; }
        public void meta(Map<String, Object> m) { this.meta = m != null ? new LinkedHashMap<>(m) : null; }

        /** The money this cube's amounts are in, as an ISO 4217 code: {@code currency 'EUR'}. */
        public void currency(String code) { this.currency = code; }

        /**
         * The cube's row filter: one SQL condition every SELECT over this cube carries.
         *
         * <p>Written twice, the second call would replace the first — a row filter that quietly
         * stops hiding what it was written to hide. So every call is counted, the first condition
         * is the one kept, and {@code CubeRules} turns the count into an error telling the author
         * to write one condition with AND or OR.
         */
        public void access_filter(String condition) {
            accessFilters++;
            if (accessFilter == null) accessFilter = condition;
        }

        /**
         * One condition on the rows this cube answers over, in two forms (R1).
         *
         * <p>A cube declares no parameters of its own: a dashboard declares them, in one place, its
         * {@code -report-parameters-spec.groovy}, and a cube only <i>uses</i> the names — the same
         * link an SQL widget has always had. The builtin {@code dp_} names come from the server.
         *
         * <p><b>Raw:</b> {@code condition '${CUBE}.order_date >= ${fromDate}'} — any SQL a WHERE
         * allows. It may be written over several lines, and is read into one, because a parameter
         * with no value drops its own line out of the WHERE and leaves the rest of the question
         * standing ({@code SqlParameterLines}, and the published script's {@code has<P>} guard).
         *
         * <p><b>Native:</b> {@code condition 'OrderDate', 'between', fromDate, toDate} — a member
         * of this cube, one of the structured query's own operator names, and its values. A bare
         * name is a reference to a dashboard parameter or a builtin, exactly as {@code min:
         * fromDate} is in the parameters DSL; it is kept as the {@code ${name}} the binder reads.
         * A value in quotes is a literal.
         *
         * <p><b>Which form to write.</b> The native one is added to the query exactly as the
         * viewer's own filter on that member is, so it knows what the member is: a condition on a
         * measure becomes a HAVING, and a range on a time dimension moves with a
         * {@code time_shift} measure, which asks the same period one interval earlier. The raw
         * one is SQL text and moves with nothing: written against a date column beside a
         * {@code time_shift} measure, the earlier period is asked the very same dates. Write the
         * native form for anything a member can say, and the raw one for what it cannot.
         */
        public void condition(String sql) {
            Map<String, Object> condition = new LinkedHashMap<>();
            condition.put("sql", folded(sql));
            conditions.add(condition);
        }

        public void condition(String member, String operator, Object... values) {
            Map<String, Object> condition = new LinkedHashMap<>();
            condition.put("member", member);
            condition.put("operator", operator);
            List<Object> named = new ArrayList<>();
            if (values != null) {
                for (Object value : values) named.add(value instanceof ParamRef
                        ? "${" + ((ParamRef) value).name + "}"
                        : value);
            }
            condition.put("values", named);
            conditions.add(condition);
        }

        /**
         * A bare name inside the cube body — {@code fromDate}, {@code dp_user_email} — as a
         * reference to it, the way the parameters DSL reads {@code min: fromDate}. Groovy asks the
         * delegate for it before it fails, which is what makes the native {@code condition} read
         * like the question it is.
         */
        public Object propertyMissing(String name) {
            return new ParamRef(name);
        }

        /**
         * The condition on one line: every run of whitespace, newlines included, becomes one space.
         *
         * <p>Written over several lines a condition reads better, and bound it has to be one line:
         * the empty-value rule works line by line. Folding here is the one place that happens, so
         * the text {@code CubeRules} checks and the text the generator writes are the same text.
         */
        private static String folded(String sql) {
            return sql == null ? null : sql.trim().replaceAll("\\s+", " ");
        }

        // Dimension — closure form
        public void dimension(Closure<?> body) {
            Map<String, Object> dim = new LinkedHashMap<>();
            MemberDelegate d = new MemberDelegate(dim);
            body.setDelegate(d);
            body.setResolveStrategy(Closure.DELEGATE_FIRST);
            body.call();
            dimensions.add(dim);
        }
        public void dimension(Map<String, Object> args) {
            if (args != null) dimensions.add(new LinkedHashMap<>(args));
        }

        // Measure — closure form
        public void measure(Closure<?> body) {
            Map<String, Object> meas = new LinkedHashMap<>();
            MemberDelegate d = new MemberDelegate(meas);
            body.setDelegate(d);
            body.setResolveStrategy(Closure.DELEGATE_FIRST);
            body.call();
            measures.add(meas);
        }
        public void measure(Map<String, Object> args) {
            if (args != null) measures.add(new LinkedHashMap<>(args));
        }

        // Join — closure form
        public void join(Closure<?> body) {
            Map<String, Object> j = new LinkedHashMap<>();
            MemberDelegate d = new MemberDelegate(j);
            body.setDelegate(d);
            body.setResolveStrategy(Closure.DELEGATE_FIRST);
            body.call();
            joins.add(j);
        }
        public void join(Map<String, Object> args) {
            if (args != null) joins.add(new LinkedHashMap<>(args));
        }

        // Segment — closure form
        public void segment(Closure<?> body) {
            Map<String, Object> seg = new LinkedHashMap<>();
            MemberDelegate d = new MemberDelegate(seg);
            body.setDelegate(d);
            body.setResolveStrategy(Closure.DELEGATE_FIRST);
            body.call();
            segments.add(seg);
        }
        public void segment(Map<String, Object> args) {
            if (args != null) segments.add(new LinkedHashMap<>(args));
        }

        // Hierarchy — closure form
        public void hierarchy(Closure<?> body) {
            Map<String, Object> h = new LinkedHashMap<>();
            HierarchyDelegate d = new HierarchyDelegate(h);
            body.setDelegate(d);
            body.setResolveStrategy(Closure.DELEGATE_FIRST);
            body.call();
            hierarchies.add(h);
        }
        public void hierarchy(Map<String, Object> args) {
            if (args != null) hierarchies.add(new LinkedHashMap<>(args));
        }

        /** Return final options map */
        public Map<String, Object> getOptions() {
            Map<String, Object> out = new LinkedHashMap<>();
            if (sqlTable != null) out.put("sql_table", sqlTable);
            if (sql != null) out.put("sql", sql);
            if (sqlAlias != null) out.put("sql_alias", sqlAlias);
            if (extends_ != null) out.put("extends", extends_);
            if (title != null) out.put("title", title);
            if (description != null) out.put("description", description);
            if (public_ != null) out.put("public", public_);
            if (meta != null) out.put("meta", new LinkedHashMap<>(meta));
            if (accessFilter != null) out.put("access_filter", accessFilter);
            if (currency != null) out.put("currency", currency);
            if (accessFilters > 1) out.put("access_filter_count", accessFilters);
            if (!dimensions.isEmpty()) out.put("dimensions", new ArrayList<>(dimensions));
            if (!measures.isEmpty()) out.put("measures", new ArrayList<>(measures));
            if (!joins.isEmpty()) out.put("joins", new ArrayList<>(joins));
            if (!segments.isEmpty()) out.put("segments", new ArrayList<>(segments));
            if (!hierarchies.isEmpty()) out.put("hierarchies", new ArrayList<>(hierarchies));
            if (!conditions.isEmpty()) out.put("conditions", new ArrayList<>(conditions));
            return out;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Inner delegates
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Delegate for dimension/measure/join/segment blocks — captures any property
     * via methodMissing. Explicit methods handle structured properties:
     * - drill_members (varargs list)
     * - filters (list of filter objects)
     * - case_ (conditional when/else blocks)
     * - Closures are evaluated into nested maps (e.g. geo: latitude { sql '...' })
     */
    static class MemberDelegate {
        private final Map<String, Object> map;
        MemberDelegate(Map<String, Object> map) { this.map = map; }

        // ${CUBE} self-reference placeholder
        public String getCUBE() { return "${CUBE}"; }

        // drill_members 'order_id', 'status', 'created_at' → List<String>
        public void drill_members(String... members) {
            if (members != null) map.put("drill_members", new ArrayList<>(Arrays.asList(members)));
        }
        public void drill_members(List<String> members) {
            if (members != null) map.put("drill_members", new ArrayList<>(members));
        }

        // filters { filter sql: "..." } → List<Map>
        public void filters(Closure<?> body) {
            FiltersDelegate d = new FiltersDelegate();
            body.setDelegate(d);
            body.setResolveStrategy(Closure.DELEGATE_FIRST);
            body.call();
            map.put("filters", d.getFilters());
        }
        @SuppressWarnings("unchecked")
        public void filters(List<Map<String, Object>> filterList) {
            if (filterList != null) map.put("filters", new ArrayList<>(filterList));
        }

        // case_ { when sql: '...', label: '...'; else_ label: '...' }
        public void case_(Closure<?> body) {
            CaseDelegate d = new CaseDelegate();
            body.setDelegate(d);
            body.setResolveStrategy(Closure.DELEGATE_FIRST);
            body.call();
            map.put("case", d.toMap());
        }

        // Catch-all for any other property
        public Object methodMissing(String name, Object args) {
            if (args instanceof Object[]) {
                Object[] arr = (Object[]) args;
                if (arr.length == 1 && arr[0] instanceof Closure) {
                    Map<String, Object> subMap = new LinkedHashMap<>();
                    MemberDelegate sub = new MemberDelegate(subMap);
                    Closure<?> c = (Closure<?>) arr[0];
                    c.setDelegate(sub);
                    c.setResolveStrategy(Closure.DELEGATE_FIRST);
                    c.call();
                    map.put(name, subMap);
                } else if (arr.length > 0) {
                    map.put(name, arr[0]);
                }
            } else {
                map.put(name, args);
            }
            return null;
        }
    }

    /**
     * Delegate for measure filters block:
     *   filters { filter sql: "${CUBE}.status = 'completed'" }
     */
    /** Convert GStrings to Strings in a map so downstream Java code can cast safely */
    private static Map<String, Object> stringifyMap(Map<String, Object> map) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : map.entrySet()) {
            Object v = e.getValue();
            out.put(e.getKey(), v instanceof CharSequence ? v.toString() : v);
        }
        return out;
    }

    private static class FiltersDelegate {
        private final List<Map<String, Object>> filters = new ArrayList<>();

        // ${CUBE} self-reference placeholder
        public String getCUBE() { return "${CUBE}"; }

        public void filter(Map<String, Object> args) {
            if (args != null) filters.add(stringifyMap(args));
        }

        public List<Map<String, Object>> getFilters() { return filters; }
    }

    /**
     * Delegate for dimension case_ blocks — conditional value mapping:
     *   case_ {
     *     when sql: '${CUBE}.priority = 1', label: 'High'
     *     else_ label: 'Low'
     *   }
     */
    private static class CaseDelegate {
        private final List<Map<String, Object>> whens = new ArrayList<>();
        private Map<String, Object> elseClause = null;

        // ${CUBE} self-reference placeholder
        public String getCUBE() { return "${CUBE}"; }

        public void when(Map<String, Object> args) {
            if (args != null) whens.add(stringifyMap(args));
        }

        public void else_(Map<String, Object> args) {
            if (args != null) elseClause = stringifyMap(args);
        }

        public Map<String, Object> toMap() {
            Map<String, Object> out = new LinkedHashMap<>();
            if (!whens.isEmpty()) out.put("when", new ArrayList<>(whens));
            if (elseClause != null) out.put("else", elseClause);
            return out;
        }
    }

    /**
     * Delegate for hierarchy blocks — handles 'levels' as a varargs list.
     */
    private static class HierarchyDelegate {
        private final Map<String, Object> map;
        HierarchyDelegate(Map<String, Object> map) { this.map = map; }

        public void levels(String... dims) {
            if (dims != null) map.put("levels", new ArrayList<>(Arrays.asList(dims)));
        }
        public void levels(List<String> dims) {
            if (dims != null) map.put("levels", new ArrayList<>(dims));
        }

        public Object methodMissing(String name, Object args) {
            if (args instanceof Object[] && ((Object[]) args).length > 0) {
                map.put(name, ((Object[]) args)[0]);
            } else {
                map.put(name, args);
            }
            return null;
        }
    }
}
