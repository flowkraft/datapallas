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

    // Semantic members
    private List<Map<String, Object>> dimensions = new ArrayList<>();
    private List<Map<String, Object>> measures = new ArrayList<>();
    private List<Map<String, Object>> joins = new ArrayList<>();
    private List<Map<String, Object>> segments = new ArrayList<>();
    private List<Map<String, Object>> hierarchies = new ArrayList<>();

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

    public Map<String, CubeOptions> getNamedOptions() { return namedOptions; }
    public void setNamedOptions(Map<String, CubeOptions> namedOptions) { this.namedOptions = namedOptions; }

    public List<Map<String, Object>> getWarnings() { return warnings; }
    public void setWarnings(List<Map<String, Object>> warnings) { this.warnings = warnings; }

    public Map<String, String> getDimensionTables() { return dimensionTables; }
    public void setDimensionTables(Map<String, String> dimensionTables) { this.dimensionTables = dimensionTables; }
}
