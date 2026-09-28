package com.sourcekraft.documentburster.common.reportparameters;

import java.sql.Types;
import java.time.LocalDate;
import java.time.LocalDateTime;

import org.jdbi.v3.core.Jdbi;
import org.jdbi.v3.core.argument.AbstractArgumentFactory;
import org.jdbi.v3.core.argument.Argument;
import org.jdbi.v3.core.config.ConfigRegistry;

/**
 * How a converted date reaches the driver: through {@code setObject}, as the {@code java.time}
 * value it is.
 *
 * <h2>Why it exists</h2>
 * {@link ParameterTypes} turns the text of a dashboard parameter into the type the dashboard
 * declared - a {@code Date} becomes a {@link LocalDate}. JDBI's own binding for {@code java.time}
 * then turns that back into a {@code java.sql.Date} and calls {@code setDate}, which is where
 * SQLite loses it: the SQLite driver writes a {@code java.sql.Date} as epoch milliseconds, and a
 * number never compares equal - or even in order - with the text {@code 2026-01-31} a date column
 * of the shipped sample holds. The same conversion also costs the time zone nothing to get wrong.
 *
 * <p>A JDBC 4.2 driver is required to accept {@code setObject} with a {@code java.time} value and
 * to send it as the date or timestamp it is. Every vendor the product supports ships one, and this
 * is what they answer: SQLite writes the ISO text, DuckDB and the server vendors a real DATE.
 *
 * <p>Installed on every JDBI instance the product opens (see
 * {@code DatabaseConnectionManager.getJdbi}), so the canvas, a published dashboard and a share
 * link all bind a date the same way. The Groovy path needs nothing: {@code groovy.sql.Sql} calls
 * {@code setObject} already.
 */
public final class ParameterArguments {

	private ParameterArguments() {
	}

	/** Registers the two {@code java.time} bindings on this JDBI instance and returns it. */
	public static Jdbi install(Jdbi jdbi) {

		jdbi.registerArgument(new AbstractArgumentFactory<LocalDate>(Types.DATE) {
			@Override
			protected Argument build(LocalDate value, ConfigRegistry config) {
				return (position, statement, ctx) -> statement.setObject(position, value);
			}
		});

		jdbi.registerArgument(new AbstractArgumentFactory<LocalDateTime>(Types.TIMESTAMP) {
			@Override
			protected Argument build(LocalDateTime value, ConfigRegistry config) {
				return (position, statement, ctx) -> statement.setObject(position, value);
			}
		});

		return jdbi;
	}
}
