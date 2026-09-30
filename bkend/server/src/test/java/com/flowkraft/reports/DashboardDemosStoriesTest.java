package com.flowkraft.reports;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.commons.io.FileUtils;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.ResponseEntity;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.ServerApplication;
import com.flowkraft.common.AppPaths;
import com.flowkraft.embed.ShareTokenService;
import com.flowkraft.system.services.FileSystemService;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterSettings;
import com.sourcekraft.documentburster.common.settings.model.ReportingSettings;

/**
 * The stories a dashboard ships travel with its config, and a dashboard that ships none is unchanged.
 *
 * <h2>Why this is a test and not a reading</h2>
 * A story is the only thing about the Dashboard Demos that a reader interacts with: the question is
 * printed, "Show Me" sets the filters, and the numbers that come back are the ones the e2e checks
 * hold. All of that starts with the config answer carrying the file, as a cube's hints come with its
 * metadata. So the file has to arrive whole - the component invents nothing - and it has to arrive
 * only where there is one: every dashboard in the product ships no stories file, and their config
 * answers must not gain a field because this exists.
 *
 * <p>The stories files' own contents - each story naming its demo's parameters, and its
 * {@code check} naming an interaction whose numbers it must show - are checked by this class's other
 * cases, written with the 25 demos (TODO 6). This case is the one the server half of TODO 5j needs,
 * and it installs its own two dashboards so that it says what it proves whatever the shipped samples
 * hold at the time.
 */
/*
 * Its own application context: this test replaces the installation the server runs on, exactly as
 * the journey tests in com.flowkraft.embed do. Their comment has the mechanism.
 */
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
@SpringBootTest(classes = ServerApplication.class, webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class DashboardDemosStoriesTest {

	private static final String TEST_ROOT = "./target/test-output/dashboard-demos-stories";

	private static final String SHIPPED_SETTINGS_XML =
			"../reporting/src/main/external-resources/template/config/burst/settings.xml";
	private static final String SHIPPED_REPORTING_XML =
			"../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml";

	/** A demo with a stories file, shaped as section 8 writes one. */
	private static final String WITH_STORIES = "g-dd-sales-overview";
	/** A dashboard with no stories file: what every dashboard in the product is today. */
	private static final String WITHOUT_STORIES = "g-dashboard";

	/**
	 * The file, written here as the exporter will write it: a list of
	 * {@code {id, question, text, params, check}}, with the date value as the same relative token a
	 * parameter default uses, never a fixed date.
	 */
	private static final String STORIES_JSON = String.join("\n",
			"[",
			"  {",
			"    \"id\": \"last-year\",",
			"    \"question\": \"How did last year close?\",",
			"    \"text\": \"Set Year to last year.\",",
			"    \"params\": { \"year\": \"{{lastYear}}\" },",
			"    \"check\": \"year-last\"",
			"  }",
			"]",
			"");

	private static final ObjectMapper JSON = new ObjectMapper();

	private static Path root;
	private static ReportsService installer;

	static {
		try {
			root = new File(TEST_ROOT).getCanonicalFile().toPath();
			FileUtils.deleteQuietly(root.toFile());
			Files.createDirectories(root.resolve("config/reports"));
			Files.createDirectories(root.resolve("logs"));
			Files.createDirectories(root.resolve("db"));
			Files.createDirectories(root.resolve("quarantine"));
			Files.createDirectories(root.resolve("temp"));

			System.setProperty("PORTABLE_EXECUTABLE_DIR", root.toString());
			AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();
			AppPaths.CONFIG_DIR_PATH = root.resolve("config").toString();
			AppPaths.LOGS_DIR_PATH = root.resolve("logs").toString();
			AppPaths.JOBS_DIR_PATH = root.resolve("temp").toString();
			AppPaths.QUARANTINE_DIR_PATH = root.resolve("quarantine").toString();
			Settings.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();

			installer = new ReportsService();
			ReflectionTestUtils.setField(installer, "fileSystemService", new FileSystemService());

			FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML), root.resolve("config/burst/settings.xml").toFile());
			FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML), root.resolve("config/_defaults/settings.xml").toFile());
			FileUtils.copyFile(new File(SHIPPED_REPORTING_XML), root.resolve("config/_defaults/reporting.xml").toFile());

			writeDashboard(WITH_STORIES);
			Files.writeString(root.resolve("config/reports/" + WITH_STORIES + "/" + WITH_STORIES + "-stories.json"),
					STORIES_JSON);

			writeDashboard(WITHOUT_STORIES);
		} catch (Exception installationFailed) {
			throw new ExceptionInInitializerError(installationFailed);
		}
	}

	@LocalServerPort
	private int port;

	@Autowired
	private TestRestTemplate rest;

	/*
	 * A share link is how a reader of the Gallery reaches a config at all, and the cheapest
	 * credential a test can hold: this case is about the body of the answer, not about who may ask.
	 */
	@Autowired
	private ShareTokenService shareTokenService;

	@Test
	@DisplayName("A demo's config carries its stories file, as it is")
	void theConfigCarriesTheStoriesFile() throws Exception {

		JsonNode config = configOf(WITH_STORIES);

		JsonNode stories = config.get("stories");
		assertNotNull(stories, "the demo's config must carry its stories: " + config.toString());
		// As it is: the whole file, not a shape this code invented from it.
		assertEquals(JSON.readTree(STORIES_JSON), stories);
		assertEquals("last-year", stories.get(0).get("id").asText());
		assertEquals("{{lastYear}}", stories.get(0).get("params").get("year").asText(),
				"a story's date value stays the relative token the file holds");
	}

	@Test
	@DisplayName("A dashboard with no stories file answers exactly as it did before")
	void aDashboardWithoutStoriesIsUnchanged() throws Exception {

		ResponseEntity<String> answer = config(WITHOUT_STORIES);
		assertTrue(answer.getStatusCode().is2xxSuccessful(),
				"this request must be authorised: " + answer.getStatusCode() + " " + answer.getBody());
		assertNotNull(answer.getBody());

		// No field at all, not a null one: the answer is byte for byte the one this dashboard gave
		// before stories existed, which is what every dashboard in the product answers.
		assertFalse(answer.getBody().contains("\"stories\""),
				"a dashboard with no stories file must not gain a field: " + answer.getBody());
		assertFalse(JSON.readTree(answer.getBody()).has("stories"));
		assertEquals(WITHOUT_STORIES, JSON.readTree(answer.getBody()).get("reportCode").asText());
	}

	private JsonNode configOf(String reportId) throws Exception {
		ResponseEntity<String> answer = config(reportId);
		assertTrue(answer.getStatusCode().is2xxSuccessful(),
				"this request must be authorised: " + answer.getStatusCode() + " " + answer.getBody());
		assertNotNull(answer.getBody(), "an empty body is not an answer");
		return JSON.readTree(answer.getBody());
	}

	private ResponseEntity<String> config(String reportId) throws Exception {
		String link = shareTokenService.createShareToken(reportId, null);
		return rest.getForEntity(
				"http://localhost:" + port + "/api/reports/" + reportId + "/config?token=" + link, String.class);
	}

	/** A published dashboard, as far as its config answer is concerned. */
	private static void writeDashboard(String reportId) throws Exception {

		Path reportDir = root.resolve("config/reports/" + reportId);
		Files.createDirectories(reportDir);

		String settingsPath = reportDir.resolve("settings.xml").toString();
		FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML), new File(settingsPath));
		FileUtils.copyFile(new File(SHIPPED_REPORTING_XML), reportDir.resolve("reporting.xml").toFile());

		DocumentBursterSettings settings = installer.loadSettings(settingsPath);
		settings.settings.template = reportId;
		settings.settings.capabilities.reportdistribution = false;
		settings.settings.capabilities.reportgenerationmailmerge = true;
		installer.saveSettings(settings, settingsPath);

		ReportingSettings reporting = installer.loadSettingsReporting(settingsPath);
		reporting.report.template.outputtype = "output.dashboard";
		reporting.report.template.documentpath = "templates/reports/" + reportId + "/" + reportId + "-template.html";
		installer.saveSettingsReporting(reporting, settingsPath);

		Path templateDir = root.resolve("templates/reports/" + reportId);
		Files.createDirectories(templateDir);
		Files.writeString(templateDir.resolve(reportId + "-template.html"), String.join("\n",
				"<div class=\"rb-dashboard-root\" data-report=\"" + reportId + "\">",
				"  <rb-parameters></rb-parameters>",
				"  <rb-tabulator component-id=\"tabulator_rows\"></rb-tabulator>",
				"</div>",
				""));

		// A demo's filters are what a story sets, so the one this test's stories name is declared.
		Files.writeString(reportDir.resolve(reportId + "-report-parameters-spec.groovy"), String.join("\n",
				"reportParameters {",
				"    parameter(id: 'year', type: 'String', label: 'Year') { }",
				"}",
				""));
	}
}
