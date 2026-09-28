package com.flowkraft.iam;

import java.time.ZoneId;
import java.util.Locale;

import org.apache.commons.lang3.StringUtils;

/**
 * The two things a person (or a whole tenant) can say about themselves that change what a dashboard
 * answers: which zone their "today" is in, and which language tag their numbers and dates are read
 * in.
 *
 * <p>Both are stored as text and both are checked here, in one place, because they are written from
 * an admin screen and read on every data request: a zone that has stopped being a zone must be
 * refused while somebody is looking at the form, not discovered by a dashboard that suddenly reports
 * yesterday.
 */
public final class Preferences {

	private Preferences() {
	}

	/** @return the zone, or null when the text is blank or not a zone the JDK knows. */
	public static ZoneId zoneOrNull(String value) {

		if (StringUtils.isBlank(value))
			return null;

		try {
			return ZoneId.of(value.trim());
		} catch (Exception e) {
			return null;
		}
	}

	/** An IANA zone, which is what {@code ZoneId.of} accepts. {@code Mars/Olympus} is not one. */
	public static boolean isValidZone(String value) {
		return zoneOrNull(value) != null;
	}

	/**
	 * A BCP 47 tag, checked by the round trip: {@code Locale.forLanguageTag} never throws — it
	 * answers {@code und} for anything it cannot read — so the only way to tell {@code pt-BR} from
	 * {@code xx-!!} is to ask it to write the tag back out and compare.
	 */
	public static boolean isValidLocale(String value) {

		if (StringUtils.isBlank(value))
			return false;

		String tag = value.trim();
		return Locale.forLanguageTag(tag).toLanguageTag().equals(tag);
	}

	/**
	 * What an edit form sends: blank means "no opinion, ask the tenant (or the server)", and anything
	 * else has to be a real zone or a real tag.
	 *
	 * @throws IllegalArgumentException with a message naming the value, which the controllers turn
	 *                                  into a 400 the form shows next to the field
	 */
	public static void assertValid(String timezone, String locale) {

		if (StringUtils.isNotBlank(timezone) && !isValidZone(timezone))
			throw new IllegalArgumentException(
					"'" + timezone + "' is not a time zone. Use an IANA name such as Europe/Berlin.");

		if (StringUtils.isNotBlank(locale) && !isValidLocale(locale))
			throw new IllegalArgumentException(
					"'" + locale + "' is not a language tag. Use a BCP 47 tag such as de-DE.");
	}
}
