package com.flowkraft.cubes;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The <b>only</b> place in the cube generator where a vendor-specific SQL form may live.
 *
 * <p>The cube generator writes standard ANSI SQL. A form is added to this file only because ANSI
 * has no form for it, or because a supported database rejects the ANSI form. Every function here
 * says, in one line, why ANSI cannot do it, and every function has a JUnit test holding the exact
 * expected form for every vendor key — a key missing from that table fails the test.
 *
 * <p>Nothing else belongs here: no query building, no SQL "helpers". A function named after the SQL
 * in general would invite the next vendor branch to be written outside this file.
 */
public final class CubeSqlDialect {

	/**
	 * One key per distinct SQL the generator writes. Supabase and TimescaleDB are PostgreSQL, and
	 * MariaDB follows MySQL, so they are aliases (see {@link #key(String)}) rather than keys.
	 */
	public static final List<String> VENDOR_KEYS = List.of(
			"sqlite", "duckdb", "postgres", "mysql", "mariadb",
			"sqlserver", "oracle", "db2", "clickhouse");

	/** What an absent or unknown vendor resolves to, as before: plain ANSI, quoted with {@code "}. */
	public static final String DEFAULT_KEY = "default";

	/**
	 * One entry per distinct SQL this layer writes, in the connection screen's order, for
	 * {@code GET /api/cubes/dialects}: a database a person can pick, and the name they know it by.
	 * Supabase and TimescaleDB get PostgreSQL's SQL and MariaDB gets MySQL's, so each family is one
	 * entry whose label names its members. A vendor added to this layer appears here, and so in the
	 * screen, by itself.
	 */
	public static final List<Map<String, String>> DIALECTS = List.of(
			dialect("oracle", "Oracle"),
			dialect("sqlserver", "SQL Server"),
			dialect("postgres", "PostgreSQL / Supabase / TimescaleDB"),
			dialect("mysql", "MySQL / MariaDB"),
			dialect("db2", "IBM Db2"),
			dialect("sqlite", "SQLite"),
			dialect("duckdb", "DuckDB"),
			dialect("clickhouse", "ClickHouse"));

	private static Map<String, String> dialect(String key, String label) {
		return Map.of("key", key, "label", label);
	}

	/**
	 * Which dialect a generate-sql request asks for: the vendor key when the request names one,
	 * null when the request's connection decides (the caller looks that up), and
	 * {@link #DEFAULT_KEY} when it says neither, as before.
	 *
	 * <p>This is not a SQL form; it is here because the keys it accepts are this layer's, so a
	 * vendor added here is accepted by the API without anything else being touched.
	 */
	public static String requestedKey(String connectionId, String dbVendor) {

		boolean hasConnection = connectionId != null && !connectionId.isBlank();
		boolean hasVendor = dbVendor != null && !dbVendor.isBlank();

		if (hasConnection && hasVendor) {
			throw new IllegalArgumentException(
					"send connectionId or dbVendor, not both: a connection already says which "
							+ "database its SQL is for.");
		}
		if (hasConnection) {
			return null;
		}
		if (!hasVendor) {
			return DEFAULT_KEY;
		}

		String key = key(dbVendor);
		if (DEFAULT_KEY.equals(key) && !DEFAULT_KEY.equalsIgnoreCase(dbVendor.trim())) {
			throw new IllegalArgumentException("'" + dbVendor + "' is not a database this generator "
					+ "writes SQL for. The keys it knows are " + VENDOR_KEYS + ", their aliases "
					+ "(postgresql, supabase, timescaledb, mssql, ibmdb2) and '" + DEFAULT_KEY + "'.");
		}
		return key;
	}

	/**
	 * Names that a database would read as syntax rather than as an identifier, so they are quoted
	 * even though they look plain. The list is deliberately short: the words a real table or column
	 * is actually called ("order", "user", "date", "value"), not the whole SQL grammar. A name that
	 * is not here and is not plain is quoted anyway, so a missing word costs nothing but a rare
	 * unquoted identifier.
	 */
	private static final Set<String> RESERVED = new LinkedHashSet<>(Arrays.asList(
			"all", "and", "any", "as", "asc", "between", "by", "case", "check", "column", "comment",
			"constraint", "create", "cross", "current", "date", "day", "default", "delete", "desc",
			"distinct", "drop", "else", "end", "exists", "false", "fetch", "first", "for", "from",
			"full", "group", "having", "hour", "in", "index", "inner", "insert", "interval", "into",
			"is", "join", "key", "left", "level", "like", "limit", "minute", "month", "natural",
			"not", "null", "number", "offset", "on", "only", "or", "order", "outer", "primary",
			"right", "row", "rows", "schema", "second", "select", "session", "set",
			"size", "start", "table", "then", "time", "timestamp", "to", "true", "union", "unique",
			"update", "user", "using", "value", "values", "view", "when", "where", "with", "year"));

	private CubeSqlDialect() {
	}

	/**
	 * The canonical key for a vendor string, aliases included. An absent or unrecognised vendor
	 * gives {@link #DEFAULT_KEY}, which is what the generator wrote before there was a vendor layer.
	 */
	public static String key(String dbVendor) {

		if (dbVendor == null)
			return DEFAULT_KEY;

		String v = dbVendor.trim().toLowerCase(Locale.ROOT);

		switch (v) {
			case "postgres":
			case "postgresql":
			case "supabase":
			case "timescaledb":
			case "timescale":
				return "postgres";
			case "mysql":
				return "mysql";
			case "mariadb":
				return "mariadb";
			case "sqlite":
				return "sqlite";
			case "duckdb":
				return "duckdb";
			case "clickhouse":
				return "clickhouse";
			case "sqlserver":
			case "mssql":
			case "sql server":
				return "sqlserver";
			case "oracle":
				return "oracle";
			case "db2":
			case "ibmdb2":
				return "db2";
			default:
				return DEFAULT_KEY;
		}
	}

	/**
	 * Quote an identifier — <b>why ANSI cannot do it:</b> the quote character itself is not standard
	 * (MySQL and MariaDB use a backtick, everything else the ANSI double quote).
	 *
	 * <p>A plain identifier that is not a reserved word is left <b>unquoted</b>, which is how the
	 * cube author's own SQL fragments reference it: quoting it would pin its case, and Oracle and
	 * Db2 fold unquoted names to upper case while PostgreSQL folds them to lower case. A dotted name
	 * is handled part by part, so {@code my schema.Order Details} becomes two quoted parts. A name
	 * the author already quoted, or a sub-query in brackets, is passed through untouched.
	 */
	public static String quoteIdent(String name, String vendor) {

		if (name == null || name.isEmpty())
			return name;

		if (name.indexOf('.') < 0)
			return quoteOnePart(name, vendor, false);

		StringBuilder quoted = new StringBuilder();
		for (String part : name.split("\\.", -1)) {
			if (quoted.length() > 0)
				quoted.append('.');
			quoted.append(quoteOnePart(part, vendor, false));
		}

		return quoted.toString();
	}

	/**
	 * Quote a column alias — the same vendor quote, but <b>always</b> applied. An alias is the name
	 * the answer comes back under, and the caller looks it up by the member's own name, so its case
	 * has to survive Oracle and Db2 upper-casing an unquoted one.
	 */
	/**
	 * The internal names of the no-double-counting rewrite - {@code __keys}, {@code __mult} and
	 * {@code __pk} - as this vendor takes them.
	 *
	 * <p>why ANSI cannot do it: an ANSI regular identifier begins with a letter, so a name that
	 * begins with an underscore is legal only delimited. Seven of the nine engines take it bare
	 * anyway; Oracle answers ORA-00911 (invalid character) and Db2 SQLCODE -20521, so on those two
	 * the name is delimited. It is not delimited everywhere on purpose: a delimited name is
	 * case-sensitive and each engine folds an undelimited one its own way, so quoting it for all
	 * nine would change the SQL the other seven already run for no reason of theirs.
	 */
	public static String internalAlias(String name, String vendor) {

		if (name == null || name.isEmpty())
			return name;

		return UNDERSCORE_ONLY_DELIMITED.contains(key(vendor)) ? quoteAlias(name, vendor) : name;
	}

	/** The engines whose regular identifier may not begin with an underscore. */
	private static final Set<String> UNDERSCORE_ONLY_DELIMITED = Set.of("oracle", "db2");

	public static String quoteAlias(String name, String vendor) {

		if (name == null || name.isEmpty())
			return name;

		return quoteOnePart(name, vendor, true);
	}

	private static String quoteOnePart(String part, String vendor, boolean always) {

		if (part.isEmpty())
			return part;

		char first = part.charAt(0);
		if (first == '"' || first == '`' || first == '[' || first == '(')
			return part;

		if (!always && isPlainUnreserved(part))
			return part;

		char quote = quoteChar(vendor);
		String doubled = part.replace(String.valueOf(quote), String.valueOf(quote) + quote);

		return quote + doubled + quote;
	}

	private static boolean isPlainUnreserved(String part) {

		if (!isAsciiLetter(part.charAt(0)) && part.charAt(0) != '_')
			return false;

		for (int i = 1; i < part.length(); i++) {
			char c = part.charAt(i);
			if (!isAsciiLetter(c) && (c < '0' || c > '9') && c != '_')
				return false;
		}

		return !RESERVED.contains(part.toLowerCase(Locale.ROOT));
	}

	private static boolean isAsciiLetter(char c) {

		return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z');
	}

	/**
	 * A string literal — <b>why ANSI cannot do it:</b> ANSI escapes a quote by doubling it and says
	 * nothing about the backslash, but MySQL, MariaDB and ClickHouse read a backslash inside a
	 * literal as an escape character, so a label containing one arrives shortened unless it is
	 * doubled too.
	 *
	 * <p>Used for the labels of a {@code case} dimension, which the cube author types as plain text.
	 */
	public static String stringLiteral(String text, String vendor) {

		if (text == null)
			return "NULL";

		String key = key(vendor);
		String escaped = text.replace("'", "''");

		if ("mysql".equals(key) || "mariadb".equals(key) || "clickhouse".equals(key))
			escaped = escaped.replace("\\", "\\\\");

		return "'" + escaped + "'";
	}

	/**
	 * What a statement containing a LEFT JOIN has to end with — <b>why ANSI cannot do it:</b> a row
	 * with no match on the joined side is NULL on every other database, while ClickHouse fills it
	 * with the column type's zero value ({@code ''} or 0) unless {@code join_use_nulls} is on
	 * (verified on 24.3). Without it an unmatched customer would come back with a count of 0 that
	 * cannot be told apart from a real 0.
	 *
	 * <p>It goes at the very end of the statement, after the outer ORDER BY and any row limit, so it
	 * also covers the {@code WITH} form the no-double-counting rewrite produces.
	 */
	public static String leftJoinSettings(String vendor) {

		return "clickhouse".equals(key(vendor)) ? " SETTINGS join_use_nulls = 1" : "";
	}

	/**
	 * Whether a correlated subquery may stand in a SELECT — <b>why ANSI cannot do it:</b>
	 * ClickHouse rejects one that reads the outer query's row ("Missing columns", verified on
	 * 24.3), while every other supported database runs it. A {@code sub_query} dimension is exactly
	 * that, so on ClickHouse it is refused with a sentence naming the dimension instead of being
	 * sent and failing as a database error nobody can act on.
	 */
	public static boolean correlatedSubqueries(String vendor) {

		return !"clickhouse".equals(key(vendor));
	}

	/**
	 * Databases that have no boolean literal, so {@code TRUE} has to be written {@code 1}.
	 */
	private static final Set<String> NO_BOOLEAN_WORD =
			new LinkedHashSet<>(Arrays.asList("sqlite", "sqlserver", "oracle", "db2"));

	/** The character that turns a {@code %} inside a LIKE value back into a plain per-cent sign. */
	private static final String LIKE_ESCAPE = "!";

	/** How a timestamp is written inside a literal, seconds and all. */
	private static final DateTimeFormatter TIMESTAMP_TEXT =
			DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

	/**
	 * A value written straight into the SQL &mdash; <b>why ANSI cannot do it:</b> only the string is
	 * standard. A boolean literal does not exist on SQLite, SQL Server, Oracle or Db2, where it is
	 * written 1 or 0; and while {@code DATE '2024-01-01'} is the standard spelling, SQLite has no
	 * date type (its dates are the text {@link #timeValue} reads) and SQL Server has no such literal
	 * at all, so both take the plain quoted text.
	 *
	 * <p>Used only for design-time rendering: what runs against a database is the bound form, where
	 * every value is a parameter. See {@code CubeQuery.toInlineSql}.
	 */
	public static String sqlLiteral(Object value, String vendor) {

		String key = key(vendor);

		if (value == null)
			return "NULL";

		if (value instanceof Boolean)
			return NO_BOOLEAN_WORD.contains(key)
					? (((Boolean) value) ? "1" : "0")
					: (((Boolean) value) ? "TRUE" : "FALSE");

		if (value instanceof Number)
			return value.toString();

		boolean quotedTextOnly = "sqlite".equals(key) || "sqlserver".equals(key);

		if (value instanceof LocalDate)
			return quotedTextOnly ? "'" + value + "'" : "DATE '" + value + "'";

		if (value instanceof LocalDateTime) {
			// Always with its seconds: LocalDateTime leaves them out when they are zero, and a
			// database reading '2024-01-31 18:00' either guesses or refuses.
			String text = ((LocalDateTime) value).format(TIMESTAMP_TEXT);
			return quotedTextOnly ? "'" + text + "'" : "TIMESTAMP '" + text + "'";
		}

		return stringLiteral(value.toString(), vendor);
	}

	/**
	 * A "contains" filter &mdash; <b>why ANSI cannot do it:</b> a value typed by a user may itself
	 * hold a {@code %} or a {@code _}, which LIKE would read as wildcards, so the value is escaped
	 * and the statement has to say which character does the escaping. ClickHouse has no
	 * {@code ESCAPE} clause (verified on 24.3): there the escape character is always the backslash,
	 * which is why {@link #likeValue} escapes with a different character there.
	 */
	public static String containsFilter(String columnExpr, String placeholder, String vendor) {

		if ("clickhouse".equals(key(vendor)))
			return columnExpr + " LIKE " + placeholder;

		return columnExpr + " LIKE " + placeholder + " ESCAPE '" + LIKE_ESCAPE + "'";
	}

	/**
	 * The value a "contains" filter binds &mdash; <b>why ANSI cannot do it:</b> the text has to be
	 * escaped with the very character the statement declares, and on ClickHouse that character
	 * cannot be declared at all: it is always the backslash. So a value escaped for one database is
	 * the wrong value on the other, and a search for {@code 50%} would find every row.
	 */
	public static String likeValue(String text, String vendor) {

		String escape = "clickhouse".equals(key(vendor)) ? "\\" : LIKE_ESCAPE;

		return text.replace(escape, escape + escape)
				.replace("%", escape + "%")
				.replace("_", escape + "_");
	}

	/**
	 * The value a time filter binds &mdash; <b>why ANSI cannot do it:</b> SQLite has no date type,
	 * and {@link #timeValue} reads its time columns as {@code 'yyyy-MM-dd'} text, so what a filter
	 * compares them with has to be that same text. Everywhere else the column is a date and the
	 * driver binds a date.
	 */
	public static Object timeParameter(LocalDate day, LocalDateTime stamp, String vendor) {

		if ("sqlite".equals(key(vendor)))
			return (stamp != null ? stamp.toLocalDate() : day).toString();

		return stamp != null ? (Object) stamp : (Object) day;
	}

	/**
	 * The row limit written at the end of the statement &mdash; <b>why ANSI cannot do it:</b> the
	 * standard {@code FETCH FIRST n ROWS ONLY} is what Oracle and Db2 take, while most of the others
	 * only know {@code LIMIT n}, and SQL Server takes neither: it writes {@code TOP n} inside the
	 * SELECT, which is {@link #limitPrefix}.
	 */
	public static String limitClause(int limit, String vendor) {

		String key = key(vendor);

		if ("sqlserver".equals(key))
			return "";

		if ("oracle".equals(key) || "db2".equals(key) || DEFAULT_KEY.equals(key))
			return "\nFETCH FIRST " + limit + " ROWS ONLY";

		return "\nLIMIT " + limit;
	}

	/**
	 * What a row limit puts right after {@code SELECT} &mdash; <b>why ANSI cannot do it:</b> SQL
	 * Server's row limit is {@code SELECT TOP n}, a part of the select list rather than a clause at
	 * the end. Everywhere else this is empty and {@link #limitClause} does the work.
	 */
	public static String limitPrefix(int limit, String vendor) {

		return "sqlserver".equals(key(vendor)) ? " TOP " + limit : "";
	}

	/** The granularities a time dimension may be truncated to. */
	public static final List<String> GRANULARITIES = List.of("day", "week", "month", "quarter", "year");

	/**
	 * How a time column is read — <b>why ANSI cannot do it:</b> SQLite has no date type, and the
	 * sample database stores its dates as epoch milliseconds, so {@code date(OrderDate)} answers
	 * nonsense on them and comparing them with {@code '2024-01-01'} answers nothing, both without
	 * an error. This expression reads epoch milliseconds, epoch seconds and ISO text alike and
	 * always gives {@code 'yyyy-MM-dd'} text. Every other database reads its own date column, so
	 * the column comes back unchanged.
	 *
	 * <p>A time dimension goes through this everywhere it appears — SELECT, GROUP BY, ORDER BY and
	 * inside the truncation — so the value grouped is the value shown.
	 */
	public static String timeValue(String expr, String vendor) {

		if (!"sqlite".equals(key(vendor))) return expr;

		return "(CASE WHEN typeof(" + expr + ") IN ('integer','real') THEN date(CASE WHEN " + expr
				+ " > 100000000000 THEN " + expr + " / 1000 ELSE " + expr + " END, 'unixepoch') ELSE date("
				+ expr + ") END)";
	}

	/**
	 * The first day of the period {@code expr} falls in — <b>why ANSI cannot do it:</b> standard SQL
	 * has no date truncation at all, and no two of these databases spell it the same way. The
	 * expression handed in is already the value {@link #timeValue} reads.
	 *
	 * <p>A week is the ISO week, so it starts on Monday everywhere.
	 *
	 * @throws IllegalArgumentException if the granularity is not one of {@link #GRANULARITIES}, or
	 *                                  if the vendor key is {@code default} — with no connection
	 *                                  there is no way to know how this database truncates a date.
	 */
	public static String dateTrunc(String expr, String granularity, String vendor) {

		String unit = granularity == null ? "" : granularity.trim().toLowerCase(Locale.ROOT);
		if (!GRANULARITIES.contains(unit)) {
			throw new IllegalArgumentException("'" + granularity
					+ "' is not a time granularity. The granularities a time dimension may use are: "
					+ String.join(", ", GRANULARITIES) + ".");
		}

		String key = key(vendor);

		switch (key) {
			case "postgres":
			case "duckdb":
				return "CAST(DATE_TRUNC('" + unit + "', " + expr + ") AS DATE)";

			case "oracle":
				return "TRUNC(" + expr + ", '" + truncUnit(unit) + "')";

			case "db2":
				return "DATE(TRUNC_TIMESTAMP(" + expr + ", '" + truncUnit(unit) + "'))";

			case "sqlserver":
				// No DATETRUNC: it arrived in SQL Server 2022, and this has to work from 2012.
				switch (unit) {
					case "day":
						return "CAST(" + expr + " AS DATE)";
					case "week":
						return "DATEADD(day, -((DATEPART(weekday, " + expr
								+ ") + @@DATEFIRST - 2) % 7), CAST(" + expr + " AS DATE))";
					case "month":
						return "DATEFROMPARTS(YEAR(" + expr + "), MONTH(" + expr + "), 1)";
					case "quarter":
						return "DATEFROMPARTS(YEAR(" + expr + "), (DATEPART(quarter, " + expr
								+ ") - 1) * 3 + 1, 1)";
					default:
						return "DATEFROMPARTS(YEAR(" + expr + "), 1, 1)";
				}

			case "mysql":
			case "mariadb":
				switch (unit) {
					case "day":
						return "DATE(" + expr + ")";
					case "week":
						return "DATE(" + expr + ") - INTERVAL WEEKDAY(" + expr + ") DAY";
					case "month":
						return "DATE(" + expr + ") - INTERVAL (DAYOFMONTH(" + expr + ") - 1) DAY";
					case "quarter":
						return "MAKEDATE(YEAR(" + expr + "), 1) + INTERVAL (QUARTER(" + expr
								+ ") - 1) QUARTER";
					default:
						return "MAKEDATE(YEAR(" + expr + "), 1)";
				}

			case "clickhouse":
				switch (unit) {
					case "day":
						return "toDate(" + expr + ")";
					case "week":
						return "toMonday(" + expr + ")";
					case "month":
						return "toStartOfMonth(" + expr + ")";
					case "quarter":
						return "toStartOfQuarter(" + expr + ")";
					default:
						return "toStartOfYear(" + expr + ")";
				}

			case "sqlite":
				switch (unit) {
					case "day":
						return expr;
					case "week":
						return "date(" + expr + ", '-6 days', 'weekday 1')";
					case "month":
						return "date(" + expr + ", 'start of month')";
					case "quarter":
						return "date(" + expr + ", 'start of month', '-' || ((CAST(strftime('%m', " + expr
								+ ") AS INTEGER) - 1) % 3) || ' months')";
					default:
						return "date(" + expr + ", 'start of year')";
				}

			default:
				throw new IllegalArgumentException("a granularity needs a database vendor: pick a connection");
		}
	}

	/** The truncation unit Oracle and DB2 share. */
	private static String truncUnit(String unit) {

		switch (unit) {
			case "day":     return "DD";
			case "week":    return "IW";
			case "month":   return "MM";
			case "quarter": return "Q";
			default:        return "YYYY";
		}
	}

	private static char quoteChar(String vendor) {

		String key = key(vendor);

		return ("mysql".equals(key) || "mariadb".equals(key)) ? '`' : '"';
	}
}
