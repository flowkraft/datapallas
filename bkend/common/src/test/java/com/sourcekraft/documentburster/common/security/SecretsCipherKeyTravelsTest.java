package com.sourcekraft.documentburster.common.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * A saved password survives an upgrade when the desktop updater carries config/_internal/.master-key
 * over (updater.ts, both update modes): the value encrypted in the old installation folder decrypts in
 * the new one with only the key file copied, and not without it.
 */
class SecretsCipherKeyTravelsTest {

	private static final String KEY_FILE = "config/_internal/.master-key";

	@TempDir
	Path temp;

	@AfterEach
	void forgetTheInstallation() {
		SecretsCipher.resetInstance();
	}

	@Test
	void aPasswordEncryptedInOneInstallationDecryptsInTheNextOnceTheKeyFileIsCopied() throws Exception {
		Path oldInstallation = Files.createDirectories(temp.resolve("old/DataPallas"));
		Path newInstallation = Files.createDirectories(temp.resolve("new/DataPallas"));

		String savedPassword = encryptIn(oldInstallation, "the email server password");
		assertTrue(SecretsCipher.isEncrypted(savedPassword));

		Files.createDirectories(newInstallation.resolve(KEY_FILE).getParent());
		Files.copy(oldInstallation.resolve(KEY_FILE), newInstallation.resolve(KEY_FILE));

		assertEquals("the email server password", cipherOf(newInstallation).decrypt(savedPassword));
	}

	@Test
	void withoutTheKeyFileTheNewInstallationMakesItsOwnKeyAndCannotDecrypt() throws Exception {
		Path oldInstallation = Files.createDirectories(temp.resolve("old/DataPallas"));
		Path newInstallation = Files.createDirectories(temp.resolve("new/DataPallas"));

		String savedPassword = encryptIn(oldInstallation, "the email server password");

		SecretsCipher newInstallationsCipher = cipherOf(newInstallation);
		assertTrue(Files.isRegularFile(newInstallation.resolve(KEY_FILE)), "a key of its own, made on first use");
		assertThrows(Exception.class, () -> newInstallationsCipher.decrypt(savedPassword));
	}

	private static String encryptIn(Path installation, String plaintext) throws Exception {
		return cipherOf(installation).encrypt(plaintext);
	}

	private static SecretsCipher cipherOf(Path installation) throws Exception {
		SecretsCipher.resetInstance();
		return SecretsCipher.getInstance(installation.toString());
	}
}
