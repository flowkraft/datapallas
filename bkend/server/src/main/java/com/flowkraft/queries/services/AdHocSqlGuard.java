package com.flowkraft.queries.services;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * Refuses anything that is not a single, plain SELECT/WITH query on the ad-hoc SQL path
 * ({@code POST /api/queries/run-sql}).
 *
 * <p>Ad-hoc SQL is typed by a person or written by an AI Hub agent and then run through a stored
 * connection whose credentials the caller never sees. Reading is the whole purpose; writing,
 * DDL, attaching another database and reading server files are not, so they are refused before
 * the statement reaches the driver. {@link QueriesService#executeAdHocQuery} additionally runs
 * what passes inside a transaction that is always rolled back, so a statement that slips past
 * this guard still cannot leave anything behind.
 *
 * <p>This is a small tokenizer, deliberately not a SQL parser: every vendor DataPallas talks to
 * has its own grammar, and a parser that understands one of them would refuse valid queries on
 * the others. Comments, strings and quoted identifiers are blanked out first, so a column named
 * {@code "update_date"} or a value like {@code 'drop'} never trips a rule.
 */
public final class AdHocSqlGuard {

	/**
	 * Words that may not appear bare (outside strings, comments and quoted identifiers).
	 *
	 * <p>{@code REPLACE} and {@code SET} are deliberately absent: {@code REPLACE()} is a common
	 * string function and {@code CHARACTER SET} appears in casts. As statements they are refused
	 * anyway, because the first keyword must be SELECT or WITH.
	 */
	private static final Set<String> FORBIDDEN_WORDS = new LinkedHashSet<>(Arrays.asList("INTO", "INSERT", "UPDATE",
			"DELETE", "MERGE", "UPSERT", "DROP", "ALTER", "CREATE", "TRUNCATE", "RENAME", "GRANT", "REVOKE", "COPY",
			"CALL", "EXEC", "EXECUTE", "ATTACH", "DETACH", "PRAGMA", "INSTALL", "LOAD", "VACUUM"));

	/**
	 * Functions that read a file, a directory or another server, and so reach outside the
	 * database the connection points at.
	 *
	 * <p>Matched only when called (the name followed by an opening bracket), so SQLite's
	 * {@code GLOB} operator and a column named {@code glob} still pass.
	 */
	private static final Set<String> FORBIDDEN_CALLS = new LinkedHashSet<>(Arrays.asList(
			// DuckDB
			"READ_CSV", "READ_CSV_AUTO", "READ_PARQUET", "READ_JSON", "READ_JSON_AUTO", "READ_JSON_OBJECTS",
			"READ_NDJSON", "READ_TEXT", "READ_BLOB", "READ_XLSX", "SNIFF_CSV", "GLOB", "PARQUET_SCAN",
			"PARQUET_METADATA", "PARQUET_SCHEMA",
			// other vendors
			"PG_READ_FILE", "PG_READ_BINARY_FILE", "PG_LS_DIR", "LO_IMPORT", "LO_EXPORT", "DBLINK", "LOAD_FILE",
			"OPENROWSET", "OPENDATASOURCE", "OPENQUERY"));

	private AdHocSqlGuard() {
	}

	/**
	 * @param sql the statement as the caller sent it
	 * @throws IllegalArgumentException with a message naming the reason, which the caller returns
	 *                                  to the UI as {@code {error: "..."}}
	 */
	public static void check(String sql) {

		if (sql == null || sql.trim().isEmpty())
			throw new IllegalArgumentException("Only a single SELECT/WITH query is allowed in run-sql (it was empty)");

		String scrubbed = blankOutLiterals(sql);

		// One statement only. The one trailing ; that every SQL console adds is fine; a second
		// one is an (empty) second statement, so it is not.
		String withoutTrailing = scrubbed.replaceAll("\\s+$", "");
		if (withoutTrailing.endsWith(";"))
			withoutTrailing = withoutTrailing.substring(0, withoutTrailing.length() - 1).replaceAll("\\s+$", "");
		if (withoutTrailing.indexOf(';') >= 0)
			throw new IllegalArgumentException(
					"Only a single SELECT/WITH query is allowed in run-sql (found more than one statement)");

		// SELECT or WITH, optionally wrapped in brackets.
		String head = withoutTrailing.replaceAll("^[\\s(]+", "");
		String firstWord = firstWordOf(head);
		if (!"SELECT".equals(firstWord) && !"WITH".equals(firstWord))
			throw new IllegalArgumentException("Only a single SELECT/WITH query is allowed in run-sql (it starts with "
					+ (firstWord.isEmpty() ? "no keyword" : firstWord) + ")");

		java.util.regex.Matcher words = java.util.regex.Pattern.compile("[A-Za-z_][A-Za-z_0-9]*")
				.matcher(withoutTrailing);
		while (words.find()) {
			String word = words.group().toUpperCase(java.util.Locale.ROOT);
			if (FORBIDDEN_CALLS.contains(word) && isCall(withoutTrailing, words.end()))
				throw new IllegalArgumentException(
						"Reading files or other servers from SQL is not allowed in run-sql (found "
								+ words.group() + ")");
			if (FORBIDDEN_WORDS.contains(word))
				throw new IllegalArgumentException("Only a single SELECT/WITH query is allowed in run-sql (found "
						+ word + "). If that is a column or table name, put it in quotes.");
		}
	}

	/** True when the next non-blank character after a word is an opening bracket. */
	private static boolean isCall(String sql, int afterWord) {
		for (int i = afterWord; i < sql.length(); i++) {
			char c = sql.charAt(i);
			if (c == '(')
				return true;
			if (!Character.isWhitespace(c))
				return false;
		}
		return false;
	}

	private static String firstWordOf(String sql) {
		int end = 0;
		while (end < sql.length() && (Character.isLetterOrDigit(sql.charAt(end)) || sql.charAt(end) == '_'))
			end++;
		return sql.substring(0, end).toUpperCase(java.util.Locale.ROOT);
	}

	/**
	 * Replaces every comment, string literal and quoted identifier with a single space, leaving
	 * the statement's structure — brackets, semicolons and bare words — in place.
	 */
	private static String blankOutLiterals(String sql) {

		StringBuilder out = new StringBuilder(sql.length());

		for (int i = 0; i < sql.length();) {
			char c = sql.charAt(i);

			if (c == '-' && i + 1 < sql.length() && sql.charAt(i + 1) == '-') {
				int end = sql.indexOf('\n', i);
				i = end < 0 ? sql.length() : end;
				out.append(' ');
			} else if (c == '/' && i + 1 < sql.length() && sql.charAt(i + 1) == '*') {
				int end = sql.indexOf("*/", i + 2);
				i = end < 0 ? sql.length() : end + 2;
				out.append(' ');
			} else if (c == '\'' || c == '"' || c == '`') {
				// A doubled quote inside the literal is an escaped quote, not the end of it.
				// A backslash is NOT treated as an escape: it is not one in standard SQL, and
				// honouring it would let 'a\\' ; DROP ... hide a second statement from the scan.
				int j = i + 1;
				while (j < sql.length()) {
					if (sql.charAt(j) == c) {
						if (j + 1 < sql.length() && sql.charAt(j + 1) == c)
							j += 2;
						else
							break;
					} else {
						j++;
					}
				}
				i = j < sql.length() ? j + 1 : sql.length();
				out.append(' ');
			} else if ((c == '$' || c == '#') && i + 1 < sql.length() && sql.charAt(i + 1) == '{') {
				// A report parameter placeholder, ${name} or #{name}: the value is bound by JDBI,
				// and the name is the caller's, so it is not SQL and must not be read as SQL.
				int end = sql.indexOf('}', i + 2);
				i = end < 0 ? sql.length() : end + 1;
				out.append(' ');
			} else if (c == ':' && i + 1 < sql.length() && Character.isLetter(sql.charAt(i + 1))
					&& (i == 0 || sql.charAt(i - 1) != ':')) {
				// A JDBI named parameter, :name (but not a Postgres ::cast).
				int j = i + 1;
				while (j < sql.length() && (Character.isLetterOrDigit(sql.charAt(j)) || sql.charAt(j) == '_'))
					j++;
				i = j;
				out.append(' ');
			} else if (c == '[') {
				int end = sql.indexOf(']', i);
				i = end < 0 ? sql.length() : end + 1;
				out.append(' ');
			} else {
				out.append(c);
				i++;
			}
		}

		return out.toString();
	}
}
