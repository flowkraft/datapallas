package com.sourcekraft.documentburster.unit.documentation.userguide.howtodo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.Arrays;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.apache.commons.lang.StringUtils;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.junit.Before;
import org.junit.Test;

import com.sourcekraft.documentburster.GlobalContext;
import com.sourcekraft.documentburster.MainProgram;
import com.sourcekraft.documentburster._helpers.DocumentTester;
import com.sourcekraft.documentburster._helpers.ExcelTestUtils;
import com.sourcekraft.documentburster._helpers.PdfTestUtils;
import com.sourcekraft.documentburster._helpers.TestBursterFactory;
import com.sourcekraft.documentburster._helpers.TestsUtils;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.engine.AbstractBurster;
import com.sourcekraft.documentburster.engine.pdf.Merger;
import com.sourcekraft.documentburster.job.CliJob;
import com.sourcekraft.documentburster.unit.further.other.UtilsTest;
import com.sourcekraft.documentburster.variables.Variables;

import picocli.CommandLine;

/**
 * Tests for command-line configuration options using the Picocli command
 * structure Tests real-world usage scenarios for the CLI
 */
public class CommandLineConfigurationTest {

	private static final String MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH = "src/test/resources/input/unit/other/merge-file-Invoicec-Oct-Nov-Dec-bCpvjjzdk1.mf";

	private static final String EXCEL_BURST_BY_DISTINCT_COLUMN_VALUES_COMPLEX = "src/test/resources/input/unit/excel/extra/burst-by-distinct-column-values-complex.xls";
	private static final String USER_VARIABLES_PATH = "src/test/resources/input/unit/pdf/user-variables.pdf";
	private static final String PDF_CUSTOM_SETTINGS_LONG = "src/test/resources/input/unit/pdf/custom-settings-long.pdf";

	private static Settings settings = new Settings(StringUtils.EMPTY);
	private static TestCliJob testJob;
	private static MainProgram program;
	private static AbstractBurster burster;

	/**
	 * Custom CliJob implementation for testing
	 */
	static class TestCliJob extends CliJob {
		public TestCliJob(String configFilePath) {
			super(configFilePath);
		}

		@Override
		public String getTempFolder() {
			return TestsUtils.TESTS_OUTPUT_FOLDER + "/temp/";
		}

		@Override
		protected AbstractBurster getBurster(String filePath) throws Exception {
			String extension = FilenameUtils.getExtension(filePath);

			if (extension.equalsIgnoreCase("pdf"))
				burster = (AbstractBurster) new TestBursterFactory.PdfBurster(configurationFilePath,
						"PicocliCommandLineConfigurationTest");
			else
				burster = (AbstractBurster) new TestBursterFactory.PoiExcelBurster(configurationFilePath,
						"PicocliCommandLineConfigurationTest");

			return burster;
		}

		@Override
		protected Merger getMerger() throws Exception {
			settings.setConfigurationFilePath(configurationFilePath);
			settings.loadSettings();
			settings.setOutputFolder(
					TestsUtils.TESTS_OUTPUT_FOLDER + "/output/CommandLineConfigurationTestValidMergeArguments/");
			return new Merger(settings);
		}
	}

	@Before
	public void setUp() throws Exception {
		// Make sure the timestamp will be different otherwise some asserts will fail
		Thread.sleep(1000);

		// A "temp" folder is required to be available
		FileUtils.forceMkdir(new File(TestsUtils.TESTS_OUTPUT_FOLDER + "/temp"));

		// Create program and setup global context
		program = new MainProgram();
		GlobalContext global = new GlobalContext();
		program.setGlobal(global);

		// Initialize test job with default config
		testJob = new TestCliJob("src/main/external-resources/template/config/burst/settings.xml");
		testJob.setGlobal(global);
	}

	/**
	 * Custom CommandLine factory to inject our test objects
	 */
	private CommandLine.IFactory createTestFactory() {
		return new CommandLine.IFactory() {
			@Override
			public <K> K create(Class<K> cls) throws Exception {
				if (cls == MainProgram.BurstCommand.class) {
					MainProgram.BurstCommand cmd = new MainProgram.BurstCommand() {
						@Override
						protected CliJob getJob(String configFilePath) throws Exception {
							testJob.configurationFilePath = configFilePath != null ? configFilePath
									: "src/main/external-resources/template/config/burst/settings.xml";
							return testJob;
						}
					};
					return cls.cast(cmd);
				} else if (cls == MainProgram.JobCommand.MergeCommand.class) {
					MainProgram.JobCommand.MergeCommand cmd = new MainProgram.JobCommand.MergeCommand() {
						@Override
						protected CliJob getJob(String configFilePath) throws Exception {
							testJob.configurationFilePath = configFilePath != null ? configFilePath
									: "src/main/external-resources/template/config/burst/settings.xml";
							return testJob;
						}
					};
					return cls.cast(cmd);
				}
				return CommandLine.defaultFactory().create(cls);
			}
		};
	}

	/**
	 * Execute command with our test factory
	 */
	private void executeCommand(String[] args) throws Throwable {
		CommandLine cmd = new CommandLine(program, createTestFactory());
		int exitCode = cmd.execute(args);
		assertEquals("Command should execute successfully", 0, exitCode);
	}

	// Test case 1: Merge with custom configuration file
	@Test
	public void mergeWithCustomConfigurationFile() throws Throwable {
		String mergeFilePath = testJob.getTempFolder() + FilenameUtils.getName(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH);
		FileUtils.copyFile(new File(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH), new File(mergeFilePath));

		String[] args = { "job", "merge", mergeFilePath, "--config",
				"src/test/resources/config/settings-custom.xml" };

		executeCommand(args);
		assertMergeResults("merged-custom.pdf");

		// Merge file should be deleted after the merge is finished
		assertFalse(new File(mergeFilePath).exists());

		// But the resource merge file should still be there for the following
		// executions
		assertTrue(new File(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH).exists());
	}

	// Test case 2: Merge with custom config file but output name takes precedence
	@Test
	public void mergeWithConfigAndOutputName() throws Throwable {
		String mergeFilePath = testJob.getTempFolder() + FilenameUtils.getName(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH);
		FileUtils.copyFile(new File(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH), new File(mergeFilePath));

		String[] args = { "job", "merge", mergeFilePath, "--output", "merged.pdf", "--config",
				"src/test/resources/config/settings-custom.xml" };

		executeCommand(args);
		assertMergeResults("merged.pdf");

		// Merge file should be deleted after the merge is finished
		assertFalse(new File(mergeFilePath).exists());

		// But the resource merge file should still be there for the following
		// executions
		assertTrue(new File(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH).exists());
	}

	// Test case 3: Burst with default settings
	@Test
	public void burstWithDefaultSettings() throws Throwable {
		String[] args = { "job", "burst", USER_VARIABLES_PATH };

		executeCommand(args);

		PdfTestUtils.assertDefaultResults(burster, Arrays.asList("page1", "page2", "page3"));
	}

	// Test case 4: Burst with custom configuration
	@Test
	public void burstWithCustomConfiguration() throws Throwable {
		String[] args = { "job", "burst", USER_VARIABLES_PATH, "--config", "src/test/resources/config/settings-custom.xml" };

		executeCommand(args);

		// Assert 3 files have been generated
		String outputFolder = burster.getCtx().outputFolder + "/";
		assertEquals(3, new File(outputFolder).listFiles(UtilsTest.outputFilesFilter).length);

		// Assert for the Custom File Name format (var0-var1.pdf)
		String path = burster.getCtx().outputFolder + "/p1-var0-p1-var1.pdf";
		File outputReport = new File(path);
		assertTrue(outputReport.exists());

		path = burster.getCtx().outputFolder + "/p2-var0-p2-var1.pdf";
		outputReport = new File(path);
		assertTrue(outputReport.exists());

		path = burster.getCtx().outputFolder + "/p3-var0-p3-var1.pdf";
		outputReport = new File(path);
		assertTrue(outputReport.exists());
	}

	// Test case 5: PDF with built-in settings that take precedence
	@Test
	public void pdfWithBuiltInSettingsThatOverrideConfig() throws Throwable {
		String[] args = { "job", "burst", PDF_CUSTOM_SETTINGS_LONG, "--config",
				"src/main/external-resources/template/config/burst/settings.xml" };

		executeCommand(args);

		// Assert only 2 files have been generated
		String outputFolder = burster.getCtx().outputFolder + "/";
		assertEquals(2, new File(outputFolder).listFiles(UtilsTest.outputFilesFilter).length);

		// Assert for the Custom File Name format defined in the PDF
		String path = burster.getCtx().outputFolder + "/John Lehnon-March.pdf";
		File outputReport = new File(path);
		assertTrue(outputReport.exists());

		path = burster.getCtx().outputFolder + "/Paul McCartney-June.pdf";
		outputReport = new File(path);
		assertTrue(outputReport.exists());
	}

	// Test case 6: Excel bursting with built-in settings
	@Test
	public void excelBurstWithBuiltInSettings() throws Throwable {
		String[] args = { "job", "burst", EXCEL_BURST_BY_DISTINCT_COLUMN_VALUES_COMPLEX, "--config",
				"src/main/external-resources/template/config/burst/settings.xml" };

		executeCommand(args);

		// Assert only 2 files have been generated
		String outputFolder = burster.getCtx().outputFolder + "/";
		assertEquals(2, new File(outputFolder).listFiles(UtilsTest.outputFilesFilter).length);

		// Assert output reports for each country
		for (String token : Arrays.asList("Germany", "USA")) {
			String var0 = burster.getCtx().variables.getUserVariables(token).get("var0").toString();
			String var1 = burster.getCtx().variables.getUserVariables(token).get("var1").toString();

			// Assert custom configuration from settings
			// ${var0}-${var1}.${input_document_extension}
			String fileName = var0 + "-" + var1 + ".xls";

			File outputReport = new File(outputFolder + fileName);
			assertTrue("File should exist: " + fileName, outputReport.exists());

			InputStream input = new FileInputStream(outputReport);
			Workbook workBook = WorkbookFactory.create(input);

			// Assert it has a single sheet and it is the correct sheet
			assertEquals(1, workBook.getNumberOfSheets());
			assertNotNull(workBook.getSheet("Customer List"));

			// Assert the data to be correct
			assertTrue(ExcelTestUtils.isWorkbookDataValid(workBook, token));

			input.close();
		}

		// Assert "skip" variable values
		String skip = burster.getCtx().variables.getUserVariables("Germany").get(Variables.SKIP).toString();
		assertFalse(Boolean.valueOf(skip).booleanValue());

		skip = burster.getCtx().variables.getUserVariables("USA").get(Variables.SKIP).toString();
		assertTrue(Boolean.valueOf(skip).booleanValue());
	}

	// Test case 7: Burst with testing all tokens option
	@Test
	public void burstWithTestAllOption() throws Throwable {
		String[] args = { "job", "burst", USER_VARIABLES_PATH, "--testall" };

		executeCommand(args);

		// Should process all 3 tokens
		PdfTestUtils.assertDefaultResults(burster, Arrays.asList("page1", "page2", "page3"));
	}

	// Test case 8: Burst with specific tokens to test
	@Test
	public void burstWithTestListOption() throws Throwable {
		String[] args = { "job", "burst", USER_VARIABLES_PATH, "--testlist=page1,page3" };

		executeCommand(args);

		// Should process only page1 and page3
		String outputFolder = burster.getCtx().outputFolder + "/";
		assertEquals(2, new File(outputFolder).listFiles(UtilsTest.outputFilesFilter).length);

		assertTrue(new File(outputFolder + "/page1.pdf").exists());
		assertFalse(new File(outputFolder + "/page2.pdf").exists());
		assertTrue(new File(outputFolder + "/page3.pdf").exists());
	}

	// Test case 9: Merge and then burst the result
	@Test
	public void mergeAndBurst() throws Throwable {
		String mergeFilePath = testJob.getTempFolder() + FilenameUtils.getName(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH);
		FileUtils.copyFile(new File(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH), new File(mergeFilePath));

		String[] args = { "job", "merge", mergeFilePath, "--output", "merged_for_burst.pdf", "--burst" };

		executeCommand(args);

		// First verify the merged file exists
		assertMergeResults("merged_for_burst.pdf");

		// Merge file should be deleted after the merge is finished
		assertFalse(new File(mergeFilePath).exists());
	}

	/*
	 * HELPER METHODS
	 */

	private void assertMergeResults(String fileName) throws Exception {
		String path = TestsUtils.TESTS_OUTPUT_FOLDER + "/output/CommandLineConfigurationTestValidMergeArguments/"
				+ fileName;

		// Assert output report exists
		File outputReport = new File(path);
		assertTrue("Merged file should exist: " + path, outputReport.exists());

		DocumentTester tester = new DocumentTester(path);

		// Assert number of pages
		tester.assertPageCountEquals(9);

		tester.close();
	}
}