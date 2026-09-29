package com.flowkraft.cubes;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.flowkraft.queries.ConnectionFactory;
import com.sourcekraft.documentburster.common.db.DatabaseConnectionManager;
import com.sourcekraft.documentburster.common.db.SqlExecutor;

/**
 * The data's today, read from the data (R7).
 *
 * <p>The demo data is seeded to the day it is installed, and the day it was seeded to is in the data
 * itself: {@code cube_demo.demo_info} holds {@code data_today}, the day the rows were generated
 * around, and {@code shift_days}, how far every date in them was then moved so that the newest data
 * lands near the day the demo was installed (Phase 1b, A3). The day the data on the connection now
 * calls today is therefore {@code data_today + shift_days} — which is what {@code seeded_on} holds,
 * and the invariant {@code CubeDemoDateShiftTest} asserts. This class reads that one row, and
 * {@link CubeDates} turns the samples' {@code {dataToday:…}} into days with it.
 *
 * <p>On the frozen demo data the shift is zero and the two days are one, which is why the checks'
 * numbers can be pinned; on an installation seeded later they are months apart, and a quarter
 * written against {@code data_today} alone would be a quarter with nothing in it.
 *
 * <p><b>Never the machine's clock.</b> A missing or unreadable {@code demo_info} is refused, with a
 * message saying which connection and what to do. Falling back to {@code LocalDate.now()} would be
 * the one failure nobody would notice: the numbers would be right on the day the data was seeded and
 * would drift away from the checks afterwards, a day at a time.
 *
 * <p><b>ANSI SQL only.</b> {@code SELECT data_today, shift_days FROM cube_demo.demo_info} is the
 * whole statement, and it reads the same on all nine databases.
 */
@Component
public class CubeDataToday {

	private static final Logger log = LoggerFactory.getLogger(CubeDataToday.class);

	/** The one row, on whichever database the cube's connection is. */
	static final String SQL = "SELECT data_today, shift_days FROM cube_demo.demo_info";

	/**
	 * The day the data on this connection calls today.
	 *
	 * @throws IllegalArgumentException when {@code cube_demo.demo_info} cannot be read or holds no
	 *                                 day — a 400 rather than a 500, because what is wrong is the
	 *                                 data the cube was pointed at, not the server
	 */
	public LocalDate of(String connectionId) {

		List<Map<String, Object>> rows;
		try (DatabaseConnectionManager dbManager = ConnectionFactory.newConnectionManager()) {
			rows = new SqlExecutor(dbManager).queryOn(connectionId, SQL, null, 1);
		} catch (Exception cannotRead) {
			throw refuse(connectionId, cannotRead.getMessage());
		}

		if (rows == null || rows.isEmpty())
			throw refuse(connectionId, "the table is there and has no row in it");

		Map<String, Object> row = rows.get(0);
		LocalDate generated = day(value(row, "data_today"));
		if (generated == null)
			throw refuse(connectionId, "its data_today is '" + value(row, "data_today") + "'");

		long shift = shiftDays(connectionId, value(row, "shift_days"));
		LocalDate today = generated.plusDays(shift);

		log.debug("The data's today on connection '{}' is {} ({} shifted by {} days)", connectionId, today,
				generated, shift);
		return today;
	}

	/**
	 * How far the rows were moved. Missing or empty is no shift — the frozen data — and anything
	 * that is not a whole number of days is refused rather than guessed at.
	 */
	private static long shiftDays(String connectionId, Object value) {

		if (value == null)
			return 0L;
		if (value instanceof Number)
			return ((Number) value).longValue();

		String text = Objects.toString(value, "").trim();
		if (text.isEmpty())
			return 0L;
		try {
			return Long.parseLong(text);
		} catch (NumberFormatException notDays) {
			throw refuse(connectionId, "its shift_days is '" + text + "', which is not a number of days");
		}
	}

	/** A column of the row, whatever case the database answers its name in. */
	private static Object value(Map<String, Object> row, String column) {

		Object exact = row.get(column);
		if (exact != null)
			return exact;

		for (Map.Entry<String, Object> held : row.entrySet()) {
			if (column.equalsIgnoreCase(held.getKey()))
				return held.getValue();
		}
		return null;
	}

	/** The day a driver answered with, whichever of the four forms it chose. */
	private static LocalDate day(Object value) {

		if (value instanceof LocalDate)
			return (LocalDate) value;
		if (value instanceof LocalDateTime)
			return ((LocalDateTime) value).toLocalDate();
		if (value instanceof java.sql.Date)
			return ((java.sql.Date) value).toLocalDate();
		if (value instanceof java.util.Date)
			return new java.sql.Timestamp(((java.util.Date) value).getTime()).toLocalDateTime().toLocalDate();
		if (value == null)
			return null;

		try {
			// SQLite keeps a date as the text it was written as, and a longer text is a timestamp
			// whose day is its first ten characters.
			String text = Objects.toString(value, "").trim();
			return LocalDate.parse(text.length() > 10 ? text.substring(0, 10) : text);
		} catch (Exception notADay) {
			return null;
		}
	}

	private static IllegalArgumentException refuse(String connectionId, String why) {
		return new IllegalArgumentException("The demo data's today could not be read on connection '"
				+ connectionId + "': " + why + ". A sample cube's relative dates ({dataToday:…}) come "
				+ "from cube_demo.demo_info, never from this machine's clock, so the connection has to "
				+ "be one the demo data was installed on.");
	}
}
