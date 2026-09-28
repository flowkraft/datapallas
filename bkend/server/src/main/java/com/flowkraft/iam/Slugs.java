package com.flowkraft.iam;

import java.util.Collection;
import java.util.Locale;

/**
 * The name a group is known by <em>in SQL</em>.
 *
 * <p>A group has a display name an admin types — "Support Agents" — and an access filter that names
 * that group has to write something. It cannot write the display name: the name is edited, and SQL
 * that read {@code 'Support Agents'} would answer nothing the day somebody fixes the capitalisation.
 * So a group also carries a slug, derived from the name <em>once</em>, when the group is created,
 * and never changed again (owner, 2026-09-27, question 2). Renaming a group is then what an admin
 * expects it to be: a label change that breaks nothing.
 *
 * <p>The slug is unique inside a tenant, because {@code ${dp_user_groups}} is a flat list of slugs
 * and two groups answering to one name in it would make a condition mean two different things.
 */
public final class Slugs {

	private Slugs() {
	}

	/** What is used when a name has no slug-able character in it at all (e.g. a name in Han script). */
	private static final String FALLBACK = "group";

	/**
	 * The slug a name gives on its own: lower case, every run of anything else a single {@code -},
	 * and no {@code -} at either end. {@code "Support Agents"} → {@code support-agents}.
	 */
	public static String of(String name) {
		if (name == null)
			return FALLBACK;

		String slug = name.toLowerCase(Locale.ROOT)
				.replaceAll("[^a-z0-9]+", "-")
				.replaceAll("(^-+|-+$)", "");

		return slug.isEmpty() ? FALLBACK : slug;
	}

	/**
	 * The same slug, made unique against the ones a tenant already has by a {@code -2}, {@code -3}
	 * suffix. Two groups may be called "Support agents" and "Support Agents" only in the sense that
	 * the name column is {@code COLLATE NOCASE} and refuses it — but a fallback slug, or a rename
	 * followed by a new group with the old name, can still collide, and the insert would then fail
	 * at the unique index with nothing an admin could do about it.
	 */
	public static String unique(String base, Collection<String> taken) {
		if (!taken.contains(base))
			return base;

		for (int suffix = 2;; suffix++) {
			String candidate = base + "-" + suffix;
			if (!taken.contains(candidate))
				return candidate;
		}
	}
}
