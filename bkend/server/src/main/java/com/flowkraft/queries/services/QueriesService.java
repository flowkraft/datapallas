package com.flowkraft.queries.services;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import org.springframework.beans.factory.annotation.Autowired;

import com.flowkraft.connections.ConnectionsService;
import com.flowkraft.cubes.CubeDataToday;
import com.flowkraft.cubes.CubeDates;
import com.flowkraft.iam.limits.ConnectionNotAllowedException;
import com.flowkraft.iam.limits.LimitsService;
import com.flowkraft.queries.ConnectionFactory;
import com.sourcekraft.documentburster.common.db.DatabaseConnectionManager;
import com.sourcekraft.documentburster.common.db.DatabaseHelper;
import com.sourcekraft.documentburster.common.db.DatabaseSchemaFetcher;
import com.sourcekraft.documentburster.common.db.SqlExecutor;
import com.sourcekraft.documentburster.common.db.schema.SchemaInfo;
import com.flowkraft.exploredata.export.SqlParameterLines;
import com.sourcekraft.documentburster.common.reportparameters.BuiltinVariables;
import com.sourcekraft.documentburster.common.reportparameters.DateParameters;
import com.sourcekraft.documentburster.common.reportparameters.ParameterTypes;

/**
 * Service for ad-hoc SQL query execution and database schema exploration.
 * Wires existing SqlExecutor and DatabaseSchemaFetcher behind a clean API.
 */
@Service
public class QueriesService {

	private static final Logger log = LoggerFactory.getLogger(QueriesService.class);

	/** Who ran which ad-hoc query, on which connection, and what came of it. */
	private static final Logger auditLog = LoggerFactory.getLogger("audit.run-sql");

	private final DatabaseSchemaFetcher schemaFetcher = new DatabaseSchemaFetcher();

	@Autowired
	private ConnectionsService connectionsService;

	@Autowired
	private LimitsService limitsService;

	private CubeDataToday cubeDataToday = new CubeDataToday();

	/**
	 * Execute a SQL query against any configured database connection.
	 * When params are provided, ${param} / #{param} placeholders in the SQL are
	 * converted to JDBI :param syntax before binding — injection-safe via bindMap.
	 * Only parameters actually referenced in the SQL are bound, so dashboards may
	 * freely mix filtered widgets and unfiltered context widgets on the same canvas.
	 */
	public List<Map<String, Object>> executeQuery(String connectionId, String sql, Map<String, Object> params)
			throws Exception {
		return executeQuery(connectionId, sql, params, null);
	}

	/**
	 * The same, with the type each parameter was declared with on the dashboard
	 * ({@code paramTypes}, e.g. {@code {to: "Date"}}). Every value arrives as text, so without the
	 * types a date is bound as a string: an error on PostgreSQL, and silently the wrong rows on
	 * SQLite. A caller that has no types (the Groovy {@code dbSql} proxy, a probe) passes null and
	 * binds as before.
	 */
	public List<Map<String, Object>> executeQuery(String connectionId, String sql, Map<String, Object> params,
			Map<String, String> paramTypes) throws Exception {

		PreparedSql prepared = prepare(sql, params, paramTypes);
		// Every line used a parameter and none had a value: there is no question left to ask, and
		// the published script answers such a widget with no rows too.
		if (prepared.sql == null || prepared.sql.isBlank())
			return List.of();
		try (DatabaseConnectionManager dbManager = createConnectionManager(connectionId)) {
			SqlExecutor executor = new SqlExecutor(dbManager);
			return executor.queryOn(connectionId, prepared.sql, prepared.params);
		}
	}

	/**
	 * Execute one ad-hoc SELECT typed by a person or written by an AI Hub agent
	 * ({@code POST /api/queries/run-sql}).
	 *
	 * <p>Three things set this apart from {@link #executeQuery}, which runs a report's own SQL:
	 * {@link AdHocSqlGuard} refuses anything that is not a single plain SELECT/WITH, the query
	 * runs in a transaction that is always rolled back, and every call is written to the
	 * {@code audit.run-sql} log. Report SQL, the Groovy {@code dbSql} proxy and the analytics
	 * paths are unchanged: they are authored, reviewed and stored, not typed at a prompt.
	 */
	public List<Map<String, Object>> executeAdHocQuery(String connectionId, String sql, Map<String, Object> params)
			throws Exception {
		return executeAdHocQuery(connectionId, sql, params, null);
	}

	/** The same, with the declared type of each parameter; see {@link #executeQuery}. */
	public List<Map<String, Object>> executeAdHocQuery(String connectionId, String sql, Map<String, Object> params,
			Map<String, String> paramTypes) throws Exception {

		long startedAt = System.currentTimeMillis();

		// Before the guard: which database a person may reach is a question about the person, and it
		// is answered whatever the SQL says. Audited like any other refusal.
		try {
			limitsService.assertConnectionAllowed(connectionId);
		} catch (ConnectionNotAllowedException refused) {
			audit(connectionId, sql, "refused", -1, startedAt, refused.getReason());
			throw refused;
		}

		try {
			AdHocSqlGuard.check(sql);
		} catch (RuntimeException refused) {
			audit(connectionId, sql, "refused", -1, startedAt, refused.getMessage());
			throw refused;
		}

		PreparedSql prepared = prepare(sql, withRelativeDays(connectionId, params), paramTypes);
		if (prepared.sql == null || prepared.sql.isBlank()) {
			audit(connectionId, sql, "ok", 0, startedAt, "every line was a filter with no value");
			return List.of();
		}
		try (DatabaseConnectionManager dbManager = createConnectionManager(connectionId)) {
			SqlExecutor executor = new SqlExecutor(dbManager);
			List<Map<String, Object>> rows = executor.queryOnReadOnly(connectionId, prepared.sql, prepared.params);
			audit(connectionId, sql, "ok", rows.size(), startedAt, null);
			return rows;
		} catch (Exception e) {
			audit(connectionId, sql, "error", -1, startedAt, e.getMessage());
			throw e;
		}
	}

	/**
	 * A filter value written {@code {dataToday:startOf year}} is the day the data on this connection
	 * calls today, turned into that day before it is bound - the way a published dashboard serves its
	 * defaults and the live-cube endpoints read their filters. The canvas holds a dashboard filter at
	 * the default its author wrote, so without this the query was handed the token itself and a date
	 * parameter refused it. Values that name no token are left as they are, and the marker table is
	 * read only when one does.
	 */
	private Map<String, Object> withRelativeDays(String connectionId, Map<String, Object> params) {

		if (params == null)
			return null;

		boolean anyRelative = false;
		for (Object value : params.values())
			anyRelative = anyRelative || (value instanceof String text && CubeDates.mentions(text));
		if (!anyRelative)
			return params;

		java.time.LocalDate dataToday = cubeDataToday.ofDashboards(connectionId);
		Map<String, Object> resolved = new java.util.LinkedHashMap<>(params);
		resolved.replaceAll((name, value) ->
				value instanceof String text && CubeDates.mentions(text) ? CubeDates.resolve(text, dataToday) : value);
		return resolved;
	}

	/** One line per ad-hoc call, on its own logger so it can be routed to its own file. */
	private void audit(String connectionId, String sql, String outcome, int rows, long startedAt, String detail) {

		org.springframework.security.core.Authentication authentication = org.springframework.security.core.context.SecurityContextHolder
				.getContext().getAuthentication();
		String user = authentication != null ? authentication.getName() : "anonymous";

		String oneLine = sql == null ? "" : sql.replaceAll("\\s+", " ").trim();
		if (oneLine.length() > 500)
			oneLine = oneLine.substring(0, 500) + "…";

		auditLog.info("user={} connection={} outcome={} rows={} ms={} sql={}{}", user, connectionId, outcome, rows,
				System.currentTimeMillis() - startedAt, oneLine, detail != null ? " detail=" + detail : "");
	}

	/**
	 * The SQL and the parameter map as they are handed to JDBI.
	 *
	 * <p>Readable from outside because {@link #prepare} is: what a dashboard parameter becomes
	 * before it is bound is worth asking of the real thing, not of a copy of it.
	 */
	public static final class PreparedSql {
		private final String sql;
		private final Map<String, Object> params;

		private PreparedSql(String sql, Map<String, Object> params) {
			this.sql = sql;
			this.params = params;
		}

		/** The SQL with {@code ${p}} / {@code #{p}} turned into JDBI's {@code :p}. */
		public String sql() {
			return sql;
		}

		/** The values to bind, each already the Java type its parameter was declared with. */
		public Map<String, Object> params() {
			return params;
		}
	}

	/**
	 * Converts ${param} / #{param} placeholders to JDBI :param syntax and builds the bind map.
	 * Shared by the report path and the ad-hoc path so both bind values the same way.
	 */
	public static PreparedSql prepare(String sql, Map<String, Object> params, Map<String, String> paramTypes) {

		Map<String, Object> boundParams = null;
		if (params != null && !params.isEmpty()) {
			// A date range of whole days ends at midnight after the last day, and the generated SQL
			// names that day as a parameter of its own (`${to__next_day}`). Its value is derived here,
			// where the day it comes from is bound, so this path and the published script - which
			// writes a call to the same class - answer with the same rows.
			Map<String, String> derived = DateParameters.derivedValues(sql, params, paramTypes);
			if (!derived.isEmpty()) {
				Map<String, Object> withDerived = new java.util.LinkedHashMap<>(params);
				Map<String, String> withDerivedTypes = new java.util.LinkedHashMap<>();
				if (paramTypes != null)
					withDerivedTypes.putAll(paramTypes);
				for (Map.Entry<String, String> e : derived.entrySet()) {
					withDerived.put(e.getKey(), e.getValue());
					// The derived day binds as what it derives from: a date.
					String baseType = withDerivedTypes.get(DateParameters.baseName(e.getKey()));
					if (baseType != null)
						withDerivedTypes.put(e.getKey(), baseType);
				}
				params = withDerived;
				paramTypes = withDerivedTypes;
			}
			// A filter with no value is not a filter: the line that uses it is left out and the
			// query answers as if it were not there - the rule the published script has always
			// applied, read from the SQL by the parser both of them share.
			sql = SqlParameterLines.linesThatApply(sql, params.keySet(), params);
			if (sql == null || sql.isBlank())
				return new PreparedSql(sql, null);
			sql = DatabaseHelper.convertToJdbiParameters(sql, params);
			java.util.Set<String> listBound = DatabaseHelper.findListBoundParameters(sql);
			boundParams = new java.util.LinkedHashMap<>();
			for (Map.Entry<String, Object> e : params.entrySet()) {
				String name = e.getKey();
				Object value = e.getValue();
				String declaredType = paramTypes == null ? null : paramTypes.get(name);
				if (listBound.contains(name)) {
					// IN-list param: split CSV string into a List so SqlExecutor binds via bindList.
					// Each value becomes the declared type — a list of dates is bound as dates. A list
					// with no declared type keeps the old guess (Long → Double → String), which is
					// there so a numeric column does not get a VARCHAR bind that Postgres rejects.
					String csv = value == null ? "" : String.valueOf(value);
					java.util.List<Object> list = new java.util.ArrayList<>();
					for (String s : csv.split(",")) {
						String t = s.trim();
						if (t.isEmpty()) continue;
						if (org.apache.commons.lang3.StringUtils.isNotBlank(declaredType)) {
							list.add(ParameterTypes.typed(name, declaredType, t));
							continue;
						}
						try {
							list.add(Long.parseLong(t));
						} catch (NumberFormatException e1) {
							try {
								list.add(Double.parseDouble(t));
							} catch (NumberFormatException e2) {
								list.add(t);
							}
						}
					}
					// A built-in keeps its line whatever it holds, so this list can be empty - a
					// person in no group. It binds one empty value: `IN ('')` matches no row, which
					// is the answer, where an empty list is not valid SQL at all. Everything else
					// cannot be empty here: a parameter with nothing in it took its line with it
					// above, so there is no `IN (…)` left to bind.
					if (list.isEmpty() && BuiltinVariables.isBuiltinName(name))
						list.add("");
					boundParams.put(name, list);
				} else if (usesNamedParameter(sql, name)) {
					boundParams.put(name,
							value instanceof String text ? ParameterTypes.typed(name, declaredType, text) : value);
				}
			}
		}
		return new PreparedSql(sql, boundParams);
	}

	/**
	 * True when the SQL uses this parameter by name.
	 *
	 * <p>Not {@code contains(":" + name)}: the name of one parameter can be the beginning of
	 * another's, and the derived day of a date range - {@code to__next_day} - always begins with the
	 * name it derives from. A plain {@code contains} bound {@code to} as well, for a query that never
	 * names it; two parameters a dashboard calls {@code to} and {@code total} were the same story
	 * before there were derived ones.
	 */
	private static boolean usesNamedParameter(String sql, String name) {
		return java.util.regex.Pattern.compile(":" + java.util.regex.Pattern.quote(name) + "(?!\\w)")
				.matcher(sql).find();
	}

	/**
	 * Fetch the full database schema for a connection.
	 * Uses the code-based schema fetcher so packaged sample connections
	 * (rbt-sample-northwind-*) work the same as regular on-disk connections.
	 */
	public SchemaInfo getSchema(String connectionId) throws Exception {
		limitsService.assertConnectionAllowed(connectionId);
		ConnectionFactory.syncPath();
		String xmlPath = connectionsService.prepareConnectionFilePath(connectionId);
		return schemaFetcher.fetchSchema(xmlPath);
	}

	private DatabaseConnectionManager createConnectionManager(String connectionId) throws Exception {
		return ConnectionFactory.newConnectionManager();
	}
}
