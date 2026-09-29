package com.flowkraft.reporting.dsl.cube;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Parsed Cube DSL result — semantic model defining dimensions, measures, and joins.
 *
 * Borrows standard OLAP/BI terminology (dimensions, measures, joins) to provide
 * a semantic layer over raw SQL tables. The cube defines WHAT the data means;
 * downstream components (Tabulator, Chart, PivotTable) define HOW to display it.
 *
 * A cube can reference data via {@code sql_table} (simple table name) or
 * {@code sql} (arbitrary SQL query). Dimensions are categorical/time attributes,
 * measures are aggregations, and joins define relationships to other cubes.
 */
public class CubeOptions {

    // Data source: one of sql_table or sql
    private String sqlTable;
    private String sql;
    private String sqlAlias;

    // Inheritance: name of parent cube to extend
    private String extends_;

    // Cube-level metadata
    private String title;
    private String description;
    private Boolean public_ = true;  // defaults to visible
    private Map<String, Object> meta = new LinkedHashMap<>();

    /**
     * The row filter every SELECT over this cube carries: {@code access_filter '<SQL condition>'}.
     *
     * <p>Optional, and at most one per cube. It is any valid SQL condition, and it may name
     * {@code ${CUBE}}, the joined tables and the {@code ${dp_…}} variables of whoever is asking.
     * The generator puts it, in its own brackets, into the WHERE of every SELECT it writes for
     * this cube, so an {@code OR} inside it cannot swallow the conditions next to it.
     */
    private String accessFilter;

    /**
     * How many {@code access_filter} lines the author wrote. More than one is a mistake — the
     * second would silently replace the first, which for a row filter means showing rows the
     * first one hid — and {@link CubeRules} reports it as an {@code error}. The first one is the
     * one kept, so the narrower answer stands until the author fixes the file.
     */
    private int accessFilterCount;

    /**
     * The money this cube's amounts are in: {@code currency 'EUR'}, an ISO 4217 code.
     *
     * <p>It belongs to the cube and not to each measure because a cube reads one database, and a
     * column of amounts in that database is in one currency; writing it once means a measure only
     * has to say {@code format 'currency'} and a number is shown as money without every measure
     * repeating which money.
     *
     * <p>The default is {@code USD}, because a formatter has to be handed some code and there is
     * no way to guess one: the viewer's locale says where the viewer is, not what the numbers are.
     * A cube whose amounts are not dollars says so in one line.
     */
    private String currency = "USD";

    // Semantic members
    private List<Map<String, Object>> dimensions = new ArrayList<>();
    private List<Map<String, Object>> measures = new ArrayList<>();
    private List<Map<String, Object>> joins = new ArrayList<>();
    private List<Map<String, Object>> segments = new ArrayList<>();
    private List<Map<String, Object>> hierarchies = new ArrayList<>();

    /**
     * The cube's own conditions (R1): one {@code condition} per entry, each either raw
     * ({@code {sql: "…"}}, already folded onto one line) or native
     * ({@code {member: …, operator: …, values: […]}}).
     *
     * <p>A cube declares no parameters: a dashboard declares them, and a condition only uses the
     * names. The generator writes each one into the WHERE — a native one on a measure into the
     * HAVING — of every SELECT over this cube and leaves each {@code ${name}} standing, exactly as
     * it leaves a {@code ${dp_…}} standing: the values are bound afterwards, and a dashboard
     * parameter with no value takes its own line with it.
     */
    private List<Map<String, Object>> conditions = new ArrayList<>();

    // Named blocks for multi-cube reports
    private Map<String, CubeOptions> namedOptions = new LinkedHashMap<>();

    // What CubeRules found in the whole file: one entry per problem, on the top-level cube only
    private List<Map<String, Object>> warnings = new ArrayList<>();

    // Which folder each dimension goes in: dimension name -> the join it is on, "" for this table
    private Map<String, String> dimensionTables = new LinkedHashMap<>();

    public String getSqlTable() { return sqlTable; }
    public void setSqlTable(String sqlTable) { this.sqlTable = sqlTable; }

    public String getSql() { return sql; }
    public void setSql(String sql) { this.sql = sql; }

    public String getSqlAlias() { return sqlAlias; }
    public void setSqlAlias(String sqlAlias) { this.sqlAlias = sqlAlias; }

    public String getExtends_() { return extends_; }
    public void setExtends_(String extends_) { this.extends_ = extends_; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Boolean getPublic_() { return public_; }
    public void setPublic_(Boolean public_) { this.public_ = public_; }

    public Map<String, Object> getMeta() { return meta; }
    public void setMeta(Map<String, Object> meta) { this.meta = meta; }

    public String getAccessFilter() { return accessFilter; }
    public void setAccessFilter(String accessFilter) { this.accessFilter = accessFilter; }

    public int getAccessFilterCount() { return accessFilterCount; }
    public void setAccessFilterCount(int accessFilterCount) { this.accessFilterCount = accessFilterCount; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public List<Map<String, Object>> getDimensions() { return dimensions; }
    public void setDimensions(List<Map<String, Object>> dimensions) { this.dimensions = dimensions; }

    public List<Map<String, Object>> getMeasures() { return measures; }
    public void setMeasures(List<Map<String, Object>> measures) { this.measures = measures; }

    public List<Map<String, Object>> getJoins() { return joins; }
    public void setJoins(List<Map<String, Object>> joins) { this.joins = joins; }

    public List<Map<String, Object>> getSegments() { return segments; }
    public void setSegments(List<Map<String, Object>> segments) { this.segments = segments; }

    public List<Map<String, Object>> getHierarchies() { return hierarchies; }
    public void setHierarchies(List<Map<String, Object>> hierarchies) { this.hierarchies = hierarchies; }

    public List<Map<String, Object>> getConditions() { return conditions; }
    public void setConditions(List<Map<String, Object>> conditions) { this.conditions = conditions; }

    public Map<String, CubeOptions> getNamedOptions() { return namedOptions; }
    public void setNamedOptions(Map<String, CubeOptions> namedOptions) { this.namedOptions = namedOptions; }

    public List<Map<String, Object>> getWarnings() { return warnings; }
    public void setWarnings(List<Map<String, Object>> warnings) { this.warnings = warnings; }

    public Map<String, String> getDimensionTables() { return dimensionTables; }
    public void setDimensionTables(Map<String, String> dimensionTables) { this.dimensionTables = dimensionTables; }
}
