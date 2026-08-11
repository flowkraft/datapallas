package com.flowkraft.iam.federation;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.commons.lang3.StringUtils;

/**
 * Reads a username and a group list out of whatever an identity provider sent.
 *
 * <p>Separate from the login plumbing because this is the part that varies per deployment and is worth
 * being able to test on its own. Providers disagree on almost everything here: the username may be
 * {@code preferred_username}, {@code email}, {@code upn} or a SAML attribute URI; groups may arrive as a
 * JSON array, a single string, a comma-separated string, or a list of maps with a {@code displayName}
 * (Entra ID does this when group claims are emitted as objects). So each candidate name is tried in
 * order and each value shape is handled, rather than requiring the administrator to discover which
 * spelling this build happens to want.
 */
final class FederatedClaims {

	private FederatedClaims() {
	}

	/** First candidate that yields a non-blank scalar value, or null. */
	static String username(Map<String, Object> attributes, List<String> candidates, String fallback) {

		if (attributes != null && candidates != null)
			for (String candidate : candidates) {
				String value = scalar(attributes.get(candidate));
				if (StringUtils.isNotBlank(value))
					return value;
			}

		return StringUtils.trimToNull(fallback);
	}

	/** Union of every candidate attribute that is present — a user can be described by more than one. */
	static Set<String> groups(Map<String, Object> attributes, List<String> candidates) {

		Set<String> groups = new LinkedHashSet<>();

		if (attributes == null || candidates == null)
			return groups;

		for (String candidate : candidates)
			flatten(attributes.get(candidate), groups);

		return groups;
	}

	private static void flatten(Object value, Set<String> into) {

		if (value == null)
			return;

		if (value instanceof Collection<?> values) {
			values.forEach(element -> flatten(element, into));
			return;
		}

		if (value instanceof Object[] values) {
			for (Object element : values)
				flatten(element, into);
			return;
		}

		// Entra ID can emit group claims as objects rather than plain strings.
		if (value instanceof Map<?, ?> map) {
			for (String key : List.of("displayName", "name", "value", "id"))
				if (map.get(key) != null) {
					flatten(map.get(key), into);
					return;
				}
			return;
		}

		String text = StringUtils.trimToEmpty(value.toString());
		if (text.isEmpty())
			return;

		// A single claim carrying several groups, which some providers do instead of an array. Splitting
		// on commas and semicolons is safe here: a group name containing either would already be
		// unusable as an LDAP/SAML value in practice.
		if (text.indexOf(',') >= 0 || text.indexOf(';') >= 0) {
			for (String part : text.split("[,;]")) {
				String trimmed = StringUtils.trimToEmpty(part);
				if (!trimmed.isEmpty())
					into.add(trimmed);
			}
			return;
		}

		into.add(text);
	}

	/** A claim that should be one value but might have arrived wrapped in a list. */
	private static String scalar(Object value) {

		if (value == null)
			return null;

		if (value instanceof Collection<?> values) {
			List<?> list = new ArrayList<>(values);
			return list.isEmpty() ? null : scalar(list.get(0));
		}

		if (value instanceof Object[] values)
			return values.length == 0 ? null : scalar(values[0]);

		return StringUtils.trimToNull(value.toString());
	}
}
