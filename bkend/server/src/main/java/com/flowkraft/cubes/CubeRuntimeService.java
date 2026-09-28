package com.flowkraft.cubes;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.flowkraft.cubes.CubeWidgets.Widget;
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
			"dimensions", "measures", "segments", "granularities", "filters", "order", "limit");

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
	public Map<String, Object> meta(String reportId, String componentId) throws Exception {

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

		meta.put("initial", widget.initial());
		meta.put("display", widget.display());
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

	/** The rows this selection asks for, and whether there were more of them. */
	public Map<String, Object> query(String reportId, String componentId, Map<String, Object> request)
			throws Exception {

		Widget widget = CubeWidgets.of(reportId, componentId);
		CubeOptions cube = cubeOf(widget);

		Map<String, Object> asked = asked(request);
		assertEveryNameIsOffered(cube, asked);

		int limit = limitOf(asked);
		// One more row than the answer may carry: that is how a cut answer is told from a whole one,
		// the same way a cut filter list is.
		asked.put("limit", limit + 1);

		CubeQuery query = generated(cube, asked, database.vendorOf(widget.connectionId()));
		List<Map<String, Object>> rows = database.read(widget.connectionId(), query.getSql(), query.getParams(),
				limit + 1);

		boolean truncated = rows.size() > limit;
		Map<String, Object> answer = new LinkedHashMap<>();
		answer.put("rows", new ArrayList<>(truncated ? rows.subList(0, limit) : rows));
		answer.put("truncated", truncated);
		log.debug("Live cube '{}' of report '{}' answered {} rows{}", componentId, reportId,
				((List<?>) answer.get("rows")).size(), truncated ? " (cut)" : "");
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

		Widget widget = CubeWidgets.of(reportId, componentId);
		CubeOptions cube = cubeOf(widget);

		assertOffered(cube, "dimension", Objects.toString(dimension, ""));
		try {
			return cubeFilterOptions.options(cube, dimension, widget.connectionId(), search);
		} catch (IllegalArgumentException badRequest) {
			throw badRequest(badRequest);
		}
	}

	// ═══════════════════════════════════════════════════════════════════════════
	// The cube behind a widget
	// ═══════════════════════════════════════════════════════════════════════════

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
			assertMemberOffered(cube, member);
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
