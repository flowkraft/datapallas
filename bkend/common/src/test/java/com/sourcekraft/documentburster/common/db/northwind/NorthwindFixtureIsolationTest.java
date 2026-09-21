package com.sourcekraft.documentburster.common.db.northwind;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Guards the one property the whole test-database arrangement rests on: the
 * tests get their OWN Northwind DuckDB, and the sample database DataPallas
 * packages is never opened, never mutated, never even looked at.
 *
 * That matters more than it sounds. DuckDB opens files read-write by default
 * and upgrades the storage format in place, one way. The packaged samples are
 * gitignored, so git would not show the damage and could not undo it. A test
 * that quietly pointed at the real file would corrupt the shipped demo and
 * nobody would find out until a customer opened it.
 */
class NorthwindFixtureIsolationTest {

	/** Where the packaged samples live on a developer machine, if they have been built at all. */
	private static final List<Path> PACKAGED_SAMPLES = List.of(
			Paths.get("../../db/sample-northwind-duckdb/northwind.duckdb"),
			Paths.get("../../db/sample-northwind-sqlite/northwind.db"),
			Paths.get("../../asbl/src/main/external-resources/db-template/db/sample-northwind-duckdb/northwind.duckdb"));

	@Test
	void fixtureIsGeneratedInTempAndNotInTheProduct() throws Exception {
		Path duckDb = NorthwindFixture.duckDbFile();

		assertTrue(Files.exists(duckDb), "the fixture should have produced a file");

		Path tempDir = Paths.get(System.getProperty("java.io.tmpdir")).toAbsolutePath().normalize();
		assertTrue(duckDb.toAbsolutePath().normalize().startsWith(tempDir),
				"fixture must live under the JVM temp directory, got " + duckDb);

		String asPosix = duckDb.toAbsolutePath().normalize().toString().replace('\\', '/');
		assertFalse(asPosix.contains("/db-template/"), "fixture must not resolve into the shipped db-template tree");
		assertFalse(asPosix.contains("/asbl/"), "fixture must not resolve into the assembly module");
	}

	@Test
	void generatingTheFixtureLeavesThePackagedSamplesUntouched() throws Exception {
		// Fingerprint whichever packaged samples actually exist on this machine.
		List<String> before = fingerprintPackagedSamples();

		// Force a generation (idempotent - if an earlier test already built it, this
		// still re-checks that nothing since then has moved the packaged files).
		NorthwindFixture.duckDbFile();
		NorthwindFixture.sqliteFile();
		try (Connection connection = NorthwindFixture.readOnly(); Statement statement = connection.createStatement();
				ResultSet rs = statement.executeQuery("SELECT count(*) FROM \"Customers\"")) {
			assertTrue(rs.next());
			assertTrue(rs.getInt(1) > 0, "the fixture should carry data");
		}

		assertEquals(before, fingerprintPackagedSamples(),
				"generating and reading the test fixture must not change any packaged sample database");
	}

	@Test
	void theFixtureRefusesWrites() throws Exception {
		try (Connection connection = NorthwindFixture.readOnly(); Statement statement = connection.createStatement()) {
			assertThrows(Exception.class,
					() -> statement.execute("INSERT INTO \"Customers\" (\"CustomerID\") VALUES ('XXXXX')"),
					"the shared fixture must be read-only so one test cannot corrupt it for the next");
		}
	}

	@Test
	void writableCopiesAreSeparateFiles() throws Exception {
		Path copy = Files.createTempDirectory("northwind-writable-").resolve("copy.duckdb");
		NorthwindFixture.writableCopy(copy);

		assertTrue(Files.exists(copy));
		assertNotNull(NorthwindFixture.duckDbFile());
		assertFalse(copy.toAbsolutePath().normalize().equals(NorthwindFixture.duckDbFile().toAbsolutePath().normalize()),
				"a writable copy must never be the canonical fixture file");
	}

	/** size + last-modified for every packaged sample present; absent files are recorded as absent. */
	private List<String> fingerprintPackagedSamples() throws Exception {
		List<String> fingerprints = new ArrayList<>();
		for (Path sample : PACKAGED_SAMPLES) {
			if (Files.exists(sample)) {
				fingerprints.add(sample + " size=" + Files.size(sample) + " mtime=" + Files.getLastModifiedTime(sample));
			} else {
				fingerprints.add(sample + " absent");
			}
		}
		return fingerprints;
	}
}
