package com.flowkraft.iam;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Optional;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import com.flowkraft.common.AppPaths;

/**
 * What one viewer chose to see is kept for that viewer alone.
 *
 * <p>
 * This is the small store behind "my view" (W5): a row per owner, per tenant, per key. The tests
 * below are about the store itself — who can read a row back, who cannot, and what happens to the
 * rows when the person they belong to is deleted. What may go <em>into</em> a row, and how a saved
 * view is cleaned when the cube changes underneath it, is checked in {@code CubeRuntimeServiceTest}.
 *
 * <p>
 * No SQL here is vendor-shaped: the store is the installation's own SQLite database, not a
 * customer's warehouse, so THE RULE about ANSI SQL and the dialect layer does not reach it.
 */
class UserSettingsRepositoryTest {

	@TempDir
	Path root;

	private String pathBefore;
	private IamDatabase database;
	private IamRepository repository;
	private UserSettingsRepository settings;

	@BeforeEach
	void openAnEmptyInstallation() throws Exception {

		pathBefore = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();

		database = new IamDatabase();
		database.init();
		repository = new IamRepository(database);
		settings = new UserSettingsRepository(database);
	}

	@AfterEach
	void closeIt() {

		if (database != null)
			database.close();
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = pathBefore;
	}

	/** Saved, read back, saved again over the top, and finally thrown away. */
	@Test
	void aSettingIsSavedReadBackReplacedAndDeleted() {

		String key = UserSettingsRepository.cubeViewKey("sales-board", "cube1");

		assertEquals(Optional.empty(), settings.find("user:1", "default", key), "Nothing saved yet");

		settings.upsert("user:1", "default", key, "{\"v\":1}");
		assertEquals(Optional.of("{\"v\":1}"), settings.find("user:1", "default", key));

		settings.upsert("user:1", "default", key, "{\"v\":1,\"collapsed\":true}");
		assertEquals(Optional.of("{\"v\":1,\"collapsed\":true}"), settings.find("user:1", "default", key),
				"One row per owner and key, replaced in place rather than piling up");

		assertTrue(settings.delete("user:1", "default", key));
		assertEquals(Optional.empty(), settings.find("user:1", "default", key));
		assertFalse(settings.delete("user:1", "default", key), "Deleting what is no longer there says so");
	}

	/**
	 * The three parts of the key are all three parts of the key: another person, another tenant of
	 * the same person, and another widget are each a row of their own.
	 */
	@Test
	void ownerTenantAndKeyEachKeepTheirRowsApart() {

		String cube1 = UserSettingsRepository.cubeViewKey("sales-board", "cube1");
		String cube2 = UserSettingsRepository.cubeViewKey("sales-board", "cube2");

		settings.upsert("user:1", "acme", cube1, "\"anna at acme\"");
		settings.upsert("user:2", "acme", cube1, "\"boris at acme\"");
		settings.upsert("user:1", "globex", cube1, "\"anna at globex\"");
		settings.upsert("user:1", "acme", cube2, "\"anna's other widget\"");

		assertEquals(Optional.of("\"anna at acme\""), settings.find("user:1", "acme", cube1));
		assertEquals(Optional.of("\"boris at acme\""), settings.find("user:2", "acme", cube1));
		assertEquals(Optional.of("\"anna at globex\""), settings.find("user:1", "globex", cube1));
		assertEquals(Optional.of("\"anna's other widget\""), settings.find("user:1", "acme", cube2));

		assertEquals(Optional.empty(), settings.find("user:3", "acme", cube1), "Somebody with nothing saved");
	}

	/** Two dashboards may both call a widget "cube1": the report the widget is on is in the key. */
	@Test
	void twoDashboardsMayBothNameAWidgetTheSameWay() {

		settings.upsert("user:1", "", UserSettingsRepository.cubeViewKey("sales-board", "cube1"), "\"sales\"");
		settings.upsert("user:1", "", UserSettingsRepository.cubeViewKey("stock-board", "cube1"), "\"stock\"");

		assertEquals(Optional.of("\"sales\""),
				settings.find("user:1", "", UserSettingsRepository.cubeViewKey("sales-board", "cube1")));
		assertEquals(Optional.of("\"stock\""),
				settings.find("user:1", "", UserSettingsRepository.cubeViewKey("stock-board", "cube1")));
	}

	/**
	 * A person who is deleted leaves nothing behind. The next person to be given that user id — ids
	 * are handed out again by SQLite once the highest row is gone — must not open a dashboard and
	 * find somebody else's filters on it.
	 */
	@Test
	void deletingAPersonTakesTheirSavedViewsWithThem() {

		long anna = repository.insertUser("anna", "anna@example.com", "x", false).id();
		long boris = repository.insertUser("boris", "boris@example.com", "x", false).id();

		String key = UserSettingsRepository.cubeViewKey("sales-board", "cube1");
		settings.upsert(UserSettingsRepository.ownerOfUser(anna), "default", key, "\"anna's view\"");
		settings.upsert(UserSettingsRepository.ownerOfUser(boris), "default", key, "\"boris's view\"");

		repository.deleteUser(anna);

		assertEquals(Optional.empty(), settings.find(UserSettingsRepository.ownerOfUser(anna), "default", key));
		assertEquals(Optional.of("\"boris's view\""),
				settings.find(UserSettingsRepository.ownerOfUser(boris), "default", key),
				"And nobody else's rows went with them");
	}
}
