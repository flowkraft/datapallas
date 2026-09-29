package com.flowkraft.cubes;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.flowkraft.queries.ConnectionFactory;
import com.flowkraft.queries.SqlOptionRows;
import com.flowkraft.reporting.dsl.cube.CubeOptions;
import com.sourcekraft.documentburster.common.reportparameters.ReportParameter;
import com.sourcekraft.documentburster.common.db.DatabaseConnectionManager;
import com.sourcekraft.documentburster.common.db.SqlExecutor;
import com.sourcekraft.documentburster.common.settings.model.ServerDatabaseSettings;

/**
 * The values a viewer may filter a dimension by.
 *
 * <p>One helper for both ends of the product: the cube editor asks it through
 * {@code POST /api/cubes/{cubeId}/filter-options}, and a shown cube asks it through the runtime
 * twin. Neither of them decides anything about the list — where it comes from, how it is searched
 * and how long it may be are decided here, once.
 *
 * <p><b>Where the list comes from.</b> The author may write the dimension's own
 * {@code filter_options 'SELECT …'}; otherwise the generator writes the query, which is what makes
 * a dimension on a joined table list correctly: the generated query carries the dimension's joins,
 * its grouping and this database's own date handling, because it is the same generator the cube's
 * own SQL comes from.
 *
 * <p><b>Why the author's SQL is never wrapped.</b> Wrapping it in {@code SELECT * FROM (…)} would
 * let this class add its own {@code ORDER BY} and row cap — and it would break the author's
 * {@code ORDER BY} on SQL Server, which refuses one inside a subquery without a {@code TOP}, and
 * it would need column names this class does not know. So the statement runs exactly as written,
 * at most {@link #READ_LIMIT} rows are read from it, and {@code search} is applied here in Java
 * rather than pushed into somebody else's SQL.
 *
 * <p><b>Why at most {@link #MAX_VALUES} values go back.</b> {@code <rb-parameters>} loads every
 * option into the browser and searches them there, which is right for fifty countries and hopeless
 * for a hundred thousand customers. So a cut list comes back with {@code truncated: true}, and the
 * renderer then asks this endpoint again with {@code search} as the viewer types.
 *
 * <p><b>A cube whose conditions use the dashboard's parameters.</b> The generated query carries
 * the cube's {@code condition} lines like any other SELECT, so the list offered for a filter is
 * the list of values that exist <i>in the chosen period</i> — Show Me over a quarter offers the
 * countries that bought in that quarter. The values come from the caller where the caller has
 * them, and from the dashboard's own defaults otherwise, which is what the editor's own preview of
 * the list is.
 *
 * <p><b>ANSI SQL only — no vendor branch in this file.</b> The generated query gets its vendor
 * forms from {@link CubeSqlDialect} through {@link CubeSqlGenerator}, and the author's SQL is
 * whatever the author wrote.
 */
@Component
public class CubeFilterOptions {

	private static final Logger log = LoggerFactory.getLogger(CubeFilterOptions.class);

	/** The most values an answer carries. One more than this is what makes it {@code truncated}. */
	public static final int MAX_VALUES = 200;

	/** The most rows read from an author's {@code filter_options} SQL. */
	public static final int READ_LIMIT = 10_000;

	/** One more than {@link #MAX_VALUES}: reading it is how a cut list is told from a whole one. */
	private static final int PROBE = MAX_VALUES + 1;

	/** Where the data's today comes from, for a parameter whose default is relative to it (R7). */
	@Autowired(required = false)
	private CubeDataToday dataToday = new CubeDataToday();

	/** The test seam of {@link CubeDataToday}: a pinned day, so the checks' numbers stay true. */
	void useDataToday(CubeDataToday dataToday) {
		this.dataToday = dataToday;
	}

	/**
	 * The options of one dimension of one cube.
	 *
	 * @param cube         the cube the dimension is on — already picked out of its file
	 * @param dimension    the dimension's name, as the cube declares it
	 * @param connectionId the connection to read from
	 * @param search       the text the viewer has typed, or null for the start of the list
	 * @return {@code {values: [[value, label], …], truncated: boolean}}
	 */
	public Map<String, Object> options(CubeOptions cube, String dimension, String connectionId, String search)
			throws Exception {
		return options(cube, dimension, connectionId, search, Map.of());
	}

	/**
	 * The same list, for whoever is asking: the generated query carries the cube's
	 * {@code access_filter}, and {@link CubeVariableBinding} gives its {@code ${dp_…}} variables
	 * this caller's values - so the values offered for a filter are the values this caller may see,
	 * in the editor and in a published dashboard alike.
	 *
	 * @param userVariables {@code UserVariables.of(request)} for this caller; empty means nobody in
	 *                      particular, and every variable then binds empty and matches no row
	 */
	public Map<String, Object> options(CubeOptions cube, String dimension, String connectionId, String search,
			Map<String, String> userVariables) throws Exception {
		return options(cube, dimension, connectionId, search, userVariables, Map.of());
	}

	/**
	 * The same list for a cube with parameters: the values that exist in the period the viewer
	 * picked.
	 *
	 * @param asked the request's own {@code params}, or an empty map to use the cube's defaults
	 */
	public Map<String, Object> options(CubeOptions cube, String dimension, String connectionId, String search,
			Map<String, String> userVariables, Map<String, Object> asked) throws Exception {
		return options(cube, dimension, connectionId, search, userVariables, asked, List.of());
	}

	/**
	 * The same list against the parameters one dashboard declares (R1). The author's own endpoint
	 * declares none: a name its conditions use is then left with no value, which drops that
	 * condition and offers the values of every row the cube answers.
	 */
	public Map<String, Object> options(CubeOptions cube, String dimension, String connectionId, String search,
			Map<String, String> userVariables, Map<String, Object> asked, List<ReportParameter> declared)
			throws Exception {
		return options(cube, dimension, connectionId, search, userVariables, asked, declared, List.of());
	}

	/**
	 * The same list, narrowed by the dashboard's filter bar (R8).
	 *
	 * <p>A viewer who has picked Germany is offered the categories Germany bought, not every
	 * category the shop has ever sold: a list of values that cannot answer a single row is worse
	 * than a short one. The bound filters come from the widget's own entry, already turned into
	 * filters by {@code CubeParamBindings}, and are ANDed with this dimension's own
	 * {@code set} - and with the cube's {@code access_filter}, which the generated query carries
	 * either way.
	 *
	 * <p>An author's own {@code filter_options} SQL is left alone: it is their statement, and this
	 * server does not rewrite it.
	 */
	public Map<String, Object> options(CubeOptions cube, String dimension, String connectionId, String search,
			Map<String, String> userVariables, Map<String, Object> asked, List<ReportParameter> declared,
			List<Map<String, Object>> bound) throws Exception {

		Map<String, Object> member = dimensionOf(cube, dimension);
		String authorSql = Objects.toString(member.get("filter_options"), "").trim();
		String type = Objects.toString(member.get("type"), "").trim().toLowerCase(Locale.ROOT);

		// A date and a yes/no need no list: the renderer offers a range, or Any/Yes/No, from the
		// type alone. An author who writes filter_options on one of them is answered all the same.
		if (authorSql.isEmpty() && ("time".equals(type) || "boolean".equals(type))) {
			return answer(List.of(), false);
		}

		try (DatabaseConnectionManager dbManager = ConnectionFactory.newConnectionManager()) {
			SqlExecutor executor = new SqlExecutor(dbManager);

			if (!authorSql.isEmpty()) {
				List<Map<String, Object>> rows = executor.queryOn(connectionId, authorSql, null, READ_LIMIT);
				boolean readWholeCap = rows.size() >= READ_LIMIT;
				List<List<String>> values = searched(SqlOptionRows.pairs(rows), search);
				log.debug("filter_options of '{}' read {} rows, kept {}", dimension, rows.size(), values.size());
				return answer(values, readWholeCap || values.size() > MAX_VALUES);
			}

			Map<String, Object> parameters = DashboardParameters.values(declared, cube,
					Map.of(DashboardParameters.REQUEST_KEY, asked != null ? asked : Map.of()),
					() -> dataToday.of(connectionId));
			CubeQuery query = CubeVariableBinding.bound(CubeSqlGenerator.buildQuery(cube,
					generatedRequest(dimension, search, bound), vendorOf(connectionId)), userVariables,
					parameters, DashboardParameters.types(declared));
			List<Map<String, Object>> rows = executor.queryOn(connectionId, query.getSql(), query.getParams(),
					PROBE);
			List<List<String>> values = SqlOptionRows.pairs(rows);
			return answer(values, values.size() > MAX_VALUES);
		}
	}

	/**
	 * The query the generator writes when the author wrote none: this dimension alone, no measure,
	 * ordered by it, the rows that have a value, and one more than the answer may carry so a cut
	 * list is told from a whole one. {@code search} goes in as the generator's own
	 * {@code contains}, so the database does the searching while the list is still long.
	 */
	static Map<String, Object> generatedRequest(String dimension, String search) {
		return generatedRequest(dimension, search, List.of());
	}

	/** The same query with the dashboard's own filters on it (R8), so the list is of what it shows. */
	static Map<String, Object> generatedRequest(String dimension, String search,
			List<Map<String, Object>> bound) {

		List<Map<String, Object>> filters = new ArrayList<>();
		filters.add(Map.of("member", dimension, "operator", "set"));
		if (search != null && !search.isBlank()) {
			filters.add(Map.of("member", dimension, "operator", "contains", "values", List.of(search.trim())));
		}
		if (bound != null) {
			filters.addAll(bound);
		}

		Map<String, Object> request = new LinkedHashMap<>();
		request.put("dimensions", List.of(dimension));
		request.put("measures", List.of());
		request.put("filters", filters);
		request.put("order", List.of(Map.of("member", dimension, "dir", "asc")));
		request.put("limit", PROBE);
		return request;
	}

	/** The rows whose label holds the text, whatever the case — the search of an author's SQL. */
	static List<List<String>> searched(List<List<String>> values, String search) {

		if (search == null || search.isBlank()) return values;

		String wanted = search.trim().toLowerCase(Locale.ROOT);
		List<List<String>> kept = new ArrayList<>();
		for (List<String> pair : values) {
			if (pair.get(1).toLowerCase(Locale.ROOT).contains(wanted)) kept.add(pair);
		}
		return kept;
	}

	/** The answer, cut to {@link #MAX_VALUES} values, saying whether it was cut. */
	static Map<String, Object> answer(List<List<String>> values, boolean truncated) {

		List<List<String>> kept = values.size() > MAX_VALUES ? values.subList(0, MAX_VALUES) : values;
		Map<String, Object> answer = new LinkedHashMap<>();
		answer.put("values", new ArrayList<>(kept));
		answer.put("truncated", truncated);
		return answer;
	}

	/**
	 * The dimension by that name, or a bad request naming the ones the cube does have — the same
	 * answer the generator gives for a member it cannot find, because it is the same mistake.
	 */
	private static Map<String, Object> dimensionOf(CubeOptions cube, String dimension) {

		String name = Objects.toString(dimension, "").trim();
		List<Map<String, Object>> dimensions = cube.getDimensions() != null ? cube.getDimensions() : List.of();

		if (!name.isEmpty()) {
			for (Map<String, Object> member : dimensions) {
				if (name.equals(Objects.toString(member.get("name"), ""))) return member;
			}
		}

		List<String> names = new ArrayList<>();
		for (Map<String, Object> member : dimensions) {
			names.add(Objects.toString(member.get("name"), ""));
		}
		throw new IllegalArgumentException("This cube has no dimension called '" + name
				+ "', so there are no values to filter by. Its dimensions are: " + String.join(", ", names) + ".");
	}

	/**
	 * The database this connection is, as the generator's vendor key: the connection's own type
	 * when it has one, and plain ANSI otherwise.
	 */
	static String vendorOf(String connectionId) throws Exception {

		try (DatabaseConnectionManager dbManager = ConnectionFactory.newConnectionManager()) {
			ServerDatabaseSettings settings = dbManager.getServerDatabaseSettings(connectionId);
			if (settings != null && settings.type != null) return settings.type;
		}
		return CubeSqlDialect.DEFAULT_KEY;
	}
}
