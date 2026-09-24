package com.flowkraft.iam;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.flowkraft.common.AppPaths;

/**
 * What happens to a store that was written by an older DataPallas.
 *
 * <p>There is no migration mechanism on purpose: every table is created idempotently at boot. That
 * only holds if booting against an existing file really does add what is missing and really does leave
 * what is there alone — which is what this test checks, by building a store with the pre-groups schema
 * by hand and then starting {@link IamDatabase} on it.
 */
class IamDatabaseUpgradeTest {

	private static final String TEST_ROOT = "./target/test-output/iam-database-upgrade-test";

	private String previousPortableDir;
	private Path root;
	private IamDatabase database;

	@BeforeEach
	void setUp() throws Exception {
		root = new File(TEST_ROOT).getCanonicalFile().toPath();
		FileUtils.deleteDirectory(root.toFile());
		Files.createDirectories(root);

		previousPortableDir = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();
	}

	@AfterEach
	void tearDown() {
		if (database != null)
			database.close();
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = previousPortableDir;
	}

	@Test
	void theGroupTablesAreAddedToAStoreThatLacksThem() throws Exception {
		Path dbPath = writeOldStoreWithOneUser();

		database = new IamDatabase();
		database.init();

		assertTrue(tableExists("user_group"), "user_group should have been created");
		assertTrue(tableExists("user_group_member"), "user_group_member should have been created");
		assertTrue(indexExists("idx_user_group_member_user"), "the membership index should have been created");
		// The old tables are still the old tables, not recreated ones.
		assertTrue(tableExists("app_user") && tableExists("tenant") && tableExists("membership"));
		assertTrue(Files.exists(dbPath));
	}

	@Test
	void theExistingUserSurvives() throws Exception {
		writeOldStoreWithOneUser();

		database = new IamDatabase();
		database.init();

		try (Connection conn = database.getConnection(); Statement st = conn.createStatement()) {
			ResultSet rs = st.executeQuery("SELECT username, role FROM app_user "
					+ "JOIN membership ON membership.user_id = app_user.id");
			assertTrue(rs.next(), "the user written by the older version should still be there");
			assertEquals("olduser", rs.getString(1));
			assertEquals("REPORT_AUTHOR", rs.getString(2));
		}
	}

	/**
	 * An upgraded store keeps the version row it already had. Nothing reads it to migrate — it is a
	 * record of which release first wrote the file — so rewriting it would lose information and gain
	 * none, and {@code stampSchemaVersion} deliberately only writes into an empty table.
	 */
	@Test
	void anUpgradedStoreKeepsItsOriginalVersionRow() throws Exception {
		writeOldStoreWithOneUser();

		database = new IamDatabase();
		database.init();

		try (Connection conn = database.getConnection(); Statement st = conn.createStatement()) {
			ResultSet rs = st.executeQuery("SELECT COUNT(*), MIN(version) FROM schema_version");
			rs.next();
			assertEquals(1, rs.getInt(1), "the version row should not have been duplicated");
			assertEquals(1, rs.getInt(2));
		}
	}

	@Test
	void aFreshStoreIsStampedWithTheCurrentVersion() throws Exception {
		database = new IamDatabase();
		database.init();

		try (Connection conn = database.getConnection(); Statement st = conn.createStatement()) {
			ResultSet rs = st.executeQuery("SELECT version FROM schema_version");
			rs.next();
			assertEquals(IamDatabase.SCHEMA_VERSION, rs.getInt(1));
		}
	}

	@Test
	void bootingTwiceChangesNothing() throws Exception {
		database = new IamDatabase();
		database.init();
		database.close();

		database = new IamDatabase();
		database.init();

		assertTrue(tableExists("user_group"));
		try (Connection conn = database.getConnection(); Statement st = conn.createStatement()) {
			ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM schema_version");
			rs.next();
			assertEquals(1, rs.getInt(1));
		}
	}

	/**
	 * A store written before locked parameters existed has a {@code share_token} table without the
	 * column. Booting has to add it in place: the links that installation already handed out are live
	 * URLs in other people's inboxes, and recreating the table would break every one of them.
	 */
	@Test
	void theLockedParamsColumnIsAddedToAShareTokenTableThatLacksIt() throws Exception {

		Path dbPath = writeOldStoreWithOneUser();

		try (Connection conn = DriverManager.getConnection("jdbc:sqlite:" + dbPath.toString().replace("\\", "/"));
				Statement st = conn.createStatement()) {
			st.execute("CREATE TABLE share_token (id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id INTEGER NOT NULL, "
					+ "resource_type TEXT NOT NULL, resource_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, "
					+ "expires_at TEXT, created_at TEXT NOT NULL)");
			st.execute("INSERT INTO share_token (tenant_id, resource_type, resource_id, token_hash, created_at) "
					+ "VALUES (1, 'report', 'sales-summary', 'some-hash', datetime('now'))");
		}

		database = new IamDatabase();
		database.init();

		try (Connection conn = database.getConnection(); Statement st = conn.createStatement()) {
			ResultSet rs = st.executeQuery("SELECT resource_id, locked_params FROM share_token");
			assertTrue(rs.next(), "the link created by the older version should still be there");
			assertEquals("sales-summary", rs.getString("resource_id"));
			assertNull(rs.getString("locked_params"), "an older link locks nothing");
		}
	}

	/** The schema as it stood before this plan, with one user in one tenant. */
	private Path writeOldStoreWithOneUser() throws Exception {
		Path dbPath = root.resolve("config").resolve("_internal").resolve("iam.db");
		Files.createDirectories(dbPath.getParent());

		try (Connection conn = DriverManager.getConnection("jdbc:sqlite:" + dbPath.toString().replace("\\", "/"));
				Statement st = conn.createStatement()) {

			st.execute("CREATE TABLE schema_version (version INTEGER NOT NULL, applied_at TEXT NOT NULL)");
			st.execute("CREATE TABLE tenant (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, "
					+ "display_name TEXT NOT NULL, home_dir TEXT NOT NULL, customer_ref TEXT, "
					+ "status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL)");
			st.execute("CREATE TABLE app_user (id INTEGER PRIMARY KEY AUTOINCREMENT, "
					+ "username TEXT NOT NULL UNIQUE COLLATE NOCASE, email TEXT, password_hash TEXT, "
					+ "status TEXT NOT NULL DEFAULT 'ACTIVE', platform_admin INTEGER NOT NULL DEFAULT 0, "
					+ "created_at TEXT NOT NULL)");
			st.execute("CREATE TABLE membership (user_id INTEGER NOT NULL REFERENCES app_user(id) ON DELETE CASCADE, "
					+ "tenant_id INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE, role TEXT NOT NULL, "
					+ "PRIMARY KEY (user_id, tenant_id))");

			st.execute("INSERT INTO schema_version (version, applied_at) VALUES (1, datetime('now'))");
			st.execute("INSERT INTO tenant (code, display_name, home_dir, created_at) "
					+ "VALUES ('default', 'Default', '.', datetime('now'))");
			st.execute("INSERT INTO app_user (username, created_at) VALUES ('olduser', datetime('now'))");
			st.execute("INSERT INTO membership (user_id, tenant_id, role) VALUES (1, 1, 'REPORT_AUTHOR')");
		}
		return dbPath;
	}

	private boolean tableExists(String name) throws Exception {
		return existsInSqliteMaster("table", name);
	}

	private boolean indexExists(String name) throws Exception {
		return existsInSqliteMaster("index", name);
	}

	private boolean existsInSqliteMaster(String type, String name) throws Exception {
		try (Connection conn = database.getConnection(); Statement st = conn.createStatement()) {
			ResultSet rs = st.executeQuery(
					"SELECT COUNT(*) FROM sqlite_master WHERE type = '" + type + "' AND name = '" + name + "'");
			rs.next();
			return rs.getInt(1) == 1;
		}
	}
}
