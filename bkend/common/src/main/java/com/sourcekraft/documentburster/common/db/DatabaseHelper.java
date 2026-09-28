package com.sourcekraft.documentburster.common.db;

import java.sql.ResultSetMetaData;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.apache.commons.lang3.StringUtils;
import org.jdbi.v3.core.Handle;
import org.jdbi.v3.core.Jdbi;
import org.jdbi.v3.core.statement.Query;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.sourcekraft.documentburster.common.reportparameters.BuiltinVariables;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.context.BurstingContext;

public class DatabaseHelper {

	private static final Logger log = LoggerFactory.getLogger(DatabaseHelper.class);

	// private String configurationFilePath;
	private BurstingContext ctx;

	public DatabaseHelper(String configFilePath) {
		// this.configurationFilePath = configFilePath;
		log.debug("SqlReporter initialized with config path: {}", configFilePath);
	}

	public void setCtx(BurstingContext ctx) {
		this.ctx = ctx;
	}

	/*
	 * public SqlQueryResult doExecSqlQuery(String sqlQuery, Map<String, String>
	 * parameters) throws Exception { SqlQueryResult result = new SqlQueryResult();
	 * long startTime = System.currentTimeMillis();
	 * 
	 * // Validate inputs if (StringUtils.isBlank(sqlQuery)) { throw new
	 * IllegalArgumentException("SQL query cannot be blank"); }
	 * 
	 * if (Objects.isNull(ctx)) { ctx = new BurstingContext();
	 * ctx.configurationFilePath = configurationFilePath; ctx.settings = new
	 * Settings(configurationFilePath); ctx.settings.loadSettings(); ctx.dbManager =
	 * new DatabaseConnectionManager(ctx.settings); }
	 * 
	 * String dbConnectionCode =
	 * ctx.settings.getReportingPrimaryDatabaseConnectionCode();
	 * 
	 * // Convert query to use JDBI parameters String jdbiQuery =
	 * convertToJdbiParameters(sqlQuery); List<String> paramNames =
	 * findQueryParameters(jdbiQuery);
	 * 
	 * // Print SQL and parameters System.out.println("Executing SQL: " +
	 * jdbiQuery); System.out.println("With parameters: " + parameters);
	 * 
	 * // Create and execute query through DatabaseConnectionManager try (Handle
	 * handle = ctx.dbManager.getJdbi(dbConnectionCode).open()) { Query query =
	 * handle.createQuery(jdbiQuery).setQueryTimeout(30) // 30 second timeout
	 * .setMaxRows(100); // Limit to 100 rows for preview
	 * 
	 * // Bind parameters for (String param : paramNames) { if
	 * (parameters.containsKey(param)) { query.bind(param, parameters.get(param)); }
	 * }
	 * 
	 * // Execute query with streaming result.reportData = query.map((rs, ctx) -> {
	 * ResultSetMetaData meta = rs.getMetaData(); LinkedHashMap<String, Object> row
	 * = new LinkedHashMap<>(); for (int i = 1; i <= meta.getColumnCount(); i++) {
	 * row.put(meta.getColumnLabel(i), rs.getObject(i)); } return row;
	 * }).stream().collect(Collectors.toList());
	 * 
	 * System.out.println("Rows fetched: " + result.reportData.size());
	 * 
	 * // Set result metadata if (!result.reportData.isEmpty()) {
	 * result.reportColumnNames = new
	 * ArrayList<>(result.reportData.get(0).keySet()); } result.isPreview = true;
	 * result.executionTimeMillis = System.currentTimeMillis() - startTime; }
	 * 
	 * return result; }
	 * 
	 */

	public List<String> findQueryParameters(String sql) {
		Pattern pattern = Pattern.compile("(?<!')(:(\\w+))(?!')");
		Matcher matcher = pattern.matcher(sql);
		List<String> params = new ArrayList<>();

		while (matcher.find()) {
			params.add(matcher.group(2));
		}

		return params.stream().distinct().collect(Collectors.toList());
	}

	/** Wildcard sentinel for IN-list parameters. When a param's value equals
	 *  this, the surrounding `<col> [NOT] IN (${name})` clause is rewritten to
	 *  `1=1` — i.e. the filter is dropped and the widget returns rows for every
	 *  value of the column. Lets a dashboard user say "show me all runs" via a
	 *  single-character input instead of typing every id. */
	public static final String WILDCARD_VALUE = "*";

	/** Wildcard-aware convertToJdbiParameters. When a param's value equals
	 *  {@link #WILDCARD_VALUE}, the regex below replaces the entire surrounding
	 *  `<col> [NOT] IN (${name})` clause with `1=1` BEFORE the standard JDBI
	 *  param transforms run. Net effect: the IN filter disappears from the SQL
	 *  and the param drops out of the bind set automatically (no `<name>` or
	 *  `:name` left for the caller's bind loop to match against). */
	public static String convertToJdbiParameters(String sql, Map<String, Object> params) {
		if (params != null) {
			for (Map.Entry<String, Object> e : params.entrySet()) {
				Object v = e.getValue();
				if (v == null) continue;
				if (!WILDCARD_VALUE.equals(v.toString().trim())) continue;
				// Not for a built-in: `*` is a convenience for what a viewer types, and a viewer
				// types none of these — the server fills them. A group really named `*` would
				// otherwise drop the access filter that uses it and show every row.
				if (BuiltinVariables.isBuiltinName(e.getKey())) continue;
				// Match `<col> [NOT] IN (${name})` — column captured as
				// non-whitespace-non-paren so `t.col`, `"col"`, `[col]`,
				// `\`col\`` all work uniformly across vendors. The `1=1`
				// replacement is universally valid SQL (Oracle, SQL Server,
				// Postgres, MySQL, MariaDB, Db2, SQLite, DuckDB, ClickHouse).
				String escapedName = Pattern.quote(e.getKey());
				Pattern p = Pattern.compile(
					"(?i)[^\\s()]+\\s+(?:NOT\\s+)?IN\\s*\\(\\s*[\\$#]\\{" + escapedName + "\\}\\s*\\)"
				);
				sql = p.matcher(sql).replaceAll("1=1");
			}
		}
		return convertToJdbiParameters(sql);
	}

	public static String convertToJdbiParameters(String sql) {
		// Pass 1: IN (${name}) / NOT IN (${name}) → IN (<name>) — JDBI list-binding syntax.
		// Lets dashboard params holding a comma-separated value ("1, 5, 10") expand into a
		// real SQL list via Query.bindList(name, splitCsv(value)). Without this, scalar bind
		// would emit IN ('1, 5, 10') — one quoted string, zero rows.
		Pattern inListPattern = Pattern.compile(
			"(?i)\\b(NOT\\s+IN|IN)\\s*\\(\\s*[\\$#]\\{([^}]+)\\}\\s*\\)"
		);
		Matcher inMatcher = inListPattern.matcher(sql);
		StringBuilder inSb = new StringBuilder();
		while (inMatcher.find()) {
			String op = inMatcher.group(1).toUpperCase().replaceAll("\\s+", " ");
			String varName = inMatcher.group(2);
			inMatcher.appendReplacement(inSb, op + " (<" + varName + ">)");
		}
		inMatcher.appendTail(inSb);
		sql = inSb.toString();

		// Pass 2: scalar ${name} / #{name} / @name@ → :name
		Pattern pattern = Pattern.compile("[\\$#]\\{([^}]+)\\}|@(\\w+)@");
		Matcher matcher = pattern.matcher(sql);
		StringBuilder sb = new StringBuilder();

		while (matcher.find()) {
			String varName = matcher.group(1) != null ? matcher.group(1) : matcher.group(2);
			if (varName != null) {
				matcher.appendReplacement(sb, ":" + varName);
			}
		}
		matcher.appendTail(sb);
		return sb.toString();
	}

	/**
	 * Returns the set of parameter names that appear inside JDBI list-binding
	 * markers `<name>` in the SQL. Callers use this to know which params must be
	 * bound via Query.bindList(name, list) rather than scalar bindMap.
	 */
	public static java.util.Set<String> findListBoundParameters(String sql) {
		Pattern pattern = Pattern.compile("<(\\w[\\w-]*)>");
		Matcher matcher = pattern.matcher(sql);
		java.util.Set<String> names = new java.util.LinkedHashSet<>();
		while (matcher.find()) names.add(matcher.group(1));
		return names;
	}

	public Jdbi retrieveJdbiInstance(String connectionCode) throws Exception {
		return ctx.dbManager.getJdbi(connectionCode);
	}
}
