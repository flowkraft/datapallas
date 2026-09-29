package com.flowkraft.cubes;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import static com.sourcekraft.documentburster.utils.Utils.resolvePathAgainstPortableDir;

/**
 * What a published dashboard declares about its live cubes — the lock of the live cube.
 *
 * <p>The file is written by the canvas exporter and read here:
 *
 * <pre>
 *   config/reports/{reportId}/{reportId}-cube-widgets.json
 *   { "cube1": { "cubeId": "northwind-sales", "cubeName": null,
 *                "connectionId": "rbt-sample-northwind-sqlite-4f2",
 *                "initial": { "dimensions": [...], "measures": [...], "filters": [...] },
 *                "display": ["table", "chart"] } }
 * </pre>
 *
 * <p>Five more keys are the author's own opt-ins, all off unless the entry says otherwise, because
 * a dashboard published to people who are not its author shows no SQL, no DSL and no teaching aid
 * unless the author asked for it (design part 8): {@code showSql}, {@code showCode},
 * {@code showHints}, a {@code display} of several shapes, and {@code saveView}.
 *
 * <p><b>Why this file is the lock.</b> A runtime request names a report and one of its components,
 * and nothing else: the cube it may run, the cube name inside that cube's file and the connection
 * it is read through are all taken from here, never from the request. So a viewer of a dashboard
 * can ask the questions that dashboard offers, of the data that dashboard shows, and cannot turn
 * the widget into a way of reading another cube or another database. A component the file does not
 * declare does not exist: {@code 404}, not an empty answer.
 *
 * <p><b>Where it is looked for.</b> Beside the report's own {@code settings.xml}, which is
 * {@code config/reports}, {@code config/samples} or {@code config/samples/_frend} — the three
 * places a report is read from everywhere else in this server (see
 * {@code ReportingService.loadReportConfig}). The shipped Cube Stories dashboard is a sample, so
 * the samples folders are not an afterthought here.
 *
 * <p><b>The cube definition itself is not in this file</b> and is deliberately not copied into it:
 * it stays live in {@code config/cubes/{cubeId}} (or {@code config/samples-cubes}), so editing the
 * cube changes every dashboard that shows it. That is what a semantic layer is for.
 *
 * <p>Nothing here is vendor-specific, and nothing here runs SQL.
 */
public final class CubeWidgets {

	/** {@code {reportId}-cube-widgets.json}, beside the report's settings. */
	public static final String SUFFIX = "-cube-widgets.json";

	private static final ObjectMapper JSON = new ObjectMapper();

	private CubeWidgets() {
	}

	/**
	 * One declared live cube: everything the runtime is allowed to decide for itself is missing from
	 * it on purpose.
	 *
	 * @param componentId  the id the dashboard's markup gives the widget
	 * @param cubeId       the cube, as {@code config/cubes} or {@code config/samples-cubes} knows it
	 * @param cubeName     the cube's name inside its DSL file, or null for the file's own cube
	 * @param connectionId the connection its rows are read through — this file's, never a request's
	 * @param initial      the selection the widget opens with (ticks, filters, order, limit)
	 * @param display      the shapes this widget offers — {@code value}, {@code chart},
	 *                     {@code table} or {@code map} — in the order a viewer is offered them, and
	 *                     empty to let the answer's own shape decide. The file may write one name or
	 *                     a list of them, and this is always the list: a list of one is still a list,
	 *                     so nothing downstream has to ask which of the two the author wrote
	 * @param saveView     whether a viewer's own view of this widget is kept between visits (W5);
	 *                     true unless the file says otherwise, because a dashboard published before
	 *                     the key existed opens where its viewer left it, like every other one
	 * @param showSql      whether a viewer may see the SQL this widget's questions are answered by,
	 *                     for the database of their choice (design part 8: Show SQL, {@code /sql})
	 * @param showCode     whether a viewer may see the cube's own DSL text, and what the parser
	 *                     found wrong with it (design part 8: Show Config)
	 * @param showHints    whether the cube's {@code hints.json} travels with the field tree, so the
	 *                     widget can offer the questions the cube was written to answer
	 * @param paramBindings which of the dashboard's parameters filter this widget, and on which
	 *                     member (R8). Declared here rather than sent, for the same reason the
	 *                     cube id is: a viewer answers the filter bar, and the author decides what
	 *                     those answers mean. Empty on every dashboard published before the key
	 *                     existed, which then follows the filter bar only through the names its
	 *                     own {@code condition}s use (R1)
	 */
	public record Widget(String componentId, String cubeId, String cubeName, String connectionId,
			Map<String, Object> initial, List<String> display, boolean saveView,
			boolean showSql, boolean showCode, boolean showHints,
			List<CubeParamBindings.Binding> paramBindings) {
	}

	/**
	 * The widget this report declares under this component id.
	 *
	 * @throws ResponseStatusException 404 when the report declares no live cubes at all, or none
	 *                                 under that id — naming the ids it does declare, because a
	 *                                 dashboard and its widgets are written by hand and a typo in
	 *                                 either is the likely reason anybody reads this message
	 */
	public static Widget of(String reportId, String componentId) throws IOException {

		Map<String, Widget> widgets = all(reportId);

		String wanted = Objects.toString(componentId, "").trim();
		Widget widget = widgets.get(wanted);
		if (widget == null) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "This dashboard has no live cube called '"
					+ wanted + "'. Its live cubes are: " + String.join(", ", widgets.keySet()) + ".");
		}
		return widget;
	}

	/** Every live cube this report declares, in the order the file lists them; never empty. */
	public static Map<String, Widget> all(String reportId) throws IOException {

		File file = fileOf(reportId);
		if (file == null || !file.exists()) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND,
					"Report '" + reportId + "' has no live cube in it.");
		}

		Map<String, Map<String, Object>> declared = JSON.readValue(Files.readString(file.toPath()),
				new TypeReference<LinkedHashMap<String, Map<String, Object>>>() {
				});

		Map<String, Widget> widgets = new LinkedHashMap<>();
		for (Map.Entry<String, Map<String, Object>> entry : declared.entrySet()) {
			widgets.put(entry.getKey(), widgetOf(entry.getKey(), entry.getValue()));
		}

		if (widgets.isEmpty()) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND,
					"Report '" + reportId + "' has no live cube in it.");
		}
		return widgets;
	}

	@SuppressWarnings("unchecked")
	private static Widget widgetOf(String componentId, Map<String, Object> entry) {

		Map<String, Object> initial = entry.get("initial") instanceof Map
				? new LinkedHashMap<>((Map<String, Object>) entry.get("initial"))
				: new LinkedHashMap<>();

		return new Widget(componentId, text(entry.get("cubeId")), text(entry.get("cubeName")),
				text(entry.get("connectionId")), initial, displayOf(entry.get("display")),
				!Boolean.FALSE.equals(entry.get("saveView")),
				Boolean.TRUE.equals(entry.get("showSql")),
				Boolean.TRUE.equals(entry.get("showCode")),
				Boolean.TRUE.equals(entry.get("showHints")),
				bindingsOf(componentId, entry.get("paramBindings")));
	}

	/**
	 * The bindings this entry declares, with the widget named in whatever the refusal says: the
	 * author reads it while looking at a dashboard of several widgets, and "the binding of
	 * 'country' names no member" alone would not say which tile to open.
	 */
	private static List<CubeParamBindings.Binding> bindingsOf(String componentId, Object declared) {
		try {
			return CubeParamBindings.of(declared);
		} catch (IllegalArgumentException refused) {
			throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
					"The live cube '" + componentId + "' of this dashboard is declared with a parameter "
							+ "binding that cannot be read. " + refused.getMessage(), refused);
		}
	}

	/**
	 * The shapes a {@code display} key offers, whether it was written as one name or as a list.
	 *
	 * <p>A list of one is kept as a list of one. Collapsing it to the single name it holds would
	 * make "this widget offers exactly the table" indistinguishable from "this widget is a table",
	 * and the switch a viewer is offered is drawn from this list.
	 */
	private static List<String> displayOf(Object declared) {

		List<String> shapes = new ArrayList<>();
		if (declared instanceof List) {
			for (Object shape : (List<?>) declared) {
				String name = text(shape);
				if (name != null && !shapes.contains(name))
					shapes.add(name);
			}
			return shapes;
		}
		String name = text(declared);
		if (name != null)
			shapes.add(name);
		return shapes;
	}

	/**
	 * The file, wherever this report is: {@code config/reports}, then the two samples folders, in
	 * the order the rest of the server reads a report in. Null when there is none.
	 */
	static File fileOf(String reportId) {

		String id = safeId(reportId);
		for (String folder : List.of("config/reports", "config/samples", "config/samples/_frend")) {
			Path path = Paths.get(resolvePathAgainstPortableDir(folder + "/" + id + "/" + id + SUFFIX));
			if (Files.exists(path))
				return path.toFile();
		}
		return null;
	}

	/**
	 * A report id is a folder name, and this is the one place a viewer's request is turned into a
	 * path. An id that tries to leave its folder is refused rather than cleaned up: there is no
	 * legitimate request it could be.
	 */
	static String safeId(String reportId) {

		String id = Objects.toString(reportId, "").trim();
		if (id.isEmpty() || id.contains("/") || id.contains("\\") || id.contains("..")) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "There is no report called '" + id + "'.");
		}
		return id;
	}

	/** The component ids a report declares — what a 404 lists, and what a test reads. */
	public static List<String> componentIdsOf(String reportId) throws IOException {
		return new ArrayList<>(all(reportId).keySet());
	}

	private static String text(Object value) {
		if (value == null)
			return null;
		String text = value.toString().trim();
		return text.isEmpty() ? null : text;
	}
}
