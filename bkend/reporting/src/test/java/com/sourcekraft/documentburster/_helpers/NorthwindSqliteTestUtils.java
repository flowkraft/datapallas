package com.sourcekraft.documentburster._helpers;

import java.io.File;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.apache.commons.io.FileUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.sourcekraft.documentburster.common.db.northwind.NorthwindFixture;

/**
 * The SQLite Northwind, for the scripts that SHIP as SQLite samples.
 *
 * WHY THIS EXISTS ALONGSIDE {@link NorthwindTestUtils}. Most of the suite runs
 * against DuckDB, and should. But two test scripts -
 * scriptedReport_monthlySalesTrendReport.groovy and
 * scriptedReport_supplierScorecardReport.groovy - are also the SOURCE of the
 * shipped g-scr2htm-trend and g-scr2htm-supc samples, which run against the
 * bundled SQLite Northwind. A script has to be tested in the dialect it will
 * actually run in, otherwise the test proves nothing about what ships.
 *
 * ONE DIALECT, NO TRANSLATION. Those two scripts are therefore authored in
 * SQLite SQL and packaged verbatim. The alternative - authoring in one dialect
 * and rewriting the source text at package time - is what used to happen, and
 * it meant the bytes customers ran had never been executed by anything.
 *
 * DATES ARE EPOCH MILLISECONDS HERE. Hibernate maps LocalDateTime onto SQLite's
 * INTEGER affinity, so "OrderDate" and friends are epoch-ms numbers even though
 * the DDL says timestamp. That is why the scripts divide by 1000 and pass
 * 'unixepoch'. It is a property of the generator, not a guess - see the copy
 * comments in DuckDBDataWarehouseCreator.
 */
public final class NorthwindSqliteTestUtils {

	private static final Logger log = LoggerFactory.getLogger(NorthwindSqliteTestUtils.class);

	private static final String DB_DIR = "./target/test-northwind-sqlite";
	private static final String DB_PATH = DB_DIR + "/northwind.db";

	public static final String URL = "jdbc:sqlite:" + DB_PATH;
	public static final String USER = "";
	public static final String PASS = "";
	public static final String DRIVER = "org.sqlite.JDBC";

	private static boolean materialized = false;

	private NorthwindSqliteTestUtils() {
	}

	/**
	 * Materializes a private, writable copy of the SQLite fixture once per JVM.
	 * It lives under target/ so mvn clean disposes of it, and it is a copy so no
	 * test can disturb the canonical fixture or the packaged sample.
	 */
	public static synchronized void setupTestDatabase() throws Exception {

		if (materialized)
			return;

		File dir = new File(DB_DIR);
		if (dir.exists())
			FileUtils.deleteDirectory(dir);

		NorthwindFixture.writableSqliteCopy(Paths.get(DB_PATH));

		Class.forName(DRIVER);

		materialized = true;
		log.info("SQLite Northwind test database ready at {}", DB_PATH);
	}

	/**
	 * Runs a query and returns every row as column -> value, preserving the order
	 * the database returned. Empty results throw, because an assertion built on
	 * no rows would pass vacuously.
	 */
	public static List<Map<String, String>> queryRows(String sql) throws Exception {

		List<Map<String, String>> rows = new ArrayList<>();

		try (Connection conn = DriverManager.getConnection(URL, USER, PASS);
				PreparedStatement pstmt = conn.prepareStatement(sql);
				ResultSet rs = pstmt.executeQuery()) {

			ResultSetMetaData meta = rs.getMetaData();

			while (rs.next()) {
				LinkedHashMap<String, String> row = new LinkedHashMap<>();
				for (int i = 1; i <= meta.getColumnCount(); i++)
					row.put(meta.getColumnLabel(i), String.valueOf(rs.getObject(i)));
				rows.add(row);
			}
		}

		if (rows.isEmpty())
			throw new IllegalStateException("Expectation query returned no rows, so any assertion built on it would "
					+ "pass vacuously. Query: " + sql);

		return rows;
	}
}
