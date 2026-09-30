package com.flowkraft.exploredata.export;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Stream;

import org.apache.commons.io.FileUtils;
import org.springframework.test.util.ReflectionTestUtils;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowkraft.common.AppPaths;
import com.flowkraft.cubes.CubesService;
import com.flowkraft.exploredata.ExploreDataService;
import com.flowkraft.exploredata.export.DashboardDemos.Demo;
import com.flowkraft.iam.limits.LimitsSandbox;
import com.flowkraft.iam.limits.LimitsService;
import com.flowkraft.system.services.FileSystemService;
import com.flowkraft.reports.ReportsService;
import com.sourcekraft.documentburster.common.settings.Settings;

/**
 * Publishes a Dashboard Demo the way a person publishes a canvas: through the product's own
 * {@link CanvasExportService}, into a throwaway installation.
 *
 * <p>Nothing here writes a dashboard file itself. The canvas each demo ships is loaded into the
 * canvas store, the exporter is asked to publish it, and what it wrote is read back off disk. So
 * the shipped folders are the product's output and not a second implementation of it: a change in
 * the exporter, in {@link ScriptAssembler} or in {@link DashboardFileGenerator} shows up here as a
 * difference from what is in the tree, which is what {@code DashboardDemosExportParityTest}
 * asserts.
 *
 * <p>One installation for all 25: {@code AppPaths} is a JVM-wide static and
 * {@link ExploreDataService} keeps the canvas store it opened first, so the root is laid down once
 * per JVM and every demo is published into it under its own report id.
 *
 * <p>The two files a demo ships as its inputs - its {@code .canvas.json} and its
 * {@code -stories.json} - are not the exporter's output and are never in what {@link #publish}
 * returns.
 */
final class DashboardDemosExporter {

	/** The system property that lets a run write what it exported into the tree. */
	static final String WRITE = "dd.write";

	private static final String TEST_ROOT = "./target/test-output/dashboard-demos-export";

	/** The settings.xml every report is created from, and the reporting.xml it is overridden with. */
	private static final String SHIPPED_SETTINGS_XML =
			"../reporting/src/main/external-resources/template/config/burst/settings.xml";
	private static final String SHIPPED_REPORTING_XML =
			"../../asbl/src/main/external-resources/db-template/config/_defaults/reporting.xml";
	/** The cubes the three cube-widget demos read; the exporter loads a cube to check its names. */
	private static final String SHIPPED_CUBES =
			"../../asbl/src/main/external-resources/db-template/config/samples-cubes";

	/**
	 * What the API base URL is on a published dashboard: the value {@code CanvasExportService}
	 * itself defaults to, which is the one the dashboards already in {@code config/samples} carry.
	 */
	private static final String API_BASE_URL = "http://localhost:9090/api";

	/**
	 * The two files {@code NoExeAssembler} generates for each sample, so they are the installer's
	 * and not shipped; and the inputs, which are the author's.
	 */
	private static final List<String> NOT_THE_EXPORTERS = List.of("settings.xml", "reporting.xml");

	private static final ObjectMapper JSON = new ObjectMapper();

	private static Path root;
	private static CanvasExportService exporter;
	private static ExploreDataService canvases;

	private DashboardDemosExporter() {
	}

	/**
	 * The throwaway installation, laid down once: the shipped settings and reporting defaults a
	 * report is created from, and the shipped cubes, because a demo with a live cube widget makes
	 * the exporter load that cube to check the names its conditions use.
	 */
	private static synchronized void installation() throws Exception {
		if (exporter != null)
			return;

		root = new File(TEST_ROOT).getCanonicalFile().toPath();
		FileUtils.deleteQuietly(root.toFile());
		Files.createDirectories(root.resolve("config/reports"));
		Files.createDirectories(root.resolve("logs"));
		Files.createDirectories(root.resolve("temp"));

		System.setProperty("PORTABLE_EXECUTABLE_DIR", root.toString());
		AppPaths.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();
		AppPaths.CONFIG_DIR_PATH = root.resolve("config").toString();
		AppPaths.LOGS_DIR_PATH = root.resolve("logs").toString();
		AppPaths.JOBS_DIR_PATH = root.resolve("temp").toString();
		Settings.PORTABLE_EXECUTABLE_DIR_PATH = root.toString();

		FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML),
				root.resolve("config/burst/settings.xml").toFile());
		FileUtils.copyFile(new File(SHIPPED_SETTINGS_XML),
				root.resolve("config/_defaults/settings.xml").toFile());
		FileUtils.copyFile(new File(SHIPPED_REPORTING_XML),
				root.resolve("config/_defaults/reporting.xml").toFile());
		FileUtils.copyDirectory(new File(SHIPPED_CUBES),
				root.resolve("config/samples-cubes").toFile());

		ReportsService reports = new ReportsService();
		ReflectionTestUtils.setField(reports, "fileSystemService", new FileSystemService());

		CubesService cubes = new CubesService();
		ReflectionTestUtils.setField(cubes, "limitsSandbox",
				new LimitsSandbox(new LimitsService(null, null)));

		canvases = new ExploreDataService();

		CanvasExportService export = new CanvasExportService();
		ReflectionTestUtils.setField(export, "reportsService", reports);
		ReflectionTestUtils.setField(export, "dataCanvasService", canvases);
		ReflectionTestUtils.setField(export, "objectMapper", new ObjectMapper());
		ReflectionTestUtils.setField(export, "limitsService", everythingAllowed());
		ReflectionTestUtils.setField(export, "cubesService", cubes);
		ReflectionTestUtils.setField(export, "rbApiBaseUrl", API_BASE_URL);
		exporter = export;
	}

	/**
	 * The author's own limits, and nothing else: which connections and scripts a group may publish
	 * is asserted where it is enforced ({@code ConnectionLimitsEnforcementTest}), and a demo here
	 * is published as the owner of the installation, who is allowed everything.
	 */
	private static LimitsService everythingAllowed() {
		return new LimitsService(null, null) {
			@Override
			public void assertConnectionAllowed(String connectionId) {
			}

			@Override
			public void assertScriptsAllowed(String what) {
			}
		};
	}

	/**
	 * Publishes one demo and returns the files the exporter wrote, by the name they ship under: the
	 * sidecars and the script from {@code config/reports/<id>}, and the template, which the exporter
	 * writes under {@code templates/reports/<id>} and the installer moves back out.
	 *
	 * <p>{@code settings.xml} and {@code reporting.xml} are left out: those two are
	 * {@code NoExeAssembler}'s for every sample in the product (TODO 7), and a sample folder in the
	 * tree holds neither.
	 */
	static Map<String, String> publish(Demo demo) throws Exception {
		installation();

		String reportId = demo.reportId();
		Map<String, Object> canvas = demo.canvas();

		Map<String, Object> created = canvases.createCanvas(new LinkedHashMap<>(Map.of(
				"name", Objects.toString(canvas.get("name"), demo.id()),
				"description", Objects.toString(canvas.get("description"), ""),
				"connectionId", Objects.toString(canvas.get("connection_id"), ""))));
		String canvasId = Objects.toString(created.get("id"), "");

		// The canvas state as the store holds it - one JSON string, which is what
		// GET /api/explorations/{id} hands the Canvas and what the exporter reads back.
		Map<String, Object> state = new LinkedHashMap<>();
		if (canvas.get("state") instanceof Map<?, ?> given)
			for (Map.Entry<?, ?> one : given.entrySet())
				state.put(String.valueOf(one.getKey()), one.getValue());

		Map<String, Object> update = new LinkedHashMap<>();
		update.put("state", JSON.writeValueAsString(state));
		// The slug is the author's, not one made from the name: a demo's report id is g-<id>.
		update.put("exportedReportCode", reportId);
		canvases.updateCanvas(canvasId, update);

		Map<String, Object> published = exporter.export(canvasId);
		if (!Boolean.TRUE.equals(published.get("success")) || !reportId.equals(published.get("reportId")))
			throw new IllegalStateException(reportId + " was published as " + published);

		Map<String, String> files = new LinkedHashMap<>();
		read(root.resolve("config/reports/" + reportId), files);
		read(root.resolve("templates/reports/" + reportId), files);
		if (files.isEmpty())
			throw new IllegalStateException(reportId + " published no file at all");
		return files;
	}

	/** Every file of one directory, by name, in the order a listing reads. */
	private static void read(Path dir, Map<String, String> into) throws Exception {
		if (!Files.isDirectory(dir))
			return;
		List<Path> found = new ArrayList<>();
		try (Stream<Path> listing = Files.list(dir)) {
			listing.filter(Files::isRegularFile).forEach(found::add);
		}
		found.sort(Comparator.comparing(one -> one.getFileName().toString()));
		for (Path one : found) {
			String name = one.getFileName().toString();
			if (NOT_THE_EXPORTERS.contains(name))
				continue;
			into.put(name, Files.readString(one));
		}
	}

	/** Where a demo's folder is in the tree. */
	static Path shippedFolder(Demo demo) {
		return Path.of(DashboardDemos.SAMPLES, demo.reportId());
	}

	/**
	 * The files a demo's folder holds that the exporter wrote: everything but the author's two
	 * inputs. The two the installer generates are not in the tree at all.
	 */
	static Map<String, String> shipped(Demo demo) throws Exception {
		Map<String, String> files = new LinkedHashMap<>();
		read(shippedFolder(demo), files);
		files.remove(demo.reportId() + ".canvas.json");
		files.remove(demo.reportId() + "-stories.json");
		return files;
	}
}
