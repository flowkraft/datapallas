package com.flowkraft.cubes;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import com.flowkraft.cubes.CubeWidgets.Widget;
import com.flowkraft.iam.UserSettingsRepository;
import com.flowkraft.iam.limits.LimitsSandbox;
import com.flowkraft.queries.ConnectionFactory;
import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.sourcekraft.documentburster.common.db.DatabaseConnectionManager;
import com.sourcekraft.documentburster.common.db.SqlExecutor;

/**
 * The live cube of a published dashboard: what a viewer may see of it, and what a viewer may ask.
 *
 * <p>Three questions, one lock. {@link CubeWidgets} says which cube this component of this report
 * is, which name it has in its file and which connection it is read through; this service answers
 * only about that cube, on only that connection. Everything a request could use to point somewhere
 * else — a cube name, a connection, a vendor, a piece of SQL or DSL — is refused rather than
 * ignored, because a request that asks for something it may not have should hear so.
 *
 * <p><b>What a viewer never receives</b> ({@link #meta}): no {@code sql} of the cube, of a measure,
 * of a dimension or of a segment, no joins, no {@code filter_options} statement. A dashboard is
 * published to people who are not its author; the field tree needs names, titles, types and
 * formats, and nothing in it needs the statements underneath. The opt-ins that do show SQL are the
 * author's own, declared per widget, and are not built here.
 *
 * <p><b>What a viewer may ask</b> ({@link #query}): the same structured query the cube editor
 * sends, minus everything the file decides. Every member, segment and filter name must be one this
 * cube declares and offers ({@code public} is not {@code false}), or the answer is a 400 naming it
 * — the renderer shows that sentence, so it says what the cube does have. {@code limit} defaults to
 * {@link #DEFAULT_LIMIT} and cannot exceed {@link #MAX_LIMIT}; one row more than the limit is read
 * so a cut answer can say {@code truncated} instead of pretending to be whole.
 *
 * <p><b>Every value is bound.</b> The generated query carries {@code :cf…} placeholders and the
 * values go to the driver as parameters ({@link CubeQuery}); the inline form exists for design
 * time and is never used here.
 *
 * <p><b>ANSI SQL only — no vendor branch in this file.</b> The vendor is read from the connection
 * the widget declares and handed to the generator, which gets its vendor forms from
 * {@link CubeSqlDialect}.
 */
@Service
public class CubeRuntimeService {

	private static final Logger log = LoggerFactory.getLogger(CubeRuntimeService.class);

	/** The rows a query answers with when it asks for no particular number. */
	public static final int DEFAULT_LIMIT = 1000;

	/** The most rows a runtime query may ask for, whatever it says. */
	public static final int MAX_LIMIT = 5000;

	/**
	 * The keys a runtime request may carry. The three the editor's older screens still send
	 * ({@code selectedDimensions} and its two siblings) are not among them: the runtime is new, and
	 * one spelling is enough.
	 */
	private static final List<String> QUERY_KEYS = List.of(
			"dimensions", "measures", "segments", "granularities", "filters", "order", "limit", "totals");

	/**
	 * Keys that would move the question off the widget's own cube, connection or database, or hand
	 * the server code to run. A request carrying one is refused: silently dropping it would let a
	 * caller believe the answer was the one they asked for.
	 */
	private static final List<String> REFUSED_KEYS = List.of(
			"cubeName", "cubeId", "connectionId", "dbVendor", "dialect", "sql", "dsl", "dslCode", "reportId");

	@Autowired
	private CubesService cubesService;

	@Autowired
	private CubeFilterOptions cubeFilterOptions;

	@Autowired
	private LimitsSandbox limitsSandbox;

	/**
	 * Where a viewer's own view is kept (W5). Optional so that the cube tests, which are about the
	 * SQL and the lock, need no IAM store: without one every caller is answered as a viewer with no
	 * account, which is what a share link is anyway.
	 */
	@Autowired(required = false)
	private UserSettingsRepository userSettings;

	/**
	 * The database, as this service needs it: which vendor a connection is, and the rows a statement
	 * reads on it. Production is {@link TheRealDatabase}, which is the same two calls
	 * {@link CubeFilterOptions} makes. A test hands in its own and sees exactly what ran, on which
	 * connection — the only way to prove that the connection came from the file and not from the
	 * request without standing up two databases.
	 */
	public interface Database {

		String vendorOf(String connectionId) throws Exception;

		List<Map<String, Object>> read(String connectionId, String sql, Map<String, Object> params, int limit)
				throws Exception;
	}

	/** Through the connection the widget declares, every value bound. */
	static final class TheRealDatabase implements Database {

		@Override
		public String vendorOf(String connectionId) throws Exception {
			return CubeFilterOptions.vendorOf(connectionId);
		}

		@Override
		public List<Map<String, Object>> read(String connectionId, String sql, Map<String, Object> params,
				int limit) throws Exception {

			try (DatabaseConnectionManager dbManager = ConnectionFactory.newConnectionManager()) {
				return new SqlExecutor(dbManager).queryOn(connectionId, sql, params, limit);
			}
		}
	}

	private Database database = new TheRealDatabase();

	/** The test seam of {@link Database}; nothing in the product calls it. */
	void useDatabase(Database database) {
		this.database = database;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// /meta — the cube as the viewer may see it
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * The cube behind this component, as much of it as a viewer may see, with the selection the
	 * dashboard opens it with.
	 *
	 * <p>Tiers 4 and 5 of the design's table: {@code format} travels with each member, because the
	 * result area formats what it shows. The cube-level {@code currency} and the viewer's saved view
	 * are added where they are built (the DSL key and {@code myView} are the canvas run's).
	 */
	/** Nobody in particular is looking: the author's default, and no view of anybody's own. */
	public Map<String, Object> meta(String reportId, String componentId) throws Exception {
		return meta(reportId, componentId, CubeViewer.NOBODY);
	}

	public Map<String, Object> meta(String reportId, String componentId, CubeViewer viewer) throws Exception {

		Widget widget = CubeWidgets.of(reportId, componentId);
		CubeOptions cube = cubeOf(widget);

		Map<String, Object> meta = new LinkedHashMap<>();
		meta.put("componentId", widget.componentId());
		meta.put("cubeId", widget.cubeId());
		meta.put("title", cube.getTitle());
		meta.put("description", cube.getDescription());

		List<Map<String, Object>> dimensions = new ArrayList<>();
		for (Map<String, Object> member : offered(cube.getDimensions())) {
			Map<String, Object> shown = shown(member);
			shown.put("hasFilterOptions", !text(member.get("filter_options")).isEmpty());
			dimensions.add(shown);
		}
		meta.put("dimensions", dimensions);

		List<Map<String, Object>> measures = new ArrayList<>();
		for (Map<String, Object> member : offered(cube.getMeasures())) {
			measures.add(shown(member));
		}
		meta.put("measures", measures);

		List<Map<String, Object>> segments = new ArrayList<>();
		for (Map<String, Object> member : offered(cube.getSegments())) {
			Map<String, Object> shown = new LinkedHashMap<>();
			shown.put("name", member.get("name"));
			shown.put("title", member.get("title"));
			shown.put("description", member.get("description"));
			segments.add(shown);
		}
		meta.put("segments", segments);

		List<Map<String, Object>> hierarchies = new ArrayList<>();
		for (Map<String, Object> hierarchy : cube.getHierarchies() != null ? cube.getHierarchies() : List.<Map<String, Object>>of()) {
			Map<String, Object> shown = new LinkedHashMap<>();
			shown.put("name", hierarchy.get("name"));
			shown.put("title", hierarchy.get("title"));
			shown.put("levels", hierarchy.get("levels"));
			hierarchies.add(shown);
		}
		meta.put("hierarchies", hierarchies);

		// What the numbers are in, for the formatter: one cube, one currency (W4.2).
		meta.put("currency", cube.getCurrency());
		meta.put("initial", widget.initial());
		meta.put("display", widget.display());

		// W5: where this viewer's own view is kept, and — when it is kept here — the view itself,
		// already merged over the author's default and already cleaned against the cube as it is
		// today. It travels with the field tree so the first render is the viewer's own, with no
		// flash of the default in between.
		String storage = viewStorageOf(widget, viewer);
		meta.put("viewStorage", storage);
		ResolvedView resolved = ACCOUNT.equals(storage) ? savedViewOf(reportId, widget, cube, viewer) : null;
		meta.put("myView", resolved == null ? null : resolved.value());
		meta.put("myViewDropped", resolved == null ? List.of() : resolved.dropped());
		return meta;
	}

	/**
	 * One member as a viewer sees it: what it is called, what it is, and how its values are written.
	 * Whatever else the author wrote — the SQL, the case expression, the sub-query, the primary key,
	 * the filter-options statement, the drill members, the meta block — is not here.
	 */
	private static Map<String, Object> shown(Map<String, Object> member) {

		Map<String, Object> shown = new LinkedHashMap<>();
		shown.put("name", member.get("name"));
		shown.put("title", member.get("title"));
		shown.put("description", member.get("description"));
		shown.put("type", member.get("type"));
		shown.put("format", member.get("format"));
		return shown;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// /query — the question, run on the widget's own connection
	// ═══════════════════════════════════════════════════════════════════════════

	/** Nobody in particular is asking: every {@code ${dp_…}} binds empty, which matches no row. */
	Map<String, Object> query(String reportId, String componentId, Map<String, Object> request) throws Exception {
		return query(reportId, componentId, request, Map.of());
	}

	/**
	 * The rows this selection asks for, and whether there were more of them.
	 *
	 * @param userVariables who is asking, as {@code UserVariables.of(request)} answers it - the same
	 *                      map {@code /data} binds. The cube's {@code access_filter} is written into
	 *                      every SELECT by the generator and given these values here, so two people
	 *                      asking the same question of the same widget are answered their own rows.
	 */
	public Map<String, Object> query(String reportId, String componentId, Map<String, Object> request,
			Map<String, String> userVariables) throws Exception {

		Widget widget = CubeWidgets.of(reportId, componentId);
		Map<String, Object> answer = rows(cubeOf(widget), widget.connectionId(), request, userVariables);
		log.debug("Live cube '{}' of report '{}' answered {} rows{}", componentId, reportId,
				((List<?>) answer.get("rows")).size(),
				Boolean.TRUE.equals(answer.get("truncated")) ? " (cut)" : "");
		return answer;
	}

	/**
	 * The rows one selection asks for, of one cube, on one connection — the whole of what
	 * {@link #query} and the author's own {@code /api/cubes/{cubeId}/query} both do (W4.8).
	 *
	 * <p>Which cube and which connection is the caller's to decide and is decided before this
	 * point: the runtime takes both from the dashboard's declaration, the author's endpoint from
	 * the cube being edited. Everything after that — which keys a request may carry, which members
	 * it may name, the limit, the extra row that tells a cut answer from a whole one, the totals,
	 * and the {@code access_filter} bound to whoever is asking — is the same either way, so the two
	 * modes cannot answer the same question differently.
	 */
	public Map<String, Object> rows(CubeOptions cube, String connectionId, Map<String, Object> request,
			Map<String, String> userVariables) throws Exception {
		return rows(cube, connectionId, request, userVariables, false);
	}

	/**
	 * The same rows, and with {@code withSql} the statement they were read by (W4.8). Only the
	 * author's own endpoint asks for it, for the {@code dataLoaded} event of the cube a person is
	 * writing; a dashboard's live cube never does, because a viewer is never shown SQL.
	 */
	public Map<String, Object> rows(CubeOptions cube, String connectionId, Map<String, Object> request,
			Map<String, String> userVariables, boolean withSql) throws Exception {

		Map<String, Object> asked = asked(request);
		assertEveryNameIsOffered(cube, asked);

		int limit = limitOf(asked);
		// One more row than the answer may carry: that is how a cut answer is told from a whole one,
		// the same way a cut filter list is.
		asked.put("limit", limit + 1);

		// The values of whoever is asking go in here and nowhere earlier: the request said which
		// question, the session says whose answer. A dp_ name in the request body is not one of
		// QUERY_KEYS and never reached this far, so there is nothing of the viewer's to overwrite.
		CubeQuery query = CubeVariableBinding.bound(
				generated(cube, asked, database.vendorOf(connectionId)), userVariables);
		List<Map<String, Object>> rows = database.read(connectionId, query.getSql(), query.getParams(),
				limit + 1);

		boolean truncated = rows.size() > limit;
		Map<String, Object> answer = new LinkedHashMap<>();
		answer.put("rows", new ArrayList<>(truncated ? rows.subList(0, limit) : rows));
		answer.put("truncated", truncated);
		if (withSql) {
			answer.put("sql", query.getSql());
		}

		if (Boolean.TRUE.equals(asked.get("totals"))) {
			answer.put("totals", totals(cube, asked, connectionId, userVariables));
		}
		return answer;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// totals — the same question, asked of every row at once
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * One number per measure, over all the rows the filters leave — not the sum of the rows shown
	 * (W4.3). A distinct count, an average and a ratio are each wrong when added up, and a cut
	 * answer still totals everything, which is why this is a second query rather than arithmetic.
	 *
	 * <p>The measures read over the finished groups have no total of their own to ask for: a share
	 * of the total is {@code 1} by definition, and a running total and a to-date total are answers
	 * about an order of rows, which a single row has none of. A prior-period measure does have one
	 * — the earlier period's total — and it is asked for whenever there is a time filter saying
	 * which earlier period that is.
	 */
	private Map<String, Object> totals(CubeOptions cube, Map<String, Object> asked, String connectionId,
			Map<String, String> userVariables) throws Exception {

		Map<String, Object> totals = new LinkedHashMap<>();

		List<String> requested = new ArrayList<>();
		for (Object measure : list(asked.get("measures"))) {
			requested.add(Objects.toString(measure, ""));
		}

		boolean overAPeriod = hasATimeFilter(cube, asked);
		List<String> asking = new ArrayList<>();
		for (String measure : requested) {
			switch (analysisOf(cube, measure)) {
			case "share":
				totals.put(measure, 1);
				break;
			case "window":
				totals.put(measure, null);
				break;
			case "shift":
				if (overAPeriod) asking.add(measure);
				else totals.put(measure, null);
				break;
			default:
				asking.add(measure);
			}
		}
		if (asking.isEmpty())
			return totals;

		Map<String, Object> request = CubeSqlGenerator.totalsRequest(asked);
		request.put("measures", asking);
		request.remove("totals");

		CubeQuery query = CubeVariableBinding.bound(
				generated(cube, request, database.vendorOf(connectionId)), userVariables);
		List<Map<String, Object>> rows = database.read(connectionId, query.getSql(), query.getParams(), 2);

		Map<String, Object> only = rows.isEmpty() ? Map.of() : rows.get(0);
		for (String measure : asking) {
			totals.put(measure, only.get(measure));
		}

		// Back into the order the request asked in, so the table's bottom row lines up with it.
		Map<String, Object> inOrder = new LinkedHashMap<>();
		for (String measure : requested) {
			inOrder.put(measure, totals.get(measure));
		}
		return inOrder;
	}

	/** Which of the three W4.4/W4.5 kinds this measure is, or {@code "plain"}. */
	private static String analysisOf(CubeOptions cube, String measure) {

		List<CubeAnalysis.Analytic> analytics = CubeAnalysis.analyticsOf(cube, List.of(measure));
		if (analytics.isEmpty())
			return "plain";
		switch (analytics.get(0).kind) {
		case SHARE:
			return "share";
		case SHIFT:
			return "shift";
		default:
			return "window";
		}
	}

	/** Whether any filter narrows a time dimension — what a prior-period total needs to exist. */
	@SuppressWarnings("unchecked")
	static boolean hasATimeFilter(CubeOptions cube, Map<String, Object> asked) {

		for (Object filter : list(asked.get("filters"))) {
			if (!(filter instanceof Map)) continue;
			Map<String, Object> dimension = named(offered(cube.getDimensions()),
					Objects.toString(((Map<String, Object>) filter).get("member"), ""));
			if (dimension != null && "time".equals(text(dimension.get("type")).toLowerCase()))
				return true;
		}
		return false;
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// /drill — the rows behind one number
	// ═══════════════════════════════════════════════════════════════════════════

	/** Nobody in particular is asking: every {@code ${dp_…}} binds empty, which matches no row. */
	Map<String, Object> drill(String reportId, String componentId, Map<String, Object> body) throws Exception {
		return drill(reportId, componentId, body, Map.of());
	}

	/**
	 * The rows behind the number in one cell (W4.6), through the same lock as {@link #query}: the
	 * cube, the connection and the {@code access_filter} are the dashboard's, and the body says
	 * only which measure and which cell.
	 *
	 * <p>The drill is built by {@link CubeDrill} and then answered exactly like any other query, so
	 * a member the cube hides is no more reachable here than anywhere else.
	 */
	public Map<String, Object> drill(String reportId, String componentId, Map<String, Object> body,
			Map<String, String> userVariables) throws Exception {

		Widget widget = CubeWidgets.of(reportId, componentId);
		return drillOn(cubeOf(widget), widget.connectionId(), body, userVariables);
	}

	/**
	 * The rows behind one number, of one cube, on one connection — what both drill endpoints do
	 * (W4.6). A drill is an ordinary query built by {@link CubeDrill}, so it is answered through
	 * the same generator, the same binding and the same limit rules as any other.
	 */
	public Map<String, Object> drillOn(CubeOptions cube, String connectionId, Map<String, Object> body,
			Map<String, String> userVariables) throws Exception {

		Map<String, Object> drill = body != null ? body : Map.of();
		// The query the cell came out of, by the same rules as any other request, plus the two keys
		// that are the drill's own.
		Map<String, Object> sent = asked(drill);
		sent.put("measure", Objects.toString(drill.get("measure"), ""));
		sent.put("cell", drill.get("cell"));
		assertEveryNameIsOffered(cube, sent);
		assertOffered(cube, "measure", Objects.toString(sent.get("measure"), ""));

		Map<String, Object> request;
		try {
			request = CubeDrill.request(cube, sent);
		} catch (IllegalArgumentException refused) {
			throw badRequest(refused);
		}
		// One more row than the answer carries, so a cut answer can say it was cut.
		request.put("limit", CubeDrill.LIMIT + 1);

		CubeQuery query = CubeVariableBinding.bound(
				generated(cube, request, database.vendorOf(connectionId)), userVariables);
		List<Map<String, Object>> rows = database.read(connectionId, query.getSql(), query.getParams(),
				CubeDrill.LIMIT + 1);

		boolean truncated = rows.size() > CubeDrill.LIMIT;
		Map<String, Object> answer = new LinkedHashMap<>();
		answer.put("rows", new ArrayList<>(truncated ? rows.subList(0, CubeDrill.LIMIT) : rows));
		answer.put("truncated", truncated);
		return answer;
	}


	// ═══════════════════════════════════════════════════════════════════════════
	// /filter-options — the same values the editor's filter popover shows
	// ═══════════════════════════════════════════════════════════════════════════

	/**
	 * The values one dimension of this widget's cube may be filtered by — the runtime twin of the
	 * editor's endpoint, answering from the same {@link CubeFilterOptions} so the two can never
	 * offer different lists. A dimension the cube does not offer has no values to show.
	 */
	public Map<String, Object> filterOptions(String reportId, String componentId, String dimension, String search)
			throws Exception {
		return filterOptions(reportId, componentId, dimension, search, Map.of());
	}

	/**
	 * The same list, for whoever is asking: the values offered for a filter are the values this
	 * viewer may see, because the generated list carries the cube's access filter and it is bound
	 * here with the values {@link #query} binds.
	 */
	public Map<String, Object> filterOptions(String reportId, String componentId, String dimension, String search,
			Map<String, String> userVariables) throws Exception {

		Widget widget = CubeWidgets.of(reportId, componentId);
		CubeOptions cube = cubeOf(widget);

		assertOffered(cube, "dimension", Objects.toString(dimension, ""));
		try {
			return cubeFilterOptions.options(cube, dimension, widget.connectionId(), search, userVariables);
		} catch (IllegalArgumentException badRequest) {
			throw badRequest(badRequest);
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// The cube behind a widget
	// ═══════════════════════════════════════════════════════════════════════════

	// ════════════════════════════════════════════════════════════════════════════
	// W5 — my view: the viewer's own layer over the author's default
	// ════════════════════════════════════════════════════════════════════════════

	/** The shape of a saved view, so a later one can be read next to this one rather than guessed. */
	public static final int VIEW_VERSION = 1;

	/** Kept on this server, under the viewer's own account. */
	static final String ACCOUNT = "account";

	/** Kept in the viewer's browser: a share link and an embed token have no account to keep it in. */
	static final String BROWSER = "browser";

	/** Not kept at all: the author said this widget opens the same way for everybody, every time. */
	static final String NONE = "none";

	private static final ObjectMapper VIEW_JSON = new ObjectMapper();

	/**
	 * A view as it is handed to the renderer: the value itself, and the names that were in it and
	 * are not in the cube any more.
	 */
	record ResolvedView(Map<String, Object> value, List<String> dropped) {
	}

	/**
	 * Where this viewer's own view of this widget is kept (W5's table "Who the viewer is").
	 *
	 * <p>The renderer is told rather than left to work it out: it has a role and a mode, and neither
	 * of them answers this question. An author who turned the per-viewer layer off gets
	 * {@code none}, and then nothing is saved for anybody.
	 */
	static String viewStorageOf(Widget widget, CubeViewer viewer) {

		if (!widget.saveView())
			return NONE;

		return viewer != null && viewer.hasAccount() ? ACCOUNT : BROWSER;
	}

	/** The view this viewer saved for this widget, merged and cleaned, or null when there is none. */
	public Map<String, Object> myView(String reportId, String componentId, CubeViewer viewer) throws Exception {

		Widget widget = CubeWidgets.of(reportId, componentId);
		assertKeptHere(widget, viewer);

		ResolvedView resolved = savedViewOf(reportId, widget, cubeOf(widget), viewer);
		return resolved == null ? null : resolved.value();
	}

	/**
	 * Saves what this viewer is looking at, checked exactly as a {@code /query} is checked.
	 *
	 * <p>A saved view is a question that will be asked again, so a name it carries has to be a name
	 * this cube offers today: a view that could not be asked is not a view, and storing it would
	 * turn one bad save into an error on every later visit. The limit is capped the same way, and
	 * the whole value is capped in bytes, because one viewer filling the store is one viewer
	 * breaking everybody's.
	 */
	public Map<String, Object> saveMyView(String reportId, String componentId, Map<String, Object> body,
			CubeViewer viewer) throws Exception {

		Widget widget = CubeWidgets.of(reportId, componentId);
		assertKeptHere(widget, viewer);

		Map<String, Object> value = validViewOf(cubeOf(widget), body);
		String json = writeView(value);

		if (json.getBytes(StandardCharsets.UTF_8).length > UserSettingsRepository.MAX_VALUE_BYTES) {
			throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
					"A saved view holds the fields, filters and order of one question, which is never this "
							+ "large. The most one may hold is " + UserSettingsRepository.MAX_VALUE_BYTES
							+ " bytes.");
		}

		userSettings.upsert(viewer.owner(), viewer.tenantCode(),
				UserSettingsRepository.cubeViewKey(reportId, componentId), json);
		return value;
	}

	/** "Reset view": what the author publishes is what this viewer gets again, now and in future. */
	public void deleteMyView(String reportId, String componentId, CubeViewer viewer) throws Exception {

		Widget widget = CubeWidgets.of(reportId, componentId);
		assertKeptHere(widget, viewer);

		userSettings.delete(viewer.owner(), viewer.tenantCode(),
				UserSettingsRepository.cubeViewKey(reportId, componentId));
	}

	/**
	 * The three {@code my-view} endpoints answer a person or the desktop's own key, and nobody else.
	 *
	 * <p>A token caller never reaches them at all — those paths are not the report-scoped ones
	 * {@code EmbedTokenAuthorizationManager} opens, so the request is refused before this. This is
	 * the second half of the same rule, for a caller who is authenticated but is no person this
	 * store knows: there is no account to write under, and inventing one would be a row two callers
	 * could share.
	 */
	private void assertKeptHere(Widget widget, CubeViewer viewer) {

		if (!widget.saveView()) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "The live cube '" + widget.componentId()
					+ "' of this dashboard opens the same way for everybody: it keeps no view of its own.");
		}

		if (userSettings == null || viewer == null || !viewer.hasAccount()) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN, "A view is kept under the account of "
					+ "whoever saved it, and this request has none. A dashboard opened through a share "
					+ "link or an embed token keeps its view in the browser instead.");
		}
	}

	/** What the store holds for this viewer, read back, merged over the default and cleaned. */
	private ResolvedView savedViewOf(String reportId, Widget widget, CubeOptions cube, CubeViewer viewer) {

		if (userSettings == null || viewer == null || !viewer.hasAccount())
			return null;

		Optional<String> saved = userSettings.find(viewer.owner(), viewer.tenantCode(),
				UserSettingsRepository.cubeViewKey(reportId, widget.componentId()));
		return saved.map(json -> resolveView(cube, widget.initial(), readView(json))).orElse(null);
	}

	/**
	 * The two layers, combined (W5, "Load").
	 *
	 * <p>Start from the author's {@code initial}; a saved view replaces the selection and the
	 * collapsed state <em>as a whole</em>, because a field-by-field mix of two views is a third view
	 * nobody chose. Then clean what is left against the cube as it is today: a field the author has
	 * since removed or hidden is dropped and named, and a view with nothing valid left in it falls
	 * back to the author's own. Security is never taken from here — the lock, the connection and the
	 * {@code access_filter} are applied on every {@code /query} exactly as they are for a selection
	 * somebody just clicked.
	 */
	static ResolvedView resolveView(CubeOptions cube, Map<String, Object> initial, Map<String, Object> saved) {

		Map<String, Object> author = initial != null ? initial : Map.of();

		if (saved == null || !(saved.get("selection") instanceof Map))
			return new ResolvedView(viewOf(author, false), List.of());

		@SuppressWarnings("unchecked")
		Map<String, Object> selection = new LinkedHashMap<>((Map<String, Object>) saved.get("selection"));
		boolean collapsed = Boolean.TRUE.equals(saved.get("collapsed"));

		List<String> dropped = new ArrayList<>();
		Map<String, Object> cleaned = cleanAgainst(cube, selection, dropped);

		// Nothing the cube still offers: the author's default is a view that works, and an empty one
		// is not. The names that went are still said, so the viewer knows why it looks different.
		if (list(cleaned.get("dimensions")).isEmpty() && list(cleaned.get("measures")).isEmpty())
			return new ResolvedView(viewOf(author, collapsed), dropped);

		return new ResolvedView(viewOf(cleaned, collapsed), dropped);
	}

	/** Every name the cube no longer offers, taken out and written down. */
	@SuppressWarnings("unchecked")
	private static Map<String, Object> cleanAgainst(CubeOptions cube, Map<String, Object> selection,
			List<String> dropped) {

		Map<String, Object> cleaned = new LinkedHashMap<>();

		cleaned.put("dimensions", keptNames(offered(cube.getDimensions()), selection.get("dimensions"), dropped));
		cleaned.put("measures", keptNames(offered(cube.getMeasures()), selection.get("measures"), dropped));
		cleaned.put("segments", keptNames(offered(cube.getSegments()), selection.get("segments"), dropped));

		Map<String, Object> grains = new LinkedHashMap<>();
		if (selection.get("granularities") instanceof Map) {
			for (Map.Entry<String, Object> grain : ((Map<String, Object>) selection.get("granularities"))
					.entrySet()) {
				if (named(offered(cube.getDimensions()), grain.getKey()) != null)
					grains.put(grain.getKey(), grain.getValue());
				else
					dropped.add(grain.getKey());
			}
		}
		cleaned.put("granularities", grains);

		List<Object> filters = new ArrayList<>();
		for (Object filter : list(selection.get("filters"))) {
			String member = filter instanceof Map
					? Objects.toString(((Map<String, Object>) filter).get("member"), "")
					: "";
			if (isOffered(cube, member))
				filters.add(filter);
			else
				dropped.add(member);
		}
		cleaned.put("filters", filters);

		List<Object> order = new ArrayList<>();
		for (Object one : list(selection.get("order"))) {
			String member = one instanceof Map
					? Objects.toString(((Map<String, Object>) one).get("member"), "")
					: Objects.toString(one, "").split(" ")[0];
			if (isOffered(cube, member))
				order.add(one);
			else
				dropped.add(member);
		}
		cleaned.put("order", order);

		if (selection.get("limit") instanceof Number)
			cleaned.put("limit", limitOf(selection));
		if (selection.get("totals") != null)
			cleaned.put("totals", Boolean.TRUE.equals(selection.get("totals")));

		return cleaned;
	}

	/** The names of this block that are still on offer; the rest are named in {@code dropped}. */
	private static List<String> keptNames(List<Map<String, Object>> members, Object asked, List<String> dropped) {

		List<String> kept = new ArrayList<>();
		for (Object one : list(asked)) {
			String name = Objects.toString(one, "");
			int dot = name.indexOf('.');
			String member = dot > 0 ? name.substring(0, dot) : name;
			if (named(members, member) != null)
				kept.add(name);
			else if (!member.isEmpty())
				dropped.add(member);
		}
		return kept;
	}

	/** A filter and an order may name a dimension or a measure, as {@code /query} has it. */
	private static boolean isOffered(CubeOptions cube, String name) {
		return named(offered(cube.getDimensions()), name) != null
				|| named(offered(cube.getMeasures()), name) != null;
	}

	/**
	 * What a {@code PUT} may save: the same request {@code /query} would take, checked by the same
	 * two calls, with the same cap on {@code limit}.
	 */
	private static Map<String, Object> validViewOf(CubeOptions cube, Map<String, Object> body) {

		Object sent = body == null ? null : body.get("selection");
		if (!(sent instanceof Map)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A view is a selection: "
					+ "{ \"selection\": { \"dimensions\": [], \"measures\": [] }, \"collapsed\": false }.");
		}

		@SuppressWarnings("unchecked")
		Map<String, Object> asked = asked((Map<String, Object>) sent);
		assertEveryNameIsOffered(cube, asked);

		if (asked.get("limit") != null)
			asked.put("limit", limitOf(asked));

		return viewOf(asked, Boolean.TRUE.equals(body.get("collapsed")));
	}

	private static Map<String, Object> viewOf(Map<String, Object> selection, boolean collapsed) {

		Map<String, Object> view = new LinkedHashMap<>();
		view.put("v", VIEW_VERSION);
		view.put("selection", selection);
		view.put("collapsed", collapsed);
		return view;
	}

	/**
	 * A stored value that is not readable any more — an older shape, a row edited by hand — reads as
	 * "nothing saved" rather than as a failure: a dashboard that cannot be opened is worse than one
	 * that opens on its author's default.
	 */
	private static Map<String, Object> readView(String json) {
		try {
			return VIEW_JSON.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {
			});
		} catch (Exception unreadable) {
			log.warn("A saved cube view could not be read and was ignored: {}", unreadable.getMessage());
			return null;
		}
	}

	private static String writeView(Map<String, Object> value) {
		try {
			return VIEW_JSON.writeValueAsString(value);
		} catch (Exception e) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This view could not be saved: "
					+ e.getMessage());
		}
	}

	/**
	 * The cube this widget names, live from {@code config/cubes} or {@code config/samples-cubes}: a
	 * dashboard shows whatever the cube says today, which is the point of a semantic layer.
	 *
	 * <p>The sandbox check runs first, as it does on every endpoint of this server that compiles a
	 * DSL — the file is about to be compiled and run for this caller, whoever saved it.
	 */
	private CubeOptions cubeOf(Widget widget) throws Exception {

		Map<String, Object> cubeData = cubesService.load(widget.cubeId());
		String dslCode = Objects.toString(cubeData.get("dslCode"), "");
		if (dslCode.isBlank()) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "The live cube '" + widget.componentId()
					+ "' of this dashboard reads the cube '" + widget.cubeId() + "', which no longer exists.");
		}
		limitsSandbox.check(dslCode);

		CubeOptions file = cubesService.parseDsl(dslCode);
		String cubeName = widget.cubeName() != null ? widget.cubeName() : (String) cubeData.get("cubeName");
		try {
			return CubeSqlGenerator.pickCube(file, cubeName);
		} catch (IllegalArgumentException badCube) {
			throw badRequest(badCube);
		}
	}

	/** The generated query, for the database the widget's own connection is. */
	private static CubeQuery generated(CubeOptions cube, Map<String, Object> asked, String vendor) throws Exception {
		try {
			return CubeSqlGenerator.buildQuery(cube, asked, vendor);
		} catch (IllegalArgumentException badRequest) {
			throw badRequest(badRequest);
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// What a request may say
	// ═══════════════════════════════════════════════════════════════════════════

	/** The request, with only the keys a viewer may send — and a refusal for the ones they may not. */
	private static Map<String, Object> asked(Map<String, Object> request) {

		Map<String, Object> sent = request != null ? request : Map.of();

		for (String refused : REFUSED_KEYS) {
			if (sent.get(refused) != null) {
				throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A live cube answers about the cube its "
						+ "dashboard declares, read through the connection that dashboard declares, so '" + refused
						+ "' is not something this request may say. Ask with dimensions, measures, segments, "
						+ "granularities, filters, order and limit.");
			}
		}

		// The one key of a filter that is SQL rather than a value. The server puts one there, from
		// the cube's own text, when it drills; a request that carries one is refused rather than
		// cleaned up, because there is no innocent request that would.
		for (Object filter : list(sent.get("filters"))) {
			if (filter instanceof Map && ((Map<?, ?>) filter).get(CubeSqlGenerator.SERVER_CONDITION) != null) {
				throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A filter says which member to "
						+ "compare and what to compare it with. It does not carry SQL.");
			}
		}

		Map<String, Object> asked = new LinkedHashMap<>();
		for (String key : QUERY_KEYS) {
			if (sent.get(key) != null)
				asked.put(key, sent.get(key));
		}
		return asked;
	}

	/** {@link #DEFAULT_LIMIT} when nothing is asked for, never more than {@link #MAX_LIMIT}. */
	private static int limitOf(Map<String, Object> asked) {

		int limit = asked.get("limit") instanceof Number ? ((Number) asked.get("limit")).intValue() : DEFAULT_LIMIT;
		if (limit <= 0)
			limit = DEFAULT_LIMIT;
		return Math.min(limit, MAX_LIMIT);
	}

	/**
	 * Every name in the request is one this cube declares and offers.
	 *
	 * <p>The generator refuses a member it cannot find too, and would say so in the same shape. This
	 * runs first all the same, for the one thing the generator cannot know: a member the author
	 * marked {@code public false} exists, generates perfectly good SQL, and is still not on offer.
	 * Doing it here means the answer is the same sentence whichever of the two noticed.
	 */
	@SuppressWarnings("unchecked")
	private static void assertEveryNameIsOffered(CubeOptions cube, Map<String, Object> asked) {

		for (Object dimension : list(asked.get("dimensions"))) {
			// A granularity rides on the name: Order Date.month is the dimension Order Date.
			String name = Objects.toString(dimension, "");
			int dot = name.indexOf('.');
			assertOffered(cube, "dimension", dot > 0 ? name.substring(0, dot) : name);
		}
		if (asked.get("granularities") instanceof Map) {
			for (Object name : ((Map<String, Object>) asked.get("granularities")).keySet()) {
				assertOffered(cube, "dimension", Objects.toString(name, ""));
			}
		}
		for (Object measure : list(asked.get("measures"))) {
			assertOffered(cube, "measure", Objects.toString(measure, ""));
		}
		for (Object segment : list(asked.get("segments"))) {
			assertOffered(cube, "segment", Objects.toString(segment, ""));
		}
		for (Object filter : list(asked.get("filters"))) {
			if (filter instanceof Map)
				assertMemberOffered(cube, Objects.toString(((Map<String, Object>) filter).get("member"), ""));
		}
		for (Object order : list(asked.get("order"))) {
			String member = order instanceof Map
					? Objects.toString(((Map<String, Object>) order).get("member"), "")
					: Objects.toString(order, "").split(" ")[0];
			// An order names a column of the answer, and a grained dimension is one of them:
			// "Order Date.month" is sorted by as readily as it is grouped by, so the grain rides on
			// the name here exactly as it does above. A filter is not the same thing - it names a
			// member to hold to a value, which a grain is not - and keeps the stricter reading.
			int dot = member.indexOf('.');
			assertMemberOffered(cube, dot > 0 ? member.substring(0, dot) : member);
		}
	}

	/** A filter and an order may name a dimension or a measure; both must be on offer. */
	private static void assertMemberOffered(CubeOptions cube, String name) {

		if (named(offered(cube.getDimensions()), name) != null || named(offered(cube.getMeasures()), name) != null)
			return;

		throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This cube does not offer '" + name
				+ "'. Its dimensions are: " + namesOf(offered(cube.getDimensions()))
				+ ". Its measures are: " + namesOf(offered(cube.getMeasures())) + ".");
	}

	/** One name, in the block it is supposed to be in. */
	private static void assertOffered(CubeOptions cube, String block, String name) {

		List<Map<String, Object>> members = offered(blockOf(cube, block));
		if (named(members, name) != null)
			return;

		throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This cube has no " + block + " called '" + name
				+ "' on offer. Its " + block + "s are: " + namesOf(members) + ".");
	}

	private static List<Map<String, Object>> blockOf(CubeOptions cube, String block) {
		switch (block) {
		case "dimension":
			return cube.getDimensions();
		case "measure":
			return cube.getMeasures();
		default:
			return cube.getSegments();
		}
	}

	/**
	 * The members the author offers: {@code public false} hides one from a viewer, which is what the
	 * key is for. It stays in the cube, and the author's own screens still show it.
	 */
	private static List<Map<String, Object>> offered(List<Map<String, Object>> members) {

		List<Map<String, Object>> onOffer = new ArrayList<>();
		for (Map<String, Object> member : members != null ? members : List.<Map<String, Object>>of()) {
			if (!Boolean.FALSE.equals(member.get("public")))
				onOffer.add(member);
		}
		return onOffer;
	}

	private static Map<String, Object> named(List<Map<String, Object>> members, String name) {

		String wanted = Objects.toString(name, "").trim();
		if (wanted.isEmpty())
			return null;
		for (Map<String, Object> member : members) {
			if (wanted.equals(Objects.toString(member.get("name"), "")))
				return member;
		}
		return null;
	}

	private static String namesOf(List<Map<String, Object>> members) {

		List<String> names = new ArrayList<>();
		for (Map<String, Object> member : members) {
			names.add(Objects.toString(member.get("name"), ""));
		}
		return names.isEmpty() ? "(none)" : String.join(", ", names);
	}

	private static List<Object> list(Object value) {
		return value instanceof List ? new ArrayList<>((List<?>) value) : List.of();
	}

	private static String text(Object value) {
		return Objects.toString(value, "").trim();
	}

	/**
	 * A cube that cannot answer what was asked is a bad request, not a server failure, and the
	 * generator's sentence names the member and what is wrong with it. {@code CubesController} has
	 * an exception handler for exactly this; {@code ReportsController} serves everything else a
	 * report does, where an {@link IllegalArgumentException} still means a bug, so the translation
	 * happens here instead of widening that controller's rules.
	 */
	private static ResponseStatusException badRequest(IllegalArgumentException refused) {
		log.warn("Refused a live cube request: {}", refused.getMessage());
		return new ResponseStatusException(HttpStatus.BAD_REQUEST, refused.getMessage());
	}
}
