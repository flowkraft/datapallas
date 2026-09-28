package com.flowkraft.queries;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.flowkraft.queries.services.QueriesService;

/**
 * A dashboard parameter reaches the backend as the text an HTML control wrote, and is bound as the
 * type the dashboard declared for it.
 *
 * <p>The types live in {@code parametersConfig}, next to the parameter the user fills in;
 * {@link com.sourcekraft.documentburster.common.reportparameters.ParameterTypes} turns the text
 * into that type, and {@code QueriesService.prepare} - the production path, called here, not a
 * copy - is where a query's parameters go through it. This test runs both legs that need no
 * container, SQLite and DuckDB, each on a table it creates itself, so it says what the two ways of
 * binding actually answer rather than what a driver is believed to do.
 *
 * <p>The vendor loop of {@code GeneratedSqlAllVendorsTest} asks the same question of the AI Hub
 * cases p1a..p1d on every vendor; this test is the narrow one, on the binding alone.
 */
class QueriesParameterTypesTest {

	@TempDir
	Path tempDir;

	/** Three closes in January, one in February, and amounts either side of 32000. */
	private void seed(Connection connection, String dateType) throws Exception {
		try (Statement statement = connection.createStatement()) {
			statement.execute("CREATE TABLE deals (close_date " + dateType + ", amount DECIMAL(12,2))");
			statement.execute("INSERT INTO deals VALUES ('2026-01-05', 10000.00)");
			statement.execute("INSERT INTO deals VALUES ('2026-01-31', 32000.00)");
			statement.execute("INSERT INTO deals VALUES ('2026-01-20', 32000.50)");
			statement.execute("INSERT INTO deals VALUES ('2026-02-10', 99000.00)");
		}
	}

	private Connection open(String vendor) throws Exception {
		if ("duckdb".equals(vendor)) {
			Connection connection = DriverManager
					.getConnection("jdbc:duckdb:" + tempDir.resolve("p1.duckdb").toAbsolutePath());
			seed(connection, "DATE");
			return connection;
		}
		Connection connection = DriverManager.getConnection(
				"jdbc:sqlite:" + tempDir.resolve("p1.db").toAbsolutePath().toString().replace("\\", "/"));
		// SQLite has no date type: the column holds the text the insert wrote, which is what the
		// shipped sample holds too.
		seed(connection, "TEXT");
		return connection;
	}

	private static Map<String, Object> params(String name, String value) {
		Map<String, Object> params = new LinkedHashMap<>();
		params.put(name, value);
		return params;
	}

	private static Map<String, String> types(String name, String type) {
		Map<String, String> types = new LinkedHashMap<>();
		types.put(name, type);
		return types;
	}

	/** Runs a prepared query on this connection and returns the single number it answers. */
	private static long count(Connection connection, QueriesService.PreparedSql prepared) throws Exception {
		// A handle closes its connection when it closes; this is the one connection of the
		// throwaway database, so it is handed over as a proxy that ignores close(), the way
		// GeneratedSqlAllVendorsTest does it.
		Connection notClosing = (Connection) java.lang.reflect.Proxy.newProxyInstance(
				QueriesParameterTypesTest.class.getClassLoader(), new Class<?>[] { Connection.class },
				(proxy, method, arguments) -> {
					if ("close".equals(method.getName())) return null;
					try {
						return method.invoke(connection, arguments);
					} catch (java.lang.reflect.InvocationTargetException wrapped) {
						throw wrapped.getCause();
					}
				});
		// The product's own JDBI configuration, installed the way DatabaseConnectionManager does it.
		org.jdbi.v3.core.Jdbi jdbi = com.sourcekraft.documentburster.common.reportparameters.ParameterArguments
				.install(org.jdbi.v3.core.Jdbi.create(() -> notClosing));
		try (org.jdbi.v3.core.Handle handle = jdbi.open()) {
			org.jdbi.v3.core.statement.Query query = handle.createQuery(prepared.sql());
			for (Map.Entry<String, Object> bind : prepared.params().entrySet()) {
				if (bind.getValue() instanceof List<?> list) query.bindList(bind.getKey(), list);
				else query.bind(bind.getKey(), bind.getValue());
			}
			return query.mapTo(Long.class).one();
		}
	}

	@Test
	void ansi_prepare_binds_a_date_parameter_as_a_date() {
		QueriesService.PreparedSql prepared = QueriesService.prepare(
				"SELECT COUNT(*) FROM deals WHERE close_date <= ${to}", params("to", "2026-01-31"),
				types("to", "Date"));

		assertEquals("SELECT COUNT(*) FROM deals WHERE close_date <= :to", prepared.sql(),
				"the generator's ${to} becomes the named bind JDBI reads");
		assertInstanceOf(java.time.LocalDate.class, prepared.params().get("to"),
				"a Date parameter is bound as a date, so the driver sends a date and not a string");
		assertEquals("2026-01-31", prepared.params().get("to").toString());
	}

	@Test
	void ansi_prepare_binds_a_datetime_parameter_without_seconds() {
		// datetime-local writes 2026-01-31T14:05 - no seconds - and that is what arrives.
		QueriesService.PreparedSql prepared = QueriesService.prepare(
				"SELECT COUNT(*) FROM deals WHERE close_date <= ${ts}", params("ts", "2026-01-31T14:05"),
				types("ts", "DateTime"));

		assertInstanceOf(java.time.LocalDateTime.class, prepared.params().get("ts"));
		assertEquals("2026-01-31T14:05", prepared.params().get("ts").toString());
	}

	@Test
	void ansi_prepare_binds_numbers_by_their_declared_type() {
		assertInstanceOf(Long.class,
				QueriesService.prepare("SELECT COUNT(*) FROM deals WHERE amount > ${min}", params("min", "32000"),
						types("min", "Integer")).params().get("min"));

		Object decimal = QueriesService
				.prepare("SELECT COUNT(*) FROM deals WHERE amount > ${min}", params("min", "31999.99"),
						types("min", "Double"))
				.params().get("min");
		assertInstanceOf(java.math.BigDecimal.class, decimal, "a Double keeps its fraction, exactly");
		assertEquals("31999.99", decimal.toString());
	}

	@Test
	void ansi_prepare_leaves_an_undeclared_parameter_as_text() {
		assertInstanceOf(String.class,
				QueriesService.prepare("SELECT COUNT(*) FROM deals WHERE close_date <= ${to}",
						params("to", "2026-01-31"), Map.of()).params().get("to"),
				"no declared type: the value stays the text it arrived as, as it always did");
	}

	/**
	 * The same comparison, bound both ways, on both in-process legs.
	 *
	 * <p>This is the "before the fix" reading the plan asks for: the text bind is what production
	 * did until the declared type reached {@code prepare}.
	 */
	@Test
	void ansi_a_typed_date_bind_answers_where_a_text_bind_is_the_vendor_s_guess() throws Exception {
		for (String vendor : List.of("sqlite", "duckdb")) {
			try (Connection connection = open(vendor)) {
				String sql = "SELECT COUNT(*) FROM deals WHERE close_date <= ${to}";

				long typed = count(connection,
						QueriesService.prepare(sql, params("to", "2026-01-31"), types("to", "Date")));
				assertEquals(3, typed, vendor + ": three deals close on or before the 31st of January");

				long asText = count(connection, QueriesService.prepare(sql, params("to", "2026-01-31"), Map.of()));
				// SQLite compares the two as text and lands on the same three; DuckDB casts the
				// string to a date for the comparison. Neither is wrong here - but neither is the
				// driver being told what the value is, and PostgreSQL refuses the same query
				// outright (date <= character varying has no operator), which is the reason the
				// declared type has to travel with the value.
				assertEquals(3, asText, vendor + ": the text bind happens to agree on these two legs");
			}
		}
	}

	@Test
	void ansi_a_typed_number_bind_answers_where_a_text_bind_is_the_vendor_s_guess() throws Exception {
		for (String vendor : List.of("sqlite", "duckdb")) {
			try (Connection connection = open(vendor)) {
				String sql = "SELECT COUNT(*) FROM deals WHERE amount > ${min}";

				assertEquals(2, count(connection,
						QueriesService.prepare(sql, params("min", "32000"), types("min", "Integer"))),
						vendor + ": 32000.50 and 99000.00 are over 32000");
				assertEquals(3, count(connection,
						QueriesService.prepare(sql, params("min", "31999.99"), types("min", "Double"))),
						vendor + ": the fraction keeps the deal of exactly 32000.00");

				assertEquals(2, count(connection, QueriesService.prepare(sql, params("min", "32000"), Map.of())),
						vendor + ": the text bind reads 2 here as well - SQLite compares a string with a"
								+ " number by rank and DuckDB casts it, and both land on the same two rows");
			}
		}
	}
}
