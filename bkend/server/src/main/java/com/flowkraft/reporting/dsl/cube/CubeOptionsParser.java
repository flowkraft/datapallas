package com.flowkraft.reporting.dsl.cube;

import java.util.List;
import java.util.Map;

import org.codehaus.groovy.control.CompilerConfiguration;

import groovy.lang.Binding;
import groovy.lang.GroovyShell;

/**
 * Parses Cube Groovy DSL and produces CubeOptions DTO.
 *
 * The cube DSL defines a semantic model over a database table or SQL query:
 * dimensions (categorical/time attributes), measures (aggregations), and
 * joins (relationships to other cubes). This is standard OLAP/BI terminology.
 *
 * Usage:
 *   String dsl = "cube { sql_table 'orders'; dimension { name 'status'; sql 'status'; type 'string' }; measure { name 'count'; type 'count' } }";
 *   CubeOptions opts = CubeOptionsParser.parseGroovyCubeDslCode(dsl);
 */
public class CubeOptionsParser {

    @SuppressWarnings("unchecked")
    public static CubeOptions parseGroovyCubeDslCode(String groovyDslCode) throws Exception {
        if (groovyDslCode == null || groovyDslCode.trim().isEmpty()) {
            return new CubeOptions();
        }

        Binding binding = new Binding();

        CompilerConfiguration config = new CompilerConfiguration();
        config.setScriptBaseClass(CubeOptionsScript.class.getName());

        // Pass the script base class's classloader as parent. Without this, under Spring Boot
        // DevTools the compiled Script1 extends a CubeOptionsScript loaded by GroovyShell's
        // classloader while the cast target is loaded by RestartClassLoader → ClassCastException.
        GroovyShell shell = new GroovyShell(CubeOptionsScript.class.getClassLoader(), binding, config);
        CubeOptionsScript script = (CubeOptionsScript) shell.parse(groovyDslCode);
        script.setBinding(binding);
        script.run();

        CubeOptions opts = mapToCubeOptions(script.getOptions());

        // Extract named blocks for multi-cube reports
        Map<String, Map<String, Object>> namedRaw = script.getNamedOptions();
        if (namedRaw != null && !namedRaw.isEmpty()) {
            Map<String, CubeOptions> named = new java.util.LinkedHashMap<>();
            for (Map.Entry<String, Map<String, Object>> entry : namedRaw.entrySet()) {
                named.put(entry.getKey(), mapToCubeOptions(entry.getValue()));
            }
            opts.setNamedOptions(named);
        }

        // One rule for the whole file: which folder each dimension is in, and every problem the
        // author can fix. Programs read both from parse-dsl, and the generator refuses the errors.
        opts.setDimensionTables(CubeRules.dimensionTables(opts));
        for (CubeOptions named : opts.getNamedOptions().values()) {
            named.setDimensionTables(CubeRules.dimensionTables(named));
        }
        opts.setWarnings(CubeRules.warnings(opts));

        return opts;
    }

    /** Maps a raw options map to a CubeOptions DTO — shared by unnamed and named blocks */
    @SuppressWarnings("unchecked")
    private static CubeOptions mapToCubeOptions(Map<String, Object> map) {
        CubeOptions opts = new CubeOptions();
        // Data source
        if (map.containsKey("sql_table")) opts.setSqlTable(String.valueOf(map.get("sql_table")));
        if (map.containsKey("sql")) opts.setSql(String.valueOf(map.get("sql")));
        if (map.containsKey("sql_alias")) opts.setSqlAlias(String.valueOf(map.get("sql_alias")));
        if (map.containsKey("extends")) opts.setExtends_(String.valueOf(map.get("extends")));
        // Cube-level metadata
        if (map.containsKey("title")) opts.setTitle(String.valueOf(map.get("title")));
        if (map.containsKey("description")) opts.setDescription(String.valueOf(map.get("description")));
        if (map.containsKey("public")) opts.setPublic_((Boolean) map.get("public"));
        if (map.containsKey("meta")) opts.setMeta((Map<String, Object>) map.get("meta"));
        // Semantic members
        if (map.containsKey("dimensions")) opts.setDimensions((List<Map<String, Object>>) map.get("dimensions"));
        if (map.containsKey("measures")) opts.setMeasures((List<Map<String, Object>>) map.get("measures"));
        if (map.containsKey("joins")) opts.setJoins((List<Map<String, Object>>) map.get("joins"));
        if (map.containsKey("segments")) opts.setSegments((List<Map<String, Object>>) map.get("segments"));
        if (map.containsKey("hierarchies")) opts.setHierarchies((List<Map<String, Object>>) map.get("hierarchies"));
        return opts;
    }
}
