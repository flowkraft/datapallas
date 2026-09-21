package com.sourcekraft.documentburster.common.db.northwind;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.Comparator;
import java.util.Properties;

/**
 * Shared Northwind test fixture, published to the other modules via
 * rb-common's test-jar.
 *
 * WHY THIS EXISTS. There are two prebuilt Northwind databases lying around on a
 * developer machine - db/sample-northwind-sqlite/northwind.db and
 * db/sample-northwind-duckdb/northwind.duckdb - and neither is safe to test
 * against:
 *
 * - both are gitignored (.gitignore: *.duckdb), so they are absent on a clean
 *   checkout and on CI;
 * - NoExeAssembler deliberately EXCLUDES them from the package and regenerates
 *   them at build time, so whatever is on disk is a stale byproduct rather than
 *   what ships (a local pair was measured at 15 customers / 7 orders while the
 *   generator produces 25 / 79);
 * - DuckDB opens files read-write by default and upgrades the storage format
 *   one-way, so a test run could quietly corrupt them - and because they are
 *   gitignored, git would never tell you.
 *
 * So this fixture does not read either file. It runs the SAME code path the
 * packager runs (NorthwindManager -> SQLite via JPA, then
 * DuckDBDataWarehouseCreator -> DuckDB built from that SQLite), into a
 * throwaway temp directory. Test data therefore equals shipped data by
 * construction, and the drift above cannot come back.
 *
 * COST: one generation per JVM. Surefire here runs forkCount=1/reuseForks=true,
 * so that is once per module, not once per test class.
 *
 * TWO DUCKDB FACTS THAT SHAPE THIS CLASS, both measured rather than assumed:
 *
 * 1. In-memory DuckDB is NOT shared between connections - a second
 *    getConnection("jdbc:duckdb:") gets its own empty database, so a fixture
 *    generated in memory would be invisible to the code under test. There is no
 *    named-in-memory escape hatch either, so the fixture has to be a FILE.
 *    Connections to the same file in one JVM DO share.
 *
 * 2. DuckDB refuses to open one file read-only and read-write at the same time
 *    in the same JVM ("Can't open a connection to same database file with a
 *    different configuration"). Hence the split below: {@link #readOnly()} hands
 *    out the canonical file and only ever opens it read-only, while anything
 *    that needs to write asks for its own copy via {@link #writableCopy(Path)}.
 */
public final class NorthwindFixture {

	/** Set on the read-only connections. The URL form (?access_mode=...) does NOT work - it is parsed as part of the filename. */
	private static final String READ_ONLY_PROPERTY = "duckdb.read_only";

	private static Path canonicalDuckDb;
	private static Path canonicalSqlite;
	private static Path tempRoot;

	private NorthwindFixture() {
	}

	/**
	 * The generated DuckDB file. Treat it as read-only - see {@link #readOnly()}.
	 * Generated on first call and reused for the rest of the JVM.
	 */
	public static synchronized Path duckDbFile() throws Exception {
		build();
		return canonicalDuckDb;
	}

	/** The generated SQLite file, for tests that need the OLTP shape rather than the star schema. */
	public static synchronized Path sqliteFile() throws Exception {
		build();
		return canonicalSqlite;
	}

	/**
	 * Opens the canonical DuckDB read-only. Safe to call repeatedly and
	 * concurrently; writes through it are refused by DuckDB itself, so a test
	 * cannot corrupt the fixture even by accident.
	 */
	public static Connection readOnly() throws Exception {
		Properties props = new Properties();
		props.setProperty(READ_ONLY_PROPERTY, "true");
		return DriverManager.getConnection(jdbcUrl(duckDbFile()), props);
	}

	/**
	 * Copies the DuckDB fixture to {@code destination} and returns it, for tests
	 * that need to write. Give each such test its own destination (a JUnit
	 * {@code @TempDir} is the obvious one) - a writable copy must never be the
	 * canonical file, per fact 2 in the class comment.
	 */
	public static Path writableCopy(Path destination) throws Exception {
		Files.createDirectories(destination.getParent());
		Files.copy(duckDbFile(), destination, StandardCopyOption.REPLACE_EXISTING);
		return destination;
	}

	/**
	 * Copies the SQLite fixture to {@code destination} and returns it. Same rule
	 * as {@link #writableCopy(Path)}: never hand back the canonical file.
	 */
	public static Path writableSqliteCopy(Path destination) throws Exception {
		Files.createDirectories(destination.getParent());
		Files.copy(sqliteFile(), destination, StandardCopyOption.REPLACE_EXISTING);
		return destination;
	}

	/** DuckDB wants forward slashes even on Windows. */
	public static String jdbcUrl(Path duckDb) {
		return "jdbc:duckdb:" + duckDb.toAbsolutePath().toString().replace(File.separatorChar, '/');
	}

	/**
	 * Proves the fixture lives in the JVM temp area and nowhere near the product.
	 *
	 * The packaged sample at db/sample-northwind-duckdb/northwind.duckdb must never
	 * be opened by a test: DuckDB opens read-write by default and upgrades the
	 * storage format one way, and the file is gitignored, so a corruption would be
	 * both silent and unrecoverable. This check makes that a build failure rather
	 * than a convention someone can forget.
	 */
	private static void assertIsolatedFromProduct(Path candidate) {
		Path resolved = candidate.toAbsolutePath().normalize();
		Path tempDir = Paths.get(System.getProperty("java.io.tmpdir")).toAbsolutePath().normalize();

		if (!resolved.startsWith(tempDir)) {
			throw new IllegalStateException("NorthwindFixture must generate into the JVM temp directory (" + tempDir
					+ ") so it can never touch the packaged sample database. Got: " + resolved);
		}
		if (resolved.toString().replace(File.separatorChar, '/').contains("/db-template/")) {
			throw new IllegalStateException(
					"NorthwindFixture resolved into the product's db-template tree, which is what it exists to "
							+ "avoid. Got: " + resolved);
		}
	}

	private static void build() throws Exception {
		if (canonicalDuckDb != null) {
			return;
		}

		tempRoot = Files.createTempDirectory("northwind-fixture-");
		assertIsolatedFromProduct(tempRoot);

		// The folder NAMES matter: DuckDBDataWarehouseCreator is handed the DuckDB
		// directory and finds its SQLite source at
		// <parent>/sample-northwind-sqlite/northwind.db - the same sibling layout the
		// packager and the installed product both use.
		Path buildSqliteDir = tempRoot.resolve("build").resolve("sample-northwind-sqlite");
		Path buildDuckDbDir = tempRoot.resolve("build").resolve("sample-northwind-duckdb");
		Files.createDirectories(buildSqliteDir);
		Files.createDirectories(buildDuckDbDir);

		try (NorthwindManager manager = new NorthwindManager()) {
			manager.startDatabase(NorthwindManager.DatabaseVendor.SQLITE, buildSqliteDir.toString());
			manager.startDatabase(NorthwindManager.DatabaseVendor.DUCKDB, buildDuckDbDir.toString());
		}

		// Copy the freshly built files aside before anyone opens them read-only.
		// The generator held read-write connections; DuckDB caches its instance per
		// file within a JVM, and a cached read-write instance would make the first
		// read-only open fail. Handing out a file nothing has opened yet avoids
		// depending on how promptly that cache is released.
		Path canonicalDir = tempRoot.resolve("canonical");
		Files.createDirectories(canonicalDir);

		Path builtDuckDb = buildDuckDbDir.resolve("northwind.duckdb");
		Path builtSqlite = buildSqliteDir.resolve("northwind.db");
		if (!Files.exists(builtDuckDb)) {
			throw new IllegalStateException("Northwind fixture generation produced no DuckDB file at " + builtDuckDb);
		}

		canonicalSqlite = canonicalDir.resolve("northwind.db");
		Files.copy(builtSqlite, canonicalSqlite, StandardCopyOption.REPLACE_EXISTING);

		Path duckDb = canonicalDir.resolve("northwind.duckdb");
		Files.copy(builtDuckDb, duckDb, StandardCopyOption.REPLACE_EXISTING);
		canonicalDuckDb = duckDb;

		Runtime.getRuntime().addShutdownHook(new Thread(NorthwindFixture::deleteTempRoot));
	}

	private static void deleteTempRoot() {
		if (tempRoot == null || !Files.exists(tempRoot)) {
			return;
		}
		try (java.util.stream.Stream<Path> paths = Files.walk(tempRoot)) {
			paths.sorted(Comparator.reverseOrder()).forEach(path -> {
				try {
					Files.deleteIfExists(path);
				} catch (Exception ignored) {
					// A leftover temp directory is not worth failing a build over.
				}
			});
		} catch (Exception ignored) {
			// Same.
		}
	}
}
