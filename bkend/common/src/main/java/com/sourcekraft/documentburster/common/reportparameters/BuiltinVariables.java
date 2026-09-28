package com.sourcekraft.documentburster.common.reportparameters;

/**
 * The one rule that says whether a name belongs to the server, not to the author: the {@code dp_}
 * prefix.
 *
 * <p>The built-in variables themselves - what {@code dp_user_id} is, where {@code dp_today} comes
 * from - live in {@code com.flowkraft.embed.UserVariables}, which needs a session, a person and a
 * tenant and therefore cannot live here. What does live here is the prefix, because the plumbing
 * a query passes through on its way to the database has to recognise such a name without knowing
 * anything else about it: a built-in is filled by the server on every request, so the "no value,
 * no filter" and "{@code *} means every row" conveniences that exist for what a viewer types must
 * not touch it. An empty built-in binds as empty and matches no row; it never drops the condition
 * that uses it, which would show the viewer every row instead of none.
 */
public final class BuiltinVariables {

	private BuiltinVariables() {
	}

	/** Reserved for the server. No dashboard parameter, cube parameter or lock may start with it. */
	public static final String PREFIX = "dp_";

	/** True when this parameter name is the server's to fill, whatever value the request carries. */
	public static boolean isBuiltinName(String name) {
		return name != null && name.trim().toLowerCase(java.util.Locale.ROOT).startsWith(PREFIX);
	}
}
