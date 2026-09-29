package com.flowkraft.cubes;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.flowkraft.embed.UserVariables;
import com.flowkraft.queries.services.QueriesService;

/**
 * The values a generated cube query still names, bound: the {@code ${dp_…}} builtins of whoever is
 * asking, and the cube's own parameters (R1).
 *
 * <p>A cube's {@code access_filter} says {@code owner_email = ${dp_user_email}} and the generator
 * writes that token into the WHERE of every SELECT it builds, untouched: nobody is asking at
 * generation time, so the variable travels on. This class is where it stops travelling. It reads
 * the names the statement actually uses, takes their values from {@link UserVariables} — the same
 * map {@code /data} binds, made from the session or the credential and never from the request —
 * and hands both to {@link QueriesService#prepare}, so a live cube binds a built-in exactly the way
 * a dashboard widget does: one rule, in one place, including the two that are not text and the
 * empty {@code IN ()} of a person in no group.
 *
 * <p><b>A variable with no value is an empty value, never a missing one.</b> An attribute the
 * credential does not carry, or a person variable of a share link that has no person behind it,
 * binds as {@code ''} and matches no row. Leaving it unbound would send {@code ${dp_user_email}} to
 * the driver as text; leaving its condition out would show the viewer every row.
 *
 * <p><b>ANSI SQL only — no vendor branch in this file.</b> Binding a value is the driver's job and
 * the same on every database; the two variables that are not text are given their type and the
 * driver writes them.
 *
 * <p><b>The values are never written into the SQL.</b> The statement keeps a {@code :dp_…}
 * placeholder, exactly as it keeps {@code :cf…} for a viewer's filter value, so a name holding a
 * quote is a value and not a syntax error.
 */
public final class CubeVariableBinding {

	/**
	 * {@code ${dp_user_id}} or {@code #{dp_attr_customer_id}}: the two placeholder forms the query
	 * plumbing understands, reserved names only. The alphabet is
	 * {@code CallerAttributes}' — an attribute name that could not be written here could be set and
	 * never read, which is the one outcome a filter must not have.
	 */
	private static final Pattern BUILTIN = Pattern.compile("[$#]\\{(" + Pattern.quote(UserVariables.PREFIX)
			+ "[a-z0-9_]*)\\}");

	private CubeVariableBinding() {
	}

	/** The reserved names this statement uses, in the order it names them. */
	public static Set<String> namedBy(String sql) {

		Set<String> named = new LinkedHashSet<>();
		if (sql == null)
			return named;

		Matcher found = BUILTIN.matcher(sql);
		while (found.find())
			named.add(found.group(1));

		return named;
	}

	/**
	 * The same query with every {@code ${dp_…}} it names turned into a bind and given this caller's
	 * value. A query naming none — every cube without an access filter — is returned as it is, the
	 * same object, so nothing changes for the cubes that had no variables to bind.
	 *
	 * @param userVariables {@link UserVariables#of} for whoever made the request; null and missing
	 *                      names are empty values, which match no row
	 */
	public static CubeQuery bound(CubeQuery query, Map<String, String> userVariables) {
		return bound(query, userVariables, Map.of(), Map.of());
	}

	/**
	 * The same query with its builtins bound as above <b>and</b> the dashboard's parameters bound to
	 * the values the viewer answered (R1).
	 *
	 * <p>One call, not two, because there is one rule about what a value in a statement becomes and
	 * it lives in {@link QueriesService#prepare}: a date binds as a date, a multi-select becomes an
	 * {@code IN} list, All becomes {@code 1=1}, and a parameter with no value takes its own line out
	 * of the WHERE. Binding the two kinds separately would have meant preparing the statement twice,
	 * and the second pass would read a statement the first had already rewritten.
	 *
	 * <p>The generator leaves a {@code ${param}} standing exactly as it leaves a {@code ${dp_…}}
	 * standing, so the text it returns is the form a published dashboard binds at run time (the
	 * export form) and what comes out of here is the form the live cube runs and View SQL shows.
	 *
	 * @param parameterValues each declared parameter's value as text, from
	 *                        {@link DashboardParameters#values} — already checked, and empty where the
	 *                        viewer left it empty
	 * @param parameterTypes  each one's declared type, from {@link DashboardParameters#types}
	 */
	public static CubeQuery bound(CubeQuery query, Map<String, String> userVariables,
			Map<String, Object> parameterValues, Map<String, String> parameterTypes) {

		Set<String> named = namedBy(query.getSql());
		Map<String, Object> asked = parameterValues != null ? parameterValues : Map.of();
		if (named.isEmpty() && asked.isEmpty())
			return query;

		Map<String, String> mine = userVariables != null ? userVariables : Map.of();
		Map<String, Object> values = new LinkedHashMap<>();
		Map<String, String> types = new LinkedHashMap<>();

		values.putAll(asked);
		if (parameterTypes != null)
			types.putAll(parameterTypes);

		for (String name : named) {
			values.put(name, Objects.toString(mine.get(name), ""));
			// Today is a date and now is a timestamp, so they are compared with a date and a
			// timestamp column rather than with their own text. Everything else is text - the same
			// two exceptions ScriptAssembler writes into a published script.
			if (UserVariables.DATE_NAMES.contains(name))
				types.put(name, "Date");
			else if (UserVariables.TIMESTAMP_NAMES.contains(name))
				types.put(name, "Timestamp");
		}

		QueriesService.PreparedSql prepared = QueriesService.prepare(query.getSql(), values, types);

		Map<String, Object> params = new LinkedHashMap<>(query.getParams());
		if (prepared.params() != null)
			params.putAll(prepared.params());

		return new CubeQuery(prepared.sql(), params);
	}
}
