package com.flowkraft.reporting.dsl.common;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.codehaus.groovy.control.CompilerConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flowkraft.reporting.services.ReportingService;

import com.flowkraft.reporting.dsl.chart.ChartOptionsScript;
import com.flowkraft.reporting.dsl.cube.CubeOptionsScript;
import com.flowkraft.reporting.dsl.filterpane.FilterPaneOptionsScript;
import com.flowkraft.reporting.dsl.pivottable.PivotTableOptionsScript;
import com.flowkraft.reporting.dsl.tabulator.TabulatorOptionsScript;
import com.sourcekraft.documentburster.common.reportparameters.ReportParameter;
import com.sourcekraft.documentburster.common.reportparameters.ReportParametersHelper;

import groovy.lang.Binding;
import groovy.lang.GroovyShell;
import groovy.lang.Script;

/**
 * <h2>DslController — single bidirectional DSL round-trip endpoint.</h2>
 *
 * <p>See {@link DSLPrinciplesReadme#iAmImportantReadme()} for full DSL
 * architecture principles + GOOD/BAD examples (single canonical syntax, DRY,
 * round-trip contract). Static init below compile-pins this class to that
 * readme.
 *
 * <p>Bidirectional DSL round-trip endpoints for data-canvas widgets.
 *
 *   POST /api/dsl/{type}/parse       body: { dslCode }            → { options }
 *   POST /api/dsl/{type}/serialize   body: { options }            → { dslCode }
 *
 * {type} ∈ {chart, tabulator, pivot, filterpane, cube, reportparameters}
 *
 * Parse bypasses the typed DTOs and returns the raw {@code script.getOptions()}
 * Map directly. This matches the pattern in ReportingService and avoids three
 * classes of Jackson issues:
 *   - Tabulator DTO round-trip through Jackson can snag internal Groovy refs.
 *   - Chart fields in the DTO don't round-trip to/from nested DSL blocks.
 *   - Cube DTO uses camelCase while the DSL uses snake_case keywords.
 * The raw map always carries the correct DSL-key-shaped structure that the
 * emitter can re-emit unchanged.
 *
 * Serialize receives the options map back from the UI and emits Groovy DSL
 * via {@link BlockFormEmitter} with widget-specific {@link BlockFormRules}.
 * Output is canonical block form across ALL DSL types (chart, tabulator, pivot,
 * filterpane, cube, reportparameters) — single quotes, command-chain syntax,
 * builder blocks for list-of-maps where applicable. {@code priorDslCode} is
 * accepted in the payload for future AST-preserving emission; today it's
 * ignored since the parsers already capture unknown keys via methodMissing
 * (chart/tabulator/cube) and the strict schemas (filterpane/pivot) expose
 * every accepted key via the UI.
 */
@RestController
@RequestMapping(value = "/api/dsl", produces = MediaType.APPLICATION_JSON_VALUE)
@PreAuthorize("hasRole('REPORT_AUTHOR')")
public class DslController {

    static { DSLPrinciplesReadme.iAmImportantReadme(); }

    private static final Logger log = LoggerFactory.getLogger(DslController.class);

    @Autowired
    private ReportingService reportingService;

    /**
     * Parses a widget DSL — which means compiling and RUNNING the supplied Groovy. A script base class
     * constrains nothing, so "parse" here is indistinguishable from arbitrary code execution and is
     * gated as an authoring capability, exactly like {@code /api/queries/run-script}.
     */
    @PreAuthorize("hasRole('REPORT_AUTHOR')")
    @PostMapping(value = "/{type}/parse", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, Object>> parse(
            @PathVariable String type,
            @RequestBody Map<String, Object> body) {
        String dslCode = (String) body.getOrDefault("dslCode", "");
        String connectionCode = (String) body.getOrDefault("connectionCode", null);
        try {
            // reportparameters uses a dedicated parser and returns { parameters: [...] }
            // (flat list) rather than the { options: {...} } envelope used by DSL widgets.
            if ("reportparameters".equals(type)) {
                List<ReportParameter> params = dslCode.isBlank()
                        ? List.of()
                        : ReportParametersHelper.parseGroovyParametersDslCode(dslCode);
                if (connectionCode != null && !connectionCode.isEmpty()) {
                    reportingService.resolveParameterSqlOptions(params, connectionCode);
                }
                List<Map<String, Object>> paramMaps = params.stream()
                        .map(DslController::reportParameterToMap)
                        .toList();
                Map<String, Object> out = new LinkedHashMap<>();
                out.put("parameters", paramMaps);
                return ResponseEntity.ok(out);
            }

            Map<String, Object> options = parseToOptionsMap(type, dslCode);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("options", stripEmpties(options));
            return ResponseEntity.ok(out);
        } catch (Exception e) {
            log.warn("DSL parse failed for type={} — {}", type, e.getMessage());
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(err);
        }
    }

    @PostMapping(value = "/{type}/serialize", consumes = MediaType.APPLICATION_JSON_VALUE)
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> serialize(
            @PathVariable String type,
            @RequestBody Map<String, Object> body) {
        try {
            Object rawOptions = body.get("options");
            if (!(rawOptions instanceof Map)) {
                Map<String, Object> err = new LinkedHashMap<>();
                err.put("error", "Request body must include an 'options' object.");
                return ResponseEntity.badRequest().body(err);
            }
            String rootKeyword = rootKeywordFor(type);
            // Single canonical block-form output for ALL DSL types (chart, tabulator,
            // pivot, filterpane, cube, reportparameters): command-chain syntax for
            // scalars, builder blocks for list-of-maps where applicable, single-quoted
            // strings, 2-space indent. Per-type plural-key rules in BlockFormRules.
            String dslCode = BlockFormEmitter.emit(
                rootKeyword,
                (Map<String, Object>) rawOptions,
                BlockFormRules.forType(type));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("dslCode", dslCode);
            return ResponseEntity.ok(out);
        } catch (Exception e) {
            log.warn("DSL serialize failed for type={} — {}", type, e.getMessage());
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(err);
        }
    }

    /**
     * Parse DSL and return the raw options map straight from the Groovy script.
     * Bypasses the typed DTOs (no Jackson convertValue), so the returned keys
     * match the DSL keywords exactly — which is what the emitter expects.
     */
    private Map<String, Object> parseToOptionsMap(String type, String dslCode) throws Exception {
        if (dslCode == null || dslCode.trim().isEmpty()) {
            return new LinkedHashMap<>();
        }
        Class<? extends Script> base = scriptBaseFor(type);

        CompilerConfiguration config = new CompilerConfiguration();
        config.setScriptBaseClass(base.getName());

        // Use the base class's classloader as parent — avoids Spring DevTools
        // ClassCastException with RestartClassLoader (see TabulatorOptionsParser
        // comment for the full rationale).
        GroovyShell shell = new GroovyShell(base.getClassLoader(), new Binding(), config);
        Script script = shell.parse(dslCode);
        script.run();

        return invokeGetOptions(script);
    }

    private static Class<? extends Script> scriptBaseFor(String type) {
        return switch (type) {
            case "filterpane" -> FilterPaneOptionsScript.class;
            case "chart"      -> ChartOptionsScript.class;
            case "tabulator"  -> TabulatorOptionsScript.class;
            case "pivot"      -> PivotTableOptionsScript.class;
            case "cube"       -> CubeOptionsScript.class;
            default -> throw new IllegalArgumentException("Unknown DSL type: " + type);
        };
    }

    private static String rootKeywordFor(String type) {
        return switch (type) {
            case "filterpane"        -> "filterPane";
            case "chart"             -> "chart";
            case "tabulator"         -> "tabulator";
            case "pivot"             -> "pivotTable";
            case "cube"              -> "cube";
            case "reportparameters"  -> "reportParameters";
            default -> throw new IllegalArgumentException("Unknown DSL type: " + type);
        };
    }

    /**
     * Calls the script's {@code getOptions()} method reflectively. Every DSL
     * base class we support defines it with the same signature returning the
     * unnamed-block options map.
     */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> invokeGetOptions(Script script) throws Exception {
        Object res = script.getClass().getMethod("getOptions").invoke(script);
        return res instanceof Map ? (Map<String, Object>) res : new LinkedHashMap<>();
    }

    /**
     * Converts a {@link ReportParameter} to a plain {@code Map<String,Object>}
     * whose keys match the frontend's {@code ParamMeta} interface:
     * id, type, label, description, defaultValue, constraints, uiHints.
     */
    private static Map<String, Object> reportParameterToMap(ReportParameter rp) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id",           rp.id);
        m.put("type",         rp.type);
        m.put("label",        rp.label);
        m.put("description",  rp.description);
        m.put("defaultValue", rp.defaultValue);
        if (rp.constraints != null && !rp.constraints.isEmpty())
            m.put("constraints", rp.constraints);
        if (rp.uiHints != null && !rp.uiHints.isEmpty())
            m.put("uiHints", rp.uiHints);
        return m;
    }

    /** Drops null, empty maps, and empty lists — keeps the emitted DSL clean. */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> stripEmpties(Map<String, Object> in) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : in.entrySet()) {
            Object v = e.getValue();
            if (v == null) continue;
            if (v instanceof Map<?, ?> nested) {
                Map<String, Object> cleaned = stripEmpties((Map<String, Object>) nested);
                if (!cleaned.isEmpty()) out.put(e.getKey(), cleaned);
            } else if (v instanceof java.util.Collection<?> coll) {
                if (!coll.isEmpty()) out.put(e.getKey(), v);
            } else {
                out.put(e.getKey(), v);
            }
        }
        return out;
    }
}
