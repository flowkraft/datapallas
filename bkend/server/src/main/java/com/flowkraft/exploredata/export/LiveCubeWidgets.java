package com.flowkraft.exploredata.export;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;

import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * The canvas widgets the author ticked <b>Show In Dashboard</b> on — read once, here, so the three
 * parts of the exporter cannot disagree about which widget is a live cube.
 *
 * <p>A cube widget is published in one of two modes, and the tick is the whole difference:
 *
 * <ul>
 *   <li><b>Unchecked</b> (the default, and every canvas saved before the box existed): the cube is
 *       a SQL generator. Its selection is turned into SQL on the canvas, the dashboard carries that
 *       frozen SQL in its data script, and the widget is drawn by its own {@code rb-*} element.
 *       Nothing in this class applies to it.</li>
 *   <li><b>Checked</b>: the cube itself is published. The dashboard carries no SQL for it at all —
 *       it gets an {@code <rb-cube-renderer>} and an entry in
 *       {@code {reportId}-cube-widgets.json}, and a viewer picks fields and filters against the
 *       live cube, which follows later edits of the cube file.</li>
 * </ul>
 *
 * <p>The file written here is the one {@link com.flowkraft.cubes.CubeWidgets} reads, and it is the
 * lock of the live cube: the cube, the cube's name inside its file and the connection all come from
 * it and never from a viewer's request. So it says exactly those three things, plus the selection
 * the widget opens with and how its result is drawn — and nothing a request could point elsewhere
 * with.
 *
 * <p>Nothing here writes SQL, and nothing here is vendor-specific.
 */
final class LiveCubeWidgets {

    private static final ObjectMapper JSON = new ObjectMapper();

    private LiveCubeWidgets() {
    }

    /** Whether this widget is published as the cube itself rather than as its frozen SQL. */
    static boolean isLive(Map<String, Object> widget) {
        Map<String, Object> visualQuery = visualQuery(widget);
        return Boolean.TRUE.equals(visualQuery.get("showInDashboard"))
                && !text(visualQuery.get("cubeId")).isEmpty();
    }

    /**
     * How the result under the field tree is drawn. The widget type picker keeps working and is
     * what decides it: a number widget shows one value, a chart widget a chart, and anything else
     * the rows as a table.
     */
    static String displayOf(Map<String, Object> widget) {
        String type = Objects.toString(widget.get("type"), "");
        return switch (type) {
            case "number" -> "value";
            case "chart" -> "chart";
            default -> "table";
        };
    }

    /**
     * {@code {reportId}-cube-widgets.json} for a canvas, or {@code ""} when it shows no live cube —
     * the empty string every other sidecar uses to mean "no file".
     *
     * @param componentIdOf the component id a widget is published under, which is what the
     *                      dashboard's markup says and therefore what a runtime request names
     */
    static String json(List<Map<String, Object>> widgets,
            Function<Map<String, Object>, String> componentIdOf, String connectionId) throws Exception {

        Map<String, Object> out = new LinkedHashMap<>();
        for (Map<String, Object> widget : widgets) {
            if (!isLive(widget)) continue;

            Map<String, Object> visualQuery = visualQuery(widget);
            Map<String, Object> entry = new LinkedHashMap<>();
            entry.put("cubeId", text(visualQuery.get("cubeId")));
            // The cube inside a file that holds several. Null means the file's own, which is what
            // CubeWidgets reads an absent name as.
            String cubeName = text(visualQuery.get("cubeName"));
            entry.put("cubeName", cubeName.isEmpty() ? null : cubeName);
            entry.put("connectionId", connectionId != null ? connectionId : "");
            entry.put("initial", initialOf(visualQuery));
            // Which of the dashboard's parameters filter this widget, and on which member (R8).
            // Written here rather than sent at run time for the same reason the cube id is: the
            // author decides what the filter bar means, the viewer only answers it.
            List<Map<String, Object>> bindings = bindingsOf(visualQuery);
            if (!bindings.isEmpty()) entry.put("paramBindings", bindings);
            entry.put("display", displayOf(widget));
            out.put(componentIdOf.apply(widget), entry);
        }

        if (out.isEmpty()) return "";
        return JSON.writerWithDefaultPrettyPrinter().writeValueAsString(out) + "\n";
    }

    /**
     * The selection the dashboard opens with, taken from what the author left on the canvas: the
     * ticks, the grains, the filters (so the canvas filters become the starting chips), the order,
     * the limit. It is the same structured query the field tree reports and the runtime reads, so
     * what the author sees on the canvas is what a viewer opens.
     *
     * <p>No parameter values are written here (R1): a cube declares none, and the values its
     * conditions use are the dashboard's own, declared once in its parameters spec and answered by
     * the dashboard's {@code rb-parameters} at run time.
     */
    private static Map<String, Object> initialOf(Map<String, Object> visualQuery) {

        Map<String, Object> initial = new LinkedHashMap<>();
        Object selection = visualQuery.get("cubeSelection");
        if (!(selection instanceof Map<?, ?> picked)) return initial;

        for (String key : List.of("dimensions", "measures", "segments", "filters", "order")) {
            Object value = picked.get(key);
            if (value instanceof List<?> list && !list.isEmpty()) initial.put(key, list);
        }
        if (picked.get("granularities") instanceof Map<?, ?> grains && !grains.isEmpty())
            initial.put("granularities", grains);
        if (picked.get("limit") instanceof Number limit) initial.put("limit", limit);
        return initial;
    }

    /**
     * The parameter bindings the author left on the canvas, as the entry writes them: the
     * parameter, the member, the comparison, and - for a {@code between} - the parameter of the
     * other end.
     *
     * <p>They are read off {@code cubeSelection.paramBindings}, which is the one place the canvas
     * keeps them (TODO 21), and written out in the entry's own order. Whether each of them is a
     * member this cube has and a parameter this dashboard declares is checked before the export
     * writes anything ({@code CanvasExportService}), because a dashboard whose filter bar silently
     * drove nothing would look exactly like one that worked.
     */
    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> bindingsOf(Map<String, Object> visualQuery) {

        List<Map<String, Object>> bindings = new ArrayList<>();
        if (!(visualQuery.get("cubeSelection") instanceof Map<?, ?> picked)) return bindings;
        if (!(picked.get("paramBindings") instanceof List<?> declared)) return bindings;

        for (Object each : declared) {
            if (!(each instanceof Map<?, ?> bound)) continue;
            Map<String, Object> binding = (Map<String, Object>) bound;

            String param = text(binding.get("param"));
            String member = text(binding.get("member"));
            if (param.isEmpty() || member.isEmpty()) continue;

            Map<String, Object> written = new LinkedHashMap<>();
            written.put("param", param);
            String paramTo = text(binding.get("paramTo"));
            if (!paramTo.isEmpty()) written.put("paramTo", paramTo);
            written.put("member", member);
            String operator = text(binding.get("operator"));
            written.put("operator", operator.isEmpty() ? "in" : operator);
            bindings.add(written);
        }
        return bindings;
    }

    /** Where a canvas widget keeps its cube query — read here, so nobody looks it up elsewhere. */
    @SuppressWarnings("unchecked")
    static Map<String, Object> visualQuery(Map<String, Object> widget) {
        Object dataSource = widget.get("dataSource");
        if (dataSource instanceof Map<?, ?> ds && ds.get("visualQuery") instanceof Map<?, ?> vq)
            return (Map<String, Object>) vq;
        return Map.of();
    }

    private static String text(Object value) {
        return Objects.toString(value, "").trim();
    }
}
