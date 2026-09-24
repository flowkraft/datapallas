package com.flowkraft.queries.services;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import org.springframework.beans.factory.annotation.Autowired;

import com.flowkraft.connections.ConnectionsService;
import com.flowkraft.iam.limits.ConnectionNotAllowedException;
import com.flowkraft.iam.limits.LimitsService;
import com.flowkraft.queries.ConnectionFactory;
import com.sourcekraft.documentburster.common.db.DatabaseConnectionManager;
import com.sourcekraft.documentburster.common.db.DatabaseHelper;
import com.sourcekraft.documentburster.common.db.DatabaseSchemaFetcher;
import com.sourcekraft.documentburster.common.db.SqlExecutor;
import com.sourcekraft.documentburster.common.db.schema.SchemaInfo;

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

	/**
	 * Execute a SQL query against any configured database connection.
	 * When params are provided, ${param} / #{param} placeholders in the SQL are
	 * converted to JDBI :param syntax before binding — injection-safe via bindMap.
	 * Only parameters actually referenced in the SQL are bound, so dashboards may
	 * freely mix filtered widgets and unfiltered context widgets on the same canvas.
	 */
	public List<Map<String, Object>> executeQuery(String connectionId, String sql, Map<String, Object> params)
			throws Exception {

		PreparedSql prepared = prepare(sql, params);
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

		PreparedSql prepared = prepare(sql, params);
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

	/** The SQL and the parameter map as they are handed to JDBI. */
	private static final class PreparedSql {
		private final String sql;
		private final Map<String, Object> params;

		private PreparedSql(String sql, Map<String, Object> params) {
			this.sql = sql;
			this.params = params;
		}
	}

	/**
	 * Converts ${param} / #{param} placeholders to JDBI :param syntax and builds the bind map.
	 * Shared by the report path and the ad-hoc path so both bind values the same way.
	 */
	private PreparedSql prepare(String sql, Map<String, Object> params) {

		Map<String, Object> boundParams = null;
		if (params != null && !params.isEmpty()) {
			sql = DatabaseHelper.convertToJdbiParameters(sql, params);
			java.util.Set<String> listBound = DatabaseHelper.findListBoundParameters(sql);
			boundParams = new java.util.LinkedHashMap<>();
			for (Map.Entry<String, Object> e : params.entrySet()) {
				String name = e.getKey();
				Object value = e.getValue();
				if (listBound.contains(name)) {
					// IN-list param: split CSV string into a List so SqlExecutor binds via bindList.
					// Type-coerce each value (Long → Double → String) so numeric columns get numeric
					// binds — without this, JDBI binds VARCHAR and Postgres rejects `integer = varchar`.
					String csv = value == null ? "" : String.valueOf(value);
					java.util.List<Object> list = new java.util.ArrayList<>();
					for (String s : csv.split(",")) {
						String t = s.trim();
						if (t.isEmpty()) continue;
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
					if (list.isEmpty()) list.add(""); // JDBI rejects empty bindList — empty string matches nothing.
					boundParams.put(name, list);
				} else if (sql.contains(":" + name)) {
					boundParams.put(name, value);
				}
			}
		}
		return new PreparedSql(sql, boundParams);
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
