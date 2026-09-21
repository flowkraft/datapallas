package com.sourcekraft.documentburster.engine.jasper;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;

import org.junit.Test;

/**
 * The JasperReports Legacy renderer runs in a container that sees only its mounted
 * folders and has its own "localhost". These are the connection URLs DataPallas hands
 * it, translated so they work from inside the container.
 */
public class JasperLegacyRestRendererTest {

	private static final File REPORT = new File("/opt/DataPallas/config/reports-jasper-legacy/order-book");

	@Test
	public void aSqliteDatabaseUnderDbIsReachedThroughTheMountedDbFolder() {
		assertEquals("jdbc:sqlite:/work/db/sample-northwind-sqlite/northwind.db",
				JasperLegacyRestRenderer.toContainerJdbcUrl(
						"jdbc:sqlite:/opt/DataPallas/db/sample-northwind-sqlite/northwind.db", REPORT));
	}

	@Test
	public void aWindowsPathToTheSameDatabaseIsTranslatedToo() {
		File windowsReport = new File("C:\\DataPallas\\config\\reports-jasper-legacy\\order-book") {
			private static final long serialVersionUID = 1L;

			@Override
			public String getAbsolutePath() {
				return getPath();
			}
		};
		assertEquals("jdbc:sqlite:/work/db/sample-northwind-sqlite/northwind.db",
				JasperLegacyRestRenderer.toContainerJdbcUrl(
						"jdbc:sqlite:C:\\DataPallas\\db\\sample-northwind-sqlite\\northwind.db", windowsReport));
	}

	@Test
	public void aRelativeSqlitePathIsReadAgainstTheInstallation() {
		assertEquals("jdbc:sqlite:/work/db/sample-northwind-sqlite/northwind.db?journal_mode=DELETE",
				JasperLegacyRestRenderer.toContainerJdbcUrl(
						"jdbc:sqlite:db/sample-northwind-sqlite/northwind.db?journal_mode=DELETE", REPORT));
	}

	@Test
	public void aSqliteDatabaseOutsideDbIsRejectedWithAnExplanation() {
		try {
			JasperLegacyRestRenderer.toContainerJdbcUrl("jdbc:sqlite:/home/someone/sales.db", REPORT);
			fail("a file the container cannot see must not be sent to it");
		} catch (IllegalArgumentException expected) {
			assertTrue(expected.getMessage().contains("db/ folder"));
		}
	}

	@Test
	public void aDatabaseDataPallasStartedIsReachedByContainerName() {
		// it publishes 5432 on the host and shares the 'datapallas' network with the renderer, so the
		// renderer dials it directly and no host port - and no host firewall - is in the way (plan §4 F2n)
		assertEquals("jdbc:postgresql://rb-northwind-postgres:5432/northwind",
				JasperLegacyRestRenderer.toRendererReachableUrl("jdbc:postgresql://localhost:5432/northwind",
						(host, port) -> new String[] { "rb-northwind-postgres", "5432" }));
	}

	@Test
	public void aDatabaseOfTheUsersOwnMachineStillGoesThroughTheHostGateway() {
		assertEquals("jdbc:postgresql://host.docker.internal:5432/northwind",
				JasperLegacyRestRenderer.toRendererReachableUrl("jdbc:postgresql://localhost:5432/northwind",
						(host, port) -> new String[] { "host.docker.internal", "5432" }));
	}

	@Test
	public void aDatabaseSomewhereElseIsLeftAlone() {
		assertEquals("jdbc:postgresql://db.example.com:5432/northwind",
				JasperLegacyRestRenderer.toRendererReachableUrl("jdbc:postgresql://db.example.com:5432/northwind",
						(host, port) -> new String[] { "must-not-be-used", "0" }));
	}
}
