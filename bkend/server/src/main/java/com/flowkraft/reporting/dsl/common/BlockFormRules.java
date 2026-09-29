package com.flowkraft.reporting.dsl.common;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.flowkraft.reporting.dsl.common.BlockFormEmitter.BuilderBlock;
import com.flowkraft.reporting.dsl.common.BlockFormEmitter.NamedArgsBlock;
import com.flowkraft.reporting.dsl.common.BlockFormEmitter.PluralRule;

/**
 * <h2>BlockFormRules — single source of truth for per-widget plural-key rules.</h2>
 *
 * <p>See {@link DSLPrinciplesReadme#iAmImportantReadme()} for full DSL
 * architecture principles + GOOD/BAD examples. Static init below compile-pins
 * this class to that readme.
 *
 * <p>Per-widget plural-key rules for {@link BlockFormEmitter}.
 *
 * <p>Each rule maps a plural list-of-maps key to its emission strategy:
 * <ul>
 *   <li>{@link BuilderBlock} — {@code key { item { k 'v' } item { k 'v' } }}
 *       (chart's datasets, tabulator's columns)</li>
 *   <li>{@link NamedArgsBlock} — {@code key { item(named: args) { sub(...); sub(...) } ... }}
 *       (reportparameters' parameter list)</li>
 * </ul>
 *
 * <p>Adding a new widget type or a new plural-keyed field is a one-line addition.
 * Widget types with no list-of-maps fields use {@link #EMPTY}.
 */
public final class BlockFormRules {

    static { DSLPrinciplesReadme.iAmImportantReadme(); }

    private BlockFormRules() {}

    /** Default — no plural rules (flat scalars / nested maps / list-of-strings only). */
    public static final Map<String, PluralRule> EMPTY = Map.of();

    /** Chart: {@code datasets} renders as {@code datasets { dataset { ... } }}.
     *  {@code inlineMaps=true}: {@code DatasetDelegate} uses only {@code methodMissing}, so every
     *  Map or List-valued dataset property (backgroundColor array, etc.) must be
     *  emitted as an inline literal, not a closure block or varargs. */
    public static final Map<String, PluralRule> CHART = Map.of(
        "datasets", new BuilderBlock("dataset", true)
    );

    /** Tabulator: {@code columns} renders as {@code columns { column { ... } }}.
     *  {@code inlineMaps=true}: ColumnDelegate uses only methodMissing, so every
     *  Map-valued column property (formatterParams, editorParams, etc.) must be
     *  emitted as an inline literal, not a closure block. */
    public static final Map<String, PluralRule> TABULATOR = Map.of(
        "columns", new BuilderBlock("column", true)
    );

    /** Pivot: rows/cols/vals are lists of strings — no plural rules needed. */
    public static final Map<String, PluralRule> PIVOT = EMPTY;

    /** Filter-pane: flat scalars only — no plural rules needed. */
    public static final Map<String, PluralRule> FILTERPANE = EMPTY;

    /** Cube: same default — extensible via parser methodMissing. */
    public static final Map<String, PluralRule> CUBE = EMPTY;

    /**
     * Report parameters: input shape is {@code { parameters: [...] }}. Each list
     * entry becomes a {@code parameter(id: '...', type: '...') { constraints(...); ui(...) }}
     * statement directly inside the {@code reportParameters { ... }} block — there's
     * no {@code parameters { }} sub-block in the docs DSL. Hence {@code wrap=false}.
     *
     * <p>{@code subBlockKeys}: keys NOT in this set go inline as named-args; keys
     * in this set become method-call statements inside the parameter's closure.
     * <p>{@code keyAliases}: remaps the JSON key {@code uiHints} to the DSL keyword {@code ui}.
     */
    public static final Map<String, PluralRule> REPORTPARAMETERS = Map.of(
        "parameters", new NamedArgsBlock(
            "parameter",
            // Ordered: a sub-block set with no order is emitted in whatever order the JVM
            // iterates it in, so the same dashboard exported twice wrote two different
            // parameters specs (seen on story 24's sample, TODO 21).
            new LinkedHashSet<>(List.of("constraints", "uiHints")),
            Map.of("uiHints", "ui"),
            false  // wrap=false — items are direct children of reportParameters block
        )
    );

    /** Resolve rules for a DSL type discriminator (matches {@code DslController}). */
    public static Map<String, PluralRule> forType(String type) {
        return switch (type) {
            case "chart"            -> CHART;
            case "tabulator"        -> TABULATOR;
            case "pivot"            -> PIVOT;
            case "filterpane"       -> FILTERPANE;
            case "cube"             -> CUBE;
            case "reportparameters" -> REPORTPARAMETERS;
            default                 -> EMPTY;
        };
    }
}
