package com.sourcekraft.documentburster.common.settings;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.io.FileInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.junit.jupiter.api.Test;

import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettingsInternal;

import jakarta.xml.bind.JAXBContext;

/**
 * A fresh install hides the sample connections and cubes: the one place the default lives, the
 * db-template's {@code config/_internal/settings.xml}, ships {@code showsamples} false (Virgil,
 * 2026-10-29: a new user should not meet "Showing 1-5 of 24" sample cubes on the first screen).
 *
 * <p>Every package takes it from there, and every e2e spec starts with the samples shown again by
 * its clean state - so this is the test that keeps the shipped value what was decided.
 */
class ShippedShowSamplesDefaultTest {

	@Test
	void theTemplateEveryPackageShipsHidesTheSamples() throws Exception {

		Path shipped = Paths.get(System.getProperty("user.dir")).toAbsolutePath().getParent().getParent()
				.resolve("asbl").resolve("src").resolve("main").resolve("external-resources")
				.resolve("db-template").resolve("config").resolve("_internal").resolve("settings.xml");
		assertEquals(true, Files.isRegularFile(shipped), "the shipped internal settings are here: " + shipped);

		DocumentBursterSettingsInternal settings;
		try (FileInputStream in = new FileInputStream(shipped.toFile())) {
			settings = (DocumentBursterSettingsInternal) JAXBContext.newInstance(DocumentBursterSettingsInternal.class)
					.createUnmarshaller().unmarshal(in);
		}

		assertNotNull(settings.settings, "the file has a <settings> element");
		assertEquals(Boolean.FALSE, settings.settings.showsamples,
				"a fresh install leaves the sample connections and cubes out of their lists");
	}
}
