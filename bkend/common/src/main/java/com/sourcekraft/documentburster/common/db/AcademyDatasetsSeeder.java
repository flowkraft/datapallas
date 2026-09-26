package com.sourcekraft.documentburster.common.db;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Loads the DataZeus academy datasets at scale S into a Northwind sample database: Northwind
 * Company, its warehouse and its change log, each from the install script that ships with the
 * DataZeus content in {@code db/datazeus/datasets/scripts}.
 *
 * <p>
 * Each dataset is loaded once and then left alone. A script writes its schema's
 * {@code _dataset_info} (one row per table, with the table's row count) as its very last step,
 * so a schema whose {@code _dataset_info} is filled and whose tables hold the counts it records
 * is complete. A schema that is missing, or that a start stopped half-way, is not: its script
 * runs again, and the script drops the schema before it builds it, so nothing is loaded twice.
 * The datasets after it are built from it, so they are rebuilt too.
 * </p>
 *
 * <p>
 * On PostgreSQL the seed runs on every start of the sample and holds an advisory lock while it
 * works, so two starts at once (the app and the command line, say) load the data one time.
 * </p>
 */
public class AcademyDatasetsSeeder {

	private static final Logger log = LoggerFactory.getLogger(AcademyDatasetsSeeder.class);

	/** Schema and install script, in build order: each dataset is built from the ones before it. */
	static final List<String[]> DATASETS = List.of(
			new String[] { "northwind_co_s", "academy-northwind-co-install.groovy" },
			new String[] { "northwind_co_dw_s", "academy-northwind-co-dw-install.groovy" },
			new String[] { "northwind_co_changes_s", "academy-northwind-co-changes.groovy" });

	/** The PostgreSQL advisory lock the seed holds; any fixed number no other code uses. */
	private static final long POSTGRES_LOCK_KEY = 7_301_202_609_260_001L;

	private AcademyDatasetsSeeder() {
	}

	/**
	 * Loads every dataset that is not complete yet. A scripts folder that is not there, or that
	 * lacks one of the scripts, is not an error: the database is left as it is.
	 *
	 * @param vendor {@code DUCKDB} or {@code POSTGRES}, the two the academy datasets ship on
	 */
	public static void seed(Connection connection, String vendor, Path scriptsDir) throws Exception {

		for (String[] dataset : DATASETS) {
			Path script = scriptsDir.resolve(dataset[1]);
			if (!Files.isRegularFile(script)) {
				log.warn("No academy install script at {} - the {} sample is built without the academy "
						+ "datasets", script.toAbsolutePath(), vendor);
				return;
			}
		}

		boolean postgres = "POSTGRES".equals(vendor);
		connection.setAutoCommit(true);
		if (postgres) {
			try (Statement st = connection.createStatement()) {
				st.execute("SELECT pg_advisory_lock(" + POSTGRES_LOCK_KEY + ")");
			}
		}

		try {
			boolean earlierRebuilt = false;
			for (String[] dataset : DATASETS) {
				String schema = dataset[0];
				if (!earlierRebuilt && isComplete(connection, schema)) {
					log.info("Academy dataset {} is already loaded", schema);
					continue;
				}

				log.info("Loading academy dataset {} on {} with {}", schema, vendor, dataset[1]);
				long started = System.currentTimeMillis();
				SeedScriptRunner.run(connection, vendor, scriptsDir.resolve(dataset[1]), Map.of("SCALE", "S"));
				connection.setAutoCommit(true);

				if (!isComplete(connection, schema)) {
					throw new IllegalStateException("The academy install script " + dataset[1]
							+ " finished, but " + schema + " does not hold what its _dataset_info records.");
				}
				log.info("Academy dataset {} loaded in {} s", schema, (System.currentTimeMillis() - started) / 1000);
				earlierRebuilt = true;
			}
		} finally {
			if (postgres) {
				try (Statement st = connection.createStatement()) {
					st.execute("SELECT pg_advisory_unlock(" + POSTGRES_LOCK_KEY + ")");
				}
			}
		}
	}

	/**
	 * True when the schema's {@code _dataset_info} has rows and every table it names holds the row
	 * count it records.
	 */
	static boolean isComplete(Connection connection, String schema) throws SQLException {

		if (!tableExists(connection, schema, "_dataset_info")) {
			return false;
		}

		List<Object[]> recorded = new ArrayList<>();
		try (Statement st = connection.createStatement();
				ResultSet rs = st.executeQuery(
						"SELECT \"TableName\", \"RowCount\" FROM " + schema + ".\"_dataset_info\"")) {
			while (rs.next()) {
				recorded.add(new Object[] { rs.getString(1), rs.getLong(2) });
			}
		}
		if (recorded.isEmpty()) {
			return false;
		}

		for (Object[] table : recorded) {
			String name = (String) table[0];
			if (!tableExists(connection, schema, name)) {
				return false;
			}
			try (Statement st = connection.createStatement();
					ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM " + schema + ".\"" + name + "\"")) {
				rs.next();
				if (rs.getLong(1) != (long) table[1]) {
					log.warn("Academy dataset {}: table {} holds {} rows where _dataset_info records {}", schema,
							name, rs.getLong(1), table[1]);
					return false;
				}
			}
		}
		return true;
	}

	private static boolean tableExists(Connection connection, String schema, String table) throws SQLException {
		try (PreparedStatement ps = connection.prepareStatement(
				"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ? AND table_name = ?")) {
			ps.setString(1, schema);
			ps.setString(2, table);
			try (ResultSet rs = ps.executeQuery()) {
				rs.next();
				return rs.getLong(1) > 0;
			}
		}
	}
}
