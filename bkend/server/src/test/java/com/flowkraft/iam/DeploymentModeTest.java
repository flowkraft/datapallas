package com.flowkraft.iam;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.flowkraft.common.AppPaths;

/**
 * Pins down which edition the app believes it is, because getting this wrong in one direction ships a
 * server with no authentication at all.
 *
 * <p>The detection is filesystem-based on purpose — see {@link DeploymentMode#resolve()}. These tests
 * therefore build real directories rather than stubbing a flag.
 */
class DeploymentModeTest {

	private static final String TEST_ROOT = "./target/test-output/deployment-mode-test";

	private String previousPortableDir;
	private String previousRbRole;
	private Path root;

	@BeforeEach
	void setUp() throws Exception {
		root = new File(TEST_ROOT).getCanonicalFile().toPath();
		FileUtils.deleteQuietly(root.toFile());
		Files.createDirectories(root);

		previousPortableDir = AppPaths.PORTABLE_EXECUTABLE_DIR_PATH;
		previousRbRole = System.getProperty("RB_ROLE");
		System.clearProperty("RB_ROLE");

		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();
	}

	@AfterEach
	void tearDown() {
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = previousPortableDir;
		if (previousRbRole != null)
			System.setProperty("RB_ROLE", previousRbRole);
		else
			System.clearProperty("RB_ROLE");
		FileUtils.deleteQuietly(root.toFile());
	}

	/** The desktop package has no launcher scripts — this is the Electron case. */
	@Test
	void anInstallWithoutLauncherScriptsIsDesktop() {

		assertEquals(DeploymentMode.STANDALONE, DeploymentMode.resolve());
		assertFalse(DeploymentMode.resolve().isDataPallasServer());
	}

	/**
	 * The defining case. datapallas-server.zip ships startServer.bat, so a Server install must NOT come
	 * up in desktop mode — that would mean no authentication on a multi-user deployment.
	 */
	@Test
	void anInstallWithStartServerBatIsMultiUser() throws Exception {

		Files.writeString(root.resolve("startServer.bat"), "@echo off");

		assertTrue(DeploymentMode.resolve().isDataPallasServer(),
				"a Server install must never resolve to the desktop shape");
		assertEquals(DeploymentMode.GATEWAY, DeploymentMode.resolve());
	}

	/** Same packaging signal on Linux, which is what the Docker image is built from. */
	@Test
	void anInstallWithStartServerShIsMultiUser() throws Exception {

		Files.writeString(root.resolve("startServer.sh"), "#!/bin/sh");

		assertTrue(DeploymentMode.resolve().isDataPallasServer());
	}

	/** An operator can still force a mode; setting it needs control of the launch, i.e. machine access. */
	@Test
	void anExplicitRoleOverridesDetection() throws Exception {

		Files.writeString(root.resolve("startServer.bat"), "@echo off");
		System.setProperty("RB_ROLE", "standalone");

		assertEquals(DeploymentMode.STANDALONE, DeploymentMode.resolve());
	}

	@Test
	void anExplicitRoleCanAlsoTightenADesktopInstall() {

		System.setProperty("RB_ROLE", "gateway");

		assertEquals(DeploymentMode.GATEWAY, DeploymentMode.resolve());
	}

	/**
	 * A typo must fall through to detection rather than failing the boot or, worse, silently choosing
	 * the desktop shape on a server.
	 */
	@Test
	void anUnrecognisedRoleFallsBackToDetection() throws Exception {

		Files.writeString(root.resolve("startServer.bat"), "@echo off");
		System.setProperty("RB_ROLE", "gatway-typo");

		assertEquals(DeploymentMode.GATEWAY, DeploymentMode.resolve(),
				"a mistyped RB_ROLE must not downgrade a server to the desktop shape");
	}

	@Test
	void theWireNameIsWhatTheFrontendBranchesOn() {
		assertEquals("standalone", DeploymentMode.STANDALONE.wireName());
		assertEquals("gateway", DeploymentMode.GATEWAY.wireName());
		assertEquals("tenant", DeploymentMode.TENANT.wireName());
	}
}
