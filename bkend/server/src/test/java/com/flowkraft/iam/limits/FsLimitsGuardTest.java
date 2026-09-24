package com.flowkraft.iam.limits;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * The filesystem guard, as a pure path check.
 *
 * <p>Every {@code /api/system/fs/*} endpoint is REPORT_AUTHOR and confined to the installation
 * directory — and the installation directory is where a limited author's own limits live. These
 * tests are the rules of {@link FsLimitsGuard} read back one by one: what a limited author may not
 * reach, in each of the shapes a path arrives in (relative, absolute, backslashed, with
 * {@code ..} in it, in the wrong case), and the everyday paths that must keep working.
 *
 * <p>No Spring context and no database: the guard's only collaborator is {@link LimitsService},
 * which is mocked, so what is under test here is the path arithmetic and nothing else.
 */
public class FsLimitsGuardTest {

	private static final String PORTABLE_EXECUTABLE_DIR = "PORTABLE_EXECUTABLE_DIR";

	/** A file-based connection in the author's groups. */
	private static final String ALLOWED_CONNECTION = "db-sales";
	/** A file-based connection their groups do not name. */
	private static final String BLOCKED_CONNECTION = "db-hr";

	private String previousPortableDir;
	private Path installation;

	private LimitsService limitsService;
	private FsLimitsGuard guard;

	@BeforeEach
	public void setUp() throws Exception {

		installation = Paths.get("./target/test-output/fs-limits-guard-test").toAbsolutePath().normalize();
		Files.createDirectories(installation);

		previousPortableDir = System.getProperty(PORTABLE_EXECUTABLE_DIR);
		System.setProperty(PORTABLE_EXECUTABLE_DIR, installation.toString());

		limitsService = mock(LimitsService.class);
		// A limited author whose groups still allow scripts: rules 1 to 3 on their own.
		when(limitsService.isLimited()).thenReturn(true);
		when(limitsService.allowsScripts()).thenReturn(true);

		// Two file-based connections, the way the Connections screen would report them: one the
		// author may use, one they may not.
		when(limitsService.allowsConnection(ALLOWED_CONNECTION)).thenReturn(true);
		when(limitsService.allowsConnection(BLOCKED_CONNECTION)).thenReturn(false);

		guard = new FsLimitsGuard(limitsService,
				() -> List.of(new DatabaseFileCatalog.DatabaseFile(ALLOWED_CONNECTION, "db/sales/sales.db"),
						new DatabaseFileCatalog.DatabaseFile(BLOCKED_CONNECTION,
								installation.resolve("db/hr/hr.db").toString())));
	}

	@AfterEach
	public void tearDown() {
		if (previousPortableDir == null)
			System.clearProperty(PORTABLE_EXECUTABLE_DIR);
		else
			System.setProperty(PORTABLE_EXECUTABLE_DIR, previousPortableDir);
	}

	// ============================================================
	// rule 1: nothing at all under config/_internal/
	// ============================================================

	@Test
	@DisplayName("Reading the IAM database is refused, and the refusal names the path")
	public void readingTheIamDatabaseIsRefused() {

		FileAccessNotAllowedException refused = assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkAccess("config/_internal/iam.db"));

		assertTrue(refused.getReason().contains("config/_internal/iam.db"), refused.getReason());
	}

	@Test
	@DisplayName("Reading the API key is refused — it is the key that carries ROLE_ADMIN")
	public void readingTheApiKeyIsRefused() {
		assertThrows(FileAccessNotAllowedException.class, () -> guard.checkAccess("config/_internal/api-key.txt"));
	}

	@Test
	@DisplayName("Writing and deleting under config/_internal/ are refused too")
	public void writingUnderConfigInternalIsRefused() {
		assertThrows(FileAccessNotAllowedException.class, () -> guard.checkWrite("config/_internal/iam.db"));
	}

	@Test
	@DisplayName("A path that climbs back in with .. is the same path")
	public void climbingBackInWithDotDotIsRefused() {
		assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkAccess("config/reports/rpt-sales/../../_internal/iam.db"));
	}

	@Test
	@DisplayName("Backslashes are separators, not part of a name")
	public void backslashesAreRefusedToo() {
		assertThrows(FileAccessNotAllowedException.class, () -> guard.checkAccess("config\\_internal\\iam.db"));
	}

	@Test
	@DisplayName("The absolute path the frontend round-trips is the same path")
	public void theAbsolutePathIsRefusedToo() {
		assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkAccess(installation.resolve("config/_internal/iam.db").toString()));
	}

	@Test
	@DisplayName("Windows and macOS do not care about case, so neither does the rule")
	public void theRuleIsCaseInsensitive() {
		assertThrows(FileAccessNotAllowedException.class, () -> guard.checkAccess("CONFIG/_Internal/iam.db"));
	}

	// ============================================================
	// rule 2: nothing at all under config/connections/
	// ============================================================

	@Test
	@DisplayName("Writing a connection file is refused — that is a connection created by hand")
	public void writingAConnectionFileIsRefused() {
		assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkWrite("config/connections/db-hr/db-hr.xml"));
	}

	@Test
	@DisplayName("Copying a blocked connection's file over an allowed one is refused at both ends")
	public void copyingAConnectionFileIsRefused() {

		assertThrows(FileAccessNotAllowedException.class, () -> guard
				.checkCopyOrMove("config/connections/db-hr/db-hr.xml", "config/connections/db-sales/db-sales.xml"));

		// …and out of the folder as well: a copy is a copy of the credentials.
		assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkCopyOrMove("config/connections/db-hr/db-hr.xml", "temp/db-hr.xml"));
	}

	@Test
	@DisplayName("Reading a connection file is refused too — the folder is closed, not just locked")
	public void readingAConnectionFileIsRefused() {

		assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkAccess("config/connections/db-hr/db-hr.xml"));

		// The sidecars beside it are the same connection under another name: its information schema,
		// its ER diagram, its glossary. Hiding the connection and serving these would be no rule.
		assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkAccess("config/connections/db-hr/metadata/information-schema.json"));
	}

	@Test
	@DisplayName("Listing the connections folder is refused, whatever shape the path arrives in")
	public void listingTheConnectionsFolderIsRefused() {

		assertThrows(FileAccessNotAllowedException.class, () -> guard.checkAccess("config/connections"));
		assertThrows(FileAccessNotAllowedException.class, () -> guard.checkAccess("CONFIG\\Connections\\db-hr"));
		assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkAccess("config/reports/rpt-sales/../../connections/db-hr/db-hr.xml"));
		assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkAccess(installation.resolve("config/connections/db-hr/db-hr.xml").toString()));
	}

	// ============================================================
	// rule 3: no write to a reporting.xml or to a .properties under config/
	// ============================================================

	@Test
	@DisplayName("Writing a report's reporting.xml is refused — it carries the connection code")
	public void writingReportingXmlIsRefused() {
		assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkWrite("config/reports/rpt-sales/reporting.xml"));
	}

	@Test
	@DisplayName("Writing the Jasper datasource.properties is refused")
	public void writingAPropertiesFileUnderConfigIsRefused() {
		assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkWrite("config/reports-jasper/datasource.properties"));
	}

	@Test
	@DisplayName("A .properties file outside config/ is not this rule's business")
	public void aPropertiesFileOutsideConfigIsAllowed() {
		assertDoesNotThrow(() -> guard.checkWrite("temp/notes.properties"));
	}

	@Test
	@DisplayName("Reading a reporting.xml stays allowed: the rule is about changing it")
	public void readingReportingXmlIsAllowed() {
		assertDoesNotThrow(() -> guard.checkAccess("config/reports/rpt-sales/reporting.xml"));
	}

	// ============================================================
	// rule 4: with scripts false, no server code written, copied or moved
	// ============================================================

	@Test
	@DisplayName("With scripts allowed, a Groovy script and a Jasper template are ordinary files")
	public void serverCodeIsOrdinaryWhenScriptsAreAllowed() {
		assertDoesNotThrow(() -> guard.checkWrite("config/reports/rpt-sales/scripts/burst/script.groovy"));
		assertDoesNotThrow(() -> guard.checkWrite("config/reports/rpt-sales/template.jrxml"));
	}

	@Test
	@DisplayName("With scripts false, writing a .groovy, a .jrxml or anything under scripts/ is refused")
	public void serverCodeIsRefusedWhenScriptsAreNot() {

		when(limitsService.allowsScripts()).thenReturn(false);

		assertThrows(ScriptsNotAllowedException.class, () -> guard.checkWrite("temp/anywhere.groovy"));
		assertThrows(ScriptsNotAllowedException.class, () -> guard.checkWrite("temp/anywhere.jrxml"));
		assertThrows(ScriptsNotAllowedException.class,
				() -> guard.checkWrite("config/reports/rpt-sales/scripts/burst/anything.txt"));
	}

	@Test
	@DisplayName("With scripts false, server code cannot be copied in from somewhere else either")
	public void serverCodeCannotBeCopiedWhenScriptsAreNot() {

		when(limitsService.allowsScripts()).thenReturn(false);

		assertThrows(ScriptsNotAllowedException.class,
				() -> guard.checkCopyOrMove("temp/uploaded.groovy", "temp/ordinary.txt"));
	}

	@Test
	@DisplayName("With scripts false, reading a report is still reading a report")
	public void readingStaysAllowedWhenScriptsAreNot() {

		when(limitsService.allowsScripts()).thenReturn(false);

		assertDoesNotThrow(() -> guard.checkAccess("config/reports/rpt-sales/scripts/burst/script.groovy"));
	}

	// ============================================================
	// rule 5: never the compose file or an .env beside it
	// ============================================================

	@Test
	@DisplayName("The compose file that names and credentials every shipped database is refused")
	public void theComposeFileIsRefused() {

		FileAccessNotAllowedException refused = assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkAccess("db/docker-compose.yml"));

		assertTrue(refused.getReason().contains("docker-compose.yml"), refused.getReason());

		assertThrows(FileAccessNotAllowedException.class, () -> guard.checkAccess("db/docker-compose.override.yaml"));
		assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkAccess(installation.resolve("db/DOCKER-COMPOSE.YML").toString()));
	}

	@Test
	@DisplayName("An .env file is refused wherever it sits — it is the passwords, in plain text")
	public void anEnvFileIsRefused() {

		assertThrows(FileAccessNotAllowedException.class, () -> guard.checkAccess("db/.env"));
		assertThrows(FileAccessNotAllowedException.class, () -> guard.checkAccess("db\\.env.local"));
		assertThrows(FileAccessNotAllowedException.class, () -> guard.checkWrite("temp/postgres.env"));
	}

	@Test
	@DisplayName("A plain YAML file is not the compose file")
	public void anOrdinaryYamlFileIsAllowed() {
		assertDoesNotThrow(() -> guard.checkAccess("db/seed/northwind.yml"));
	}

	// ============================================================
	// rule 6: a database file only through a connection they may use
	// ============================================================

	@Test
	@DisplayName("The database file of a connection they may not use is refused — the file is the connection")
	public void theDatabaseFileOfABlockedConnectionIsRefused() {

		FileAccessNotAllowedException refused = assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkAccess("db/hr/hr.db"));

		assertTrue(refused.getReason().contains("hr.db"), refused.getReason());

		// The shapes the same file arrives in, and the write that is a download backwards.
		assertThrows(FileAccessNotAllowedException.class, () -> guard.checkAccess("db\\HR\\HR.DB"));
		assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkAccess(installation.resolve("db/hr/hr.db").toString()));
		assertThrows(FileAccessNotAllowedException.class,
				() -> guard.checkCopyOrMove("db/hr/hr.db", "temp/mine.db"));
	}

	@Test
	@DisplayName("The database file of a connection they may use stays open")
	public void theDatabaseFileOfAnAllowedConnectionIsServed() {

		assertDoesNotThrow(() -> guard.checkAccess("db/sales/sales.db"));
		assertDoesNotThrow(() -> guard.checkAccess(installation.resolve("db/sales/sales.db").toString()));
		assertDoesNotThrow(() -> guard.checkWrite("db/sales/sales.db"));
	}

	@Test
	@DisplayName("A database file no connection declares is refused as well")
	public void aDatabaseFileNobodyDeclaresIsRefused() {

		assertThrows(FileAccessNotAllowedException.class, () -> guard.checkAccess("db/dropped/leftover.sqlite"));
		assertThrows(FileAccessNotAllowedException.class, () -> guard.checkAccess("temp/export.duckdb"));
		assertThrows(FileAccessNotAllowedException.class, () -> guard.checkAccess("db/old/archive.sqlite3"));
	}

	@Test
	@DisplayName("An empty catalog refuses every database file rather than serving one by accident")
	public void anUnreadableCatalogFailsClosed() {

		FsLimitsGuard blind = new FsLimitsGuard(limitsService, List::of);

		assertThrows(FileAccessNotAllowedException.class, () -> blind.checkAccess("db/sales/sales.db"));
	}

	@Test
	@DisplayName("A file that is not a database is not this rule's business")
	public void anOrdinaryFileUnderDbIsAllowed() {

		assertDoesNotThrow(() -> guard.checkAccess("db/sales/export.csv"));
		assertDoesNotThrow(() -> guard.checkAccess("db/README.md"));
	}

	// ============================================================
	// everyday paths, and everybody else
	// ============================================================

	@Test
	@DisplayName("A report's own files are untouched by every one of the rules")
	public void aReportsOwnFilesStayAllowed() {

		assertDoesNotThrow(() -> guard.checkAccess("config/reports/rpt-sales/settings.xml"));
		assertDoesNotThrow(() -> guard.checkWrite("config/reports/rpt-sales/template.html"));
		assertDoesNotThrow(() -> guard.checkCopyOrMove("config/reports/rpt-sales/template.html",
				"config/reports/rpt-other/template.html"));
	}

	@Test
	@DisplayName("An unlimited author keeps today's exact code path")
	public void anUnlimitedAuthorIsNeverRefused() {

		when(limitsService.isLimited()).thenReturn(false);

		assertDoesNotThrow(() -> guard.checkAccess("config/_internal/api-key.txt"));
		assertDoesNotThrow(() -> guard.checkWrite("config/_internal/iam.db"));
		assertDoesNotThrow(() -> guard.checkWrite("config/connections/db-hr/db-hr.xml"));
		assertDoesNotThrow(() -> guard.checkAccess("config/connections/db-hr/db-hr.xml"));
		assertDoesNotThrow(() -> guard.checkWrite("config/reports/rpt-sales/reporting.xml"));
		assertDoesNotThrow(() -> guard.checkAccess("db/docker-compose.yml"));
		assertDoesNotThrow(() -> guard.checkAccess("db/hr/hr.db"));
	}

	@Test
	@DisplayName("A blank path is nobody's business here: the endpoint refuses it first")
	public void aBlankPathIsNotThisGuardsBusiness() {
		assertDoesNotThrow(() -> guard.checkAccess(""));
		assertDoesNotThrow(() -> guard.checkWrite(null));
	}
}
