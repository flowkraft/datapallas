package com.flowkraft.embed;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.stream.Collectors;

import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.http.HttpServletRequest;

/**
 * The parameter values a link or a token forces on every data request made with it.
 *
 * <p>A locked parameter is the difference between "here is the sales dashboard" and "here is the
 * sales dashboard <em>for your region</em>". The value is decided once — by the person creating the
 * share link, or by the host application minting an embed token for its own signed-in customer — and
 * the viewer can never change it, because the override happens on the server after the query string
 * has been read.
 *
 * <p>This class is the one place that knows how a lock travels: as JSON in the {@code share_token}
 * row, as the {@code lp} claim of an embed token, and, once
 * {@link EmbedTokenAuthorizationManager} has resolved the credential, as a request attribute the
 * controllers read. Keeping the three in one file is what stops them drifting apart — a lock that is
 * written in one shape and read in another is a lock that silently does nothing.
 */
public final class LockedParams {

	private static final Logger log = LoggerFactory.getLogger(LockedParams.class);

	/** Set by {@link EmbedTokenAuthorizationManager} on a request a locking credential authorised. */
	public static final String REQUEST_ATTRIBUTE = "dp.lockedParams";

	private static final ObjectMapper MAPPER = new ObjectMapper();

	private LockedParams() {
	}

	/**
	 * @return the locks the credential of this request carries, never null. Empty means the caller is
	 *         signed in, or holds a credential that locks nothing — either way, nothing is overridden.
	 */
	@SuppressWarnings("unchecked")
	public static Map<String, Object> of(HttpServletRequest request) {

		if (request == null)
			return Map.of();

		Object attribute = request.getAttribute(REQUEST_ATTRIBUTE);
		return attribute instanceof Map ? (Map<String, Object>) attribute : Map.of();
	}

	/** @return the JSON stored in {@code share_token.locked_params}, or null when there is nothing to lock. */
	public static String toJson(Map<String, Object> lockedParams) {

		if (lockedParams == null || lockedParams.isEmpty())
			return null;

		try {
			return MAPPER.writeValueAsString(lockedParams);
		} catch (Exception e) {
			throw new IllegalStateException("Could not store the locked parameters", e);
		}
	}

	/**
	 * @return the locks stored with a link. A link created before locks existed has no column value,
	 *         and unreadable JSON is treated the same way: the link keeps working, unlocked, which is
	 *         exactly what it did before. Refusing to open it would break shared links over a storage
	 *         detail.
	 */
	public static Map<String, Object> fromJson(String json) {

		if (StringUtils.isBlank(json))
			return Map.of();

		try {
			return MAPPER.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {
			});
		} catch (Exception e) {
			log.warn("Ignoring unreadable locked parameters on a share link", e);
			return Map.of();
		}
	}

	/**
	 * A locked value as the data endpoint expects it in its query map.
	 *
	 * <p>A multi-value parameter arrives from the browser as one comma-separated value, so a locked
	 * list has to be written the same way — the report never learns which of the two set it.
	 */
	public static String asQueryValue(Object value) {

		if (value == null)
			return "";

		if (value instanceof Collection<?> values)
			return values.stream().map(item -> item == null ? "" : String.valueOf(item))
					.collect(Collectors.joining(","));

		return String.valueOf(value);
	}
}
