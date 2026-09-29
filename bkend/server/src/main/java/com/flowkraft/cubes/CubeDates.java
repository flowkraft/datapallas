package com.flowkraft.cubes;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.flowkraft.reporting.dsl.cube.CubeRules;

/**
 * Dates written relative to the data's today (R7), and the one place that turns them into days.
 *
 * <p><b>Why they are not dates.</b> The demo data moves: it is seeded to the day it is installed, so
 * the same row is dated last week on one machine and last month on another (Phase 1b's date shift,
 * {@code cube_demo.demo_info}). A hint that filtered {@code 2026-07-01 … 2026-09-30}, or a parameter
 * that defaulted to them, would be the current quarter on the machine the numbers were written on
 * and nothing at all on every other. So a sample's dates say what they mean —
 * {@code {dataToday:startOf quarter}} — and this class resolves them against the data's own today.
 *
 * <p><b>Never the real clock.</b> {@code now()} is the machine's today, not the data's; they are the
 * same only on the day the data was seeded. The today used here comes from {@code demo_info}
 * ({@link CubeDataToday}) at run time and from the pinned day in the tests, which is why the numbers
 * written in the plan and in the checks files stay true.
 *
 * <p><b>The syntax.</b> {@code {dataToday}} is that day; {@code {dataToday:<op>, <op>, …}} applies
 * each operation in turn, left to right:
 * <ul>
 * <li>{@code startOf <unit>} / {@code endOf <unit>} — the first or last day of the day, week
 * (Monday–Sunday), month, quarter or year the date is in;</li>
 * <li>{@code minus <n> <unit>} / {@code plus <n> <unit>} — that many days, weeks, months, quarters
 * or years before or after it.</li>
 * </ul>
 * So the data's current quarter is {@code {dataToday:startOf quarter}} to
 * {@code {dataToday:endOf quarter}}, and the same quarter a year earlier is
 * {@code {dataToday:minus 1 year, startOf quarter}} to {@code {dataToday:minus 1 year, endOf quarter}}.
 *
 * <p><b>ANSI SQL only — there is no SQL in this file at all.</b> A relative date is resolved to a
 * day before it ever reaches a statement, so no database has to be asked what {@code now()} means
 * there, and the same day is compared on all nine.
 */
public final class CubeDates {

	/** {@code {dataToday}} or {@code {dataToday:…}} — anywhere inside a larger text. */
	private static final Pattern TOKEN = Pattern.compile("\\{dataToday(?::([^}]*))?\\}");

	private CubeDates() {
	}

	/** True when this text holds a relative date, so that the data's today has to be read. */
	public static boolean mentions(String text) {
		return text != null && TOKEN.matcher(text).find();
	}

	/**
	 * The same text with every relative date resolved against this today. A text holding none is
	 * returned as it is, and null stays null.
	 *
	 * @throws IllegalArgumentException when a token asks for an operation this class does not know,
	 *                                 naming it — a sample's date is not left to mean whatever the
	 *                                 nearest guess would be
	 */
	public static String resolve(String text, LocalDate dataToday) {

		if (text == null || !mentions(text))
			return text;
		if (dataToday == null)
			throw new IllegalArgumentException("'" + text + "' is written relative to the data's today, "
					+ "and the data's today is not known here.");

		Matcher found = TOKEN.matcher(text);
		StringBuilder out = new StringBuilder();
		int from = 0;
		while (found.find()) {
			out.append(text, from, found.start());
			out.append(day(dataToday, found.group(1)));
			from = found.end();
		}
		out.append(text, from, text.length());
		return out.toString();
	}

	/** The day {@code {dataToday:<operations>}} is, with no text around it. */
	public static LocalDate day(LocalDate dataToday, String operations) {

		LocalDate day = dataToday;
		if (operations == null || operations.trim().isEmpty())
			return day;

		for (String operation : operations.split(",")) {
			String said = operation.trim();
			if (said.isEmpty())
				continue;
			day = applied(day, said);
		}
		return day;
	}

	private static LocalDate applied(LocalDate day, String operation) {

		String[] words = operation.split("\\s+");

		if (words.length == 2 && ("startOf".equalsIgnoreCase(words[0]) || "endOf".equalsIgnoreCase(words[0]))) {
			boolean start = "startOf".equalsIgnoreCase(words[0]);
			switch (unit(operation, words[1])) {
			case "day":
				return day;
			case "week":
				return start
						? day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
						: day.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
			case "month":
				return start ? day.withDayOfMonth(1) : day.with(TemporalAdjusters.lastDayOfMonth());
			case "quarter":
				int firstMonth = (day.getMonthValue() - 1) / 3 * 3 + 1;
				return start
						? day.withMonth(firstMonth).withDayOfMonth(1)
						: day.withMonth(firstMonth + 2).with(TemporalAdjusters.lastDayOfMonth());
			default:
				return start ? day.withDayOfYear(1) : day.with(TemporalAdjusters.lastDayOfYear());
			}
		}

		if (words.length == 3 && ("minus".equalsIgnoreCase(words[0]) || "plus".equalsIgnoreCase(words[0]))) {
			long many;
			try {
				many = Long.parseLong(words[1]);
			} catch (NumberFormatException notANumber) {
				throw refuse(operation, "'" + words[1] + "' is not a number of them");
			}
			if ("minus".equalsIgnoreCase(words[0]))
				many = -many;
			switch (unit(operation, words[2])) {
			case "day":
				return day.plusDays(many);
			case "week":
				return day.plusWeeks(many);
			case "month":
				return day.plusMonths(many);
			case "quarter":
				return day.plusMonths(many * 3);
			default:
				return day.plusYears(many);
			}
		}

		throw refuse(operation, "an operation is 'startOf <unit>', 'endOf <unit>', 'minus <n> <unit>' "
				+ "or 'plus <n> <unit>'");
	}

	/**
	 * One of the five grains, singular or plural, however it is capitalised.
	 *
	 * <p>The five are {@link CubeRules#TIME_UNITS}, the ones a query may be grouped by and a
	 * {@code time_shift} may move by: a relative date says nothing new about time, so it is read in
	 * the units the cube already has.
	 */
	private static String unit(String operation, String said) {

		String unit = said.trim().toLowerCase();
		if (unit.endsWith("s"))
			unit = unit.substring(0, unit.length() - 1);

		if (CubeRules.TIME_UNITS.contains(unit))
			return unit;

		throw refuse(operation, "'" + said + "' is not one of " + String.join(", ", CubeRules.TIME_UNITS));
	}

	private static IllegalArgumentException refuse(String operation, String why) {
		return new IllegalArgumentException(
				"'{dataToday:" + operation + "}' cannot be read: " + why + ".");
	}
}
