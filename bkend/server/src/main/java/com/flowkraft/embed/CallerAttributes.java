package com.flowkraft.embed;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sourcekraft.documentburster.common.reportparameters.BuiltinVariables;

import jakarta.servlet.http.HttpServletRequest;

/**
 * What the embedding application says about a viewer DataPallas has no account for: the attribute
 * bag behind {@code ${dp_attr_<name>}}.
 *
 * <p>A host portal renders a page for its own signed-in customer and mints a token saying
 * "this viewer is customer 4711"; a widget then writes {@code WHERE customer_id =
 * ${dp_attr_customer_id}} and sees that customer's rows and no others. It is what makes a dashboard
 * embeddable for people who never sign in here, and every embedding BI tool has the same thing
 * (Power BI {@code CUSTOMDATA()}, Tableau {@code USERATTRIBUTE()}, Looker user attributes).
 *
 * <p>It is <em>not</em> a lock. A lock ({@link LockedParams}) pins a value of a parameter the report
 * declares, and the viewer sees it disabled in {@code rb-parameters}; an attribute is declared
 * nowhere, never shown, and readable from any widget's SQL and any {@code access_filter}. The two
 * travel the same way, though, and for the same reason: inside the signed token or the stored share
 * link row, never in the request — a viewer who edits the token breaks the signature, and a viewer
 * who types {@code ?dp_attr_customer_id=1} is overwritten by the server's value.
 *
 * <p>This class is the one place that knows how an attribute travels: as the {@code at} claim of an
 * embed token, as JSON in {@code share_token.attributes}, and, once
 * {@link EmbedTokenAuthorizationManager} has resolved the credential, as a request attribute
 * {@link UserVariables} reads. The zone and the locale a token may carry for its viewer ride
 * alongside them, because they come from the same credential and nowhere else.
 */
public final class CallerAttributes {

	private static final Logger log = LoggerFactory.getLogger(CallerAttributes.class);

	/** Set by {@link EmbedTokenAuthorizationManager} on a request whose credential carries attributes. */
	public static final String REQUEST_ATTRIBUTE = "dp.callerAttributes";

	/** The zone the credential asks for, if any: {@link UserVariables} prefers it over the tenant's. */
	public static final String ZONE_REQUEST_ATTRIBUTE = "dp.callerZone";

	/** The locale the credential asks for, if any. */
	public static final String LOCALE_REQUEST_ATTRIBUTE = "dp.callerLocale";

	/** {@code dp_attr_customer_id} - the variable name the attribute {@code customer_id} answers to. */
	public static final String PREFIX = BuiltinVariables.PREFIX + "attr_";

	/**
	 * Lower-case letters, digits and {@code _}, starting with a letter.
	 *
	 * <p>Not a style preference: the name becomes a variable name in SQL, and
	 * {@code ScriptAssembler} finds {@code ${dp_attr_<name>}} tokens with exactly this alphabet. A
	 * {@code Customer-ID} attribute could be set and never read, which is the worst possible outcome
	 * for a value a filter depends on - the widget would show every row instead of failing.
	 */
	private static final Pattern NAME = Pattern.compile("[a-z][a-z0-9_]*");

	private static final ObjectMapper MAPPER = new ObjectMapper();

	private CallerAttributes() {
	}

	/**
	 * @return the attributes the credential of this request carries, never null. Empty for everyone
	 *         who is signed in, for the desktop and for an API caller: attributes describe a viewer
	 *         the host application vouches for, and there is no such viewer behind a session.
	 */
	@SuppressWarnings("unchecked")
	public static Map<String, String> of(HttpServletRequest request) {

		if (request == null)
			return Map.of();

		Object attribute = request.getAttribute(REQUEST_ATTRIBUTE);
		return attribute instanceof Map ? (Map<String, String>) attribute : Map.of();
	}

	/** @return the zone this request's credential asks for, or null - almost always null. */
	public static String zoneOf(HttpServletRequest request) {
		Object value = request == null ? null : request.getAttribute(ZONE_REQUEST_ATTRIBUTE);
		return value instanceof String zone ? zone : null;
	}

	/** @return the locale this request's credential asks for, or null. */
	public static String localeOf(HttpServletRequest request) {
		Object value = request == null ? null : request.getAttribute(LOCALE_REQUEST_ATTRIBUTE);
		return value instanceof String locale ? locale : null;
	}

	/**
	 * What a host application sent as {@code attrs}, checked and flattened to text.
	 *
	 * <p>Checked when the token or the link is <em>created</em>, which is the only moment anybody is
	 * there to be told. A name that cannot be read from SQL, or a value that is not a value, is
	 * refused here rather than stored and silently ignored on every later request.
	 *
	 * @throws IllegalArgumentException naming the attribute, which the controllers turn into a 400
	 */
	public static Map<String, String> validated(Object raw) {

		if (raw == null)
			return Map.of();

		if (!(raw instanceof Map<?, ?> given))
			throw new IllegalArgumentException("attrs must be an object of name/value pairs");

		Map<String, String> attributes = new LinkedHashMap<>();

		for (Map.Entry<?, ?> entry : given.entrySet()) {

			String name = entry.getKey() == null ? "" : String.valueOf(entry.getKey()).trim();

			if (!NAME.matcher(name).matches())
				throw new IllegalArgumentException("'" + name
						+ "' is not an attribute name. Use lower-case letters, digits and _, starting with a letter.");

			Object value = entry.getValue();

			// A list or a nested object has no single bound value, and guessing at one (the first
			// element? the JSON?) would be a filter nobody wrote.
			if (value instanceof Map || value instanceof Iterable || (value != null && value.getClass().isArray()))
				throw new IllegalArgumentException("The attribute '" + name + "' must be a single value.");

			attributes.put(name, value == null ? "" : String.valueOf(value));
		}

		return attributes;
	}

	/** @return the JSON stored in {@code share_token.attributes}, or null when there is nothing to say. */
	public static String toJson(Map<String, String> attributes) {

		if (attributes == null || attributes.isEmpty())
			return null;

		try {
			return MAPPER.writeValueAsString(attributes);
		} catch (Exception e) {
			throw new IllegalStateException("Could not store the caller attributes", e);
		}
	}

	/**
	 * @return the attributes stored with a link. A link created before attributes existed has no
	 *         value there, and unreadable JSON is treated the same way: the link keeps working with
	 *         none, which is what it did before. A widget that names one then sees an empty value and
	 *         matches no row - never every row.
	 */
	public static Map<String, String> fromJson(String json) {

		if (StringUtils.isBlank(json))
			return Map.of();

		try {
			return MAPPER.readValue(json, new TypeReference<LinkedHashMap<String, String>>() {
			});
		} catch (Exception e) {
			log.warn("Ignoring unreadable attributes on a share link", e);
			return Map.of();
		}
	}
}
