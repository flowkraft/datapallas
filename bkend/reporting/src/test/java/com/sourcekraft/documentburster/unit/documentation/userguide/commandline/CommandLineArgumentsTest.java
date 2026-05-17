package com.sourcekraft.documentburster.unit.documentation.userguide.commandline;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.io.FileNotFoundException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Iterator;

import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import org.apache.commons.lang3.StringUtils;
import org.junit.After;
import org.junit.BeforeClass;
import org.junit.Test;

import com.sourcekraft.documentburster.GlobalContext;
import com.sourcekraft.documentburster.MainProgram;
import com.sourcekraft.documentburster._helpers.DocumentTester;
import com.sourcekraft.documentburster._helpers.DocumentTester.TextSearchType;
import com.sourcekraft.documentburster._helpers.PdfTestUtils;
import com.sourcekraft.documentburster._helpers.TestBursterFactory;
import com.sourcekraft.documentburster._helpers.TestsUtils;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.engine.AbstractBurster;
import com.sourcekraft.documentburster.engine.pdf.Merger;
import com.sourcekraft.documentburster.job.CliJob;
import com.sourcekraft.documentburster.unit.further.other.UtilsTest;

import picocli.CommandLine;
import picocli.CommandLine.MissingParameterException;
import picocli.CommandLine.MutuallyExclusiveArgsException;
import picocli.CommandLine.ParameterException;

/**
 * Comprehensive tests for the Picocli-based command line interface Testing
 * real-world usage scenarios
 */
public class CommandLineArgumentsTest {

	private static final String MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH = "src/test/resources/input/unit/other/merge-file-Invoicec-Oct-Nov-Dec-bCpvjjzdk1.mf";
	private static final String MERGE_FILE_ONE_FILE_NOT_EXISTING_INVOICES_OCT_NOV_DEC_PATH = "src/test/resources/input/unit/other/merge-file-one-file-not-existing-Invoicec-Oct-Nov-Dec-bCpvjjzdk2.mf";

	private static final String PAYSLIPS_REPORT_PATH = "src/main/external-resources/template/samples/burst/Payslips.pdf";

	private static Settings settings;

	private final static AbstractBurster burster = new TestBursterFactory.PdfBurster(StringUtils.EMPTY,
			"PicocliCommandLineArgumentsTest");

	private static TestCliJob testJob;
	private static MainProgram program;

	/**
	 * Custom CliJob implementation for testing
	 */
	static class TestCliJob extends CliJob {
		public TestCliJob(String configFilePath) {
			super((StringUtils.isNoneEmpty(configFilePath) && Files.exists(Paths.get(configFilePath))) ? configFilePath
					: "src/main/external-resources/template/config/burst/settings.xml");

			settings = new Settings((StringUtils.isNoneEmpty(configFilePath) && Files.exists(Paths.get(configFilePath)))
					? configFilePath
					: "src/main/external-resources/template/config/burst/settings.xml");
		}

		@Override
		public String getTempFolder() {
			return TestsUtils.TESTS_OUTPUT_FOLDER + "/temp/";
		}

		@Override
		protected AbstractBurster getBurster(String filePath) throws Exception {
			return burster;
		}

		@Override
		protected Merger getMerger() throws Exception {
			settings.loadSettings();
			settings.setOutputFolder(TestsUtils.TESTS_OUTPUT_FOLDER + "/output/ValidMergeArguments/");
			settings.setBackupFolder(TestsUtils.TESTS_OUTPUT_FOLDER
					+ "/backup/${input_document_name}/${now?string[\"yyyy.MM.dd_HH.mm.ss.SSS\"]}");
			return new Merger(settings);
		}
	}

	@BeforeClass
	public static void setUp() throws Exception {
		// Create temp folder
		FileUtils.forceMkdir(new File(TestsUtils.TESTS_OUTPUT_FOLDER + "/temp"));

		// Initialize test job
		testJob = new TestCliJob("src/main/external-resources/template/config/burst/settings.xml");

		// Create program and setup mocking
		program = new MainProgram();
		GlobalContext global = new GlobalContext();
		program.setGlobal(global);

		// Initialize burster context
		burster.setGlobal(global);
	}

	@After
	public void sleep() throws Exception {
		Thread.sleep(1000);
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
							return testJob;
						}
					};
					return cls.cast(cmd);
				} else if (cls == MainProgram.GenerateCommand.class) {
					MainProgram.GenerateCommand cmd = new MainProgram.GenerateCommand() {
						@Override
						protected CliJob getJob(String configFilePath) throws Exception {
							return testJob;
						}
					};
					return cls.cast(cmd);
				} else if (cls == MainProgram.ResumeCommand.class) {
					MainProgram.ResumeCommand cmd = new MainProgram.ResumeCommand() {
						@Override
						protected CliJob getJob(String configFilePath) throws Exception {
							return testJob;
						}
					};
					return cls.cast(cmd);
				} else if (cls == MainProgram.JobCommand.MergeCommand.class) {
					MainProgram.JobCommand.MergeCommand cmd = new MainProgram.JobCommand.MergeCommand() {
						@Override
						protected CliJob getJob(String configFilePath) throws Exception {
							return testJob;
						}
					};
					return cls.cast(cmd);
				} else if (cls == MainProgram.SystemCommand.LicenseCommand.ActivateCommand.class) {
					MainProgram.SystemCommand.LicenseCommand.ActivateCommand cmd = new MainProgram.SystemCommand.LicenseCommand.ActivateCommand() {
						@Override
						protected CliJob getJob(String configFilePath) throws Exception {
							return testJob;
						}
					};
					return cls.cast(cmd);
				} else if (cls == MainProgram.SystemCommand.LicenseCommand.DeactivateCommand.class) {
					MainProgram.SystemCommand.LicenseCommand.DeactivateCommand cmd = new MainProgram.SystemCommand.LicenseCommand.DeactivateCommand() {
						@Override
						protected CliJob getJob(String configFilePath) throws Exception {
							return testJob;
						}
					};
					return cls.cast(cmd);
				} else if (cls == MainProgram.SystemCommand.LicenseCommand.CheckCommand.class) {
					MainProgram.SystemCommand.LicenseCommand.CheckCommand cmd = new MainProgram.SystemCommand.LicenseCommand.CheckCommand() {
						@Override
						protected CliJob getJob(String configFilePath) throws Exception {
							return testJob;
						}
					};
					return cls.cast(cmd);
				} else if (cls == MainProgram.SystemCommand.FeatureRequestCommand.class) {
					MainProgram.SystemCommand.FeatureRequestCommand cmd = new MainProgram.SystemCommand.FeatureRequestCommand() {
						@Override
						protected CliJob getJob(String configFilePath) throws Exception {
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

	/*
	 * BURST COMMAND TESTS
	 */

	@Test
	public void validBurstCommand() throws Throwable {
		String[] args = new String[] { "job", "burst", PAYSLIPS_REPORT_PATH };
		executeCommand(args);

		PdfTestUtils.assertDefaultResults(burster, Arrays.asList("alfreda.waldback@northridgehealth.org",
				"clyde.grew@northridgehealth.org", "kyle.butford@northridgehealth.org"));
	}

	@Test(expected = MissingParameterException.class)
	public void missingInputFileBurstCommand() throws Throwable {
		String[] args = new String[] { "job", "burst" };
		CommandLine cmd = new CommandLine(program, createTestFactory());

		// This will throw MissingParameterException because <inputFile> is required
		cmd.parseArgs(args);

		// We shouldn't get here
		fail("Expected exception was not thrown");
	}

	@Test
	public void burstCommandWithTestAllOption() throws Throwable {
		String[] args = new String[] { "job", "burst", PAYSLIPS_REPORT_PATH, "--testall" };
		executeCommand(args);

		PdfTestUtils.assertDefaultResults(burster, Arrays.asList("alfreda.waldback@northridgehealth.org",
				"clyde.grew@northridgehealth.org", "kyle.butford@northridgehealth.org"));

		// Assert no quality-assurance files are generated
		assertEquals(0, new File(burster.getCtx().outputFolder + "/quality-assurance").listFiles().length);
	}

	@Test(expected = IllegalArgumentException.class)
	public void burstCommandWithInvalidTestList() throws Throwable {
		String[] args = new String[] { "job", "burst", PAYSLIPS_REPORT_PATH, "--testlist=aaaa,bbbb,cccc" };

		CommandLine cmd = new CommandLine(program, createTestFactory());
		cmd.parseArgs(args);

		MainProgram.BurstCommand burstCommand = cmd.getSubcommands().get("job").getSubcommands().get("burst").getCommand();

		// Call the command directly - this should throw IllegalArgumentException
		burstCommand.call();
	}

	@Test(expected = ParameterException.class)
	public void burstCommandWithInvalidRandomTestsValue() throws Throwable {
		String[] args = new String[] { "job", "burst", PAYSLIPS_REPORT_PATH, "--testrandom=-2" };
		CommandLine cmd = new CommandLine(program, createTestFactory());

		cmd.parseArgs(args);

		MainProgram.BurstCommand burstCommand = cmd.getSubcommands().get("job").getSubcommands().get("burst").getCommand();

		burstCommand.call();

		fail("Expected exception was not thrown");
	}

	@Test(expected = ParameterException.class)
	public void burstCommandWithNonNumericRandomTestsValue() throws Throwable {
		String[] args = new String[] { "job", "burst", PAYSLIPS_REPORT_PATH, "--testrandom=abc" };
		CommandLine cmd = new CommandLine(program, createTestFactory());

		// This will throw ParameterException because "abc" can't be converted to an
		// Integer
		cmd.parseArgs(args);

		// We shouldn't get here
		fail("Expected exception was not thrown");
	}

	@Test(expected = MutuallyExclusiveArgsException.class)
	public void burstCommandWithMutuallyExclusiveOptions() throws Throwable {
		String[] args = new String[] { "job", "burst", PAYSLIPS_REPORT_PATH,
				"--testlist=clyde.grew@northridgehealth.org,alfreda.waldback@northridgehealth.org", "--testrandom=2" };
		CommandLine cmd = new CommandLine(program, createTestFactory());

		// This will throw MutuallyExclusiveArgsException because the options are
		// mutually exclusive
		cmd.parseArgs(args);
	}

	@Test
	public void burstCommandWithValidTestList() throws Throwable {
		String[] args = new String[] { "job", "burst", PAYSLIPS_REPORT_PATH,
				"--testlist=clyde.grew@northridgehealth.org,alfreda.waldback@northridgehealth.org" };
		executeCommand(args);

		PdfTestUtils.assertDefaultResults(burster,
				Arrays.asList("alfreda.waldback@northridgehealth.org", "clyde.grew@northridgehealth.org"));

		// Assert kyle.butford@northridgehealth.org.pdf file was not generated
		String path = burster.getCtx().outputFolder + "/kyle.butford@northridgehealth.org.pdf";
		File outputReport = new File(path);
		assertFalse(outputReport.exists());

		// Assert no quality-assurance files are generated
		assertEquals(0, new File(burster.getCtx().outputFolder + "/quality-assurance").listFiles().length);
	}

	@Test
	public void burstCommandWithRandomTests() throws Throwable {
		String[] args = new String[] { "job", "burst", PAYSLIPS_REPORT_PATH, "--testrandom=2" };
		executeCommand(args);

		// Assert no quality-assurance files are generated
		assertEquals(0, new File(burster.getCtx().outputFolder + "/quality-assurance").listFiles().length);

		// Assert only 2 output files are generated
		assertEquals(2, new File(burster.getCtx().outputFolder).listFiles(UtilsTest.outputFilesFilter).length);

		// Validate each generated file
		Iterator<File> it = FileUtils.iterateFiles(new File(burster.getCtx().outputFolder), new String[] { "pdf" },
				false);

		while (it.hasNext()) {
			File currentFile = (File) it.next();
			String fileName = currentFile.getName();
			String token = FilenameUtils.getBaseName(fileName);

			DocumentTester tester = new DocumentTester(currentFile.getCanonicalPath());

			// Assert number of pages
			tester.assertPageCountEquals(1);

			// Assert content
			tester.assertContentContainsTextOnPage(burster.getCtx().settings.getStartBurstTokenDelimiter() + token
					+ burster.getCtx().settings.getEndBurstTokenDelimiter(), 1, TextSearchType.CONTAINS);

			// Assert PDF keywords
			tester.assertKeywordsEquals(token);

			tester.close();
		}
	}

	/*
	 * DOCUMENT MERGE COMMAND TESTS
	 */

	@Test(expected = MissingParameterException.class)
	public void missingMergeFileCommand() throws Throwable {
		String[] args = new String[] { "job", "merge" };
		CommandLine cmd = new CommandLine(program, createTestFactory());

		cmd.parseArgs(args);

		CommandLine mergeCmd = cmd.getSubcommands().get("job").getSubcommands().get("merge");
		MainProgram.JobCommand.MergeCommand command = (MainProgram.JobCommand.MergeCommand) mergeCmd.getCommand();

		command.call();
	}

	@Test(expected = FileNotFoundException.class)
	public void mergeCommandWithNonExistingFile() throws Throwable {
		String[] args = new String[] { "job", "merge",
				"src/test/resources/input/unit/other/not-existing-merge-file-Invoicec-Oct-Nov-Dec-bCpvjjzdk1.mf" };

		CommandLine cmd = new CommandLine(program, createTestFactory());
		cmd.parseArgs(args);

		CommandLine mergeCmd = cmd.getSubcommands().get("job").getSubcommands().get("merge");
		MainProgram.JobCommand.MergeCommand command = (MainProgram.JobCommand.MergeCommand) mergeCmd.getCommand();

		command.call();
	}

	@Test(expected = FileNotFoundException.class)
	public void mergeCommandWithListContainingNonExistingFile() throws Throwable {
		String mergeFilePath = testJob.getTempFolder()
				+ FilenameUtils.getName(MERGE_FILE_ONE_FILE_NOT_EXISTING_INVOICES_OCT_NOV_DEC_PATH);
		FileUtils.copyFile(new File(MERGE_FILE_ONE_FILE_NOT_EXISTING_INVOICES_OCT_NOV_DEC_PATH),
				new File(mergeFilePath));

		String[] args = new String[] { "job", "merge", mergeFilePath };

		CommandLine cmd = new CommandLine(program, createTestFactory());
		cmd.parseArgs(args);

		CommandLine mergeCmd = cmd.getSubcommands().get("job").getSubcommands().get("merge");
		MainProgram.JobCommand.MergeCommand command = (MainProgram.JobCommand.MergeCommand) mergeCmd.getCommand();

		command.call();
	}

	@Test
	public void basicMergeCommand() throws Throwable {
		String mergeFilePath = testJob.getTempFolder() + FilenameUtils.getName(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH);
		FileUtils.copyFile(new File(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH), new File(mergeFilePath));

		String[] args = new String[] { "job", "merge", mergeFilePath };
		executeCommand(args);

		assertMergeResults("merged.pdf");

		// Merge file should be deleted after the merge is finished
		assertFalse(new File(mergeFilePath).exists());

		// But the resource merge file should still be there for the following
		// executions
		assertTrue(new File(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH).exists());
	}

	@Test
	public void mergeCommandWithOutputName() throws Throwable {
		String mergeFilePath = testJob.getTempFolder() + FilenameUtils.getName(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH);
		FileUtils.copyFile(new File(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH), new File(mergeFilePath));

		String[] args = new String[] { "job", "merge", mergeFilePath, "-o", "mergedTest2.pdf" };
		executeCommand(args);

		assertMergeResults("mergedTest2.pdf");

		// Merge file should be deleted after the merge is finished
		assertFalse(new File(mergeFilePath).exists());

		// But the resource merge file should still be there for the following
		// executions
		assertTrue(new File(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH).exists());
	}

	@Test
	public void mergeCommandWithBurst() throws Throwable {
		String mergeFilePath = testJob.getTempFolder() + FilenameUtils.getName(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH);
		FileUtils.copyFile(new File(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH), new File(mergeFilePath));

		String[] args = new String[] { "job", "merge", mergeFilePath, "-o", "mergedTest3.pdf", "-b" };
		executeCommand(args);

		assertMergeResults("mergedTest3.pdf");

		// Merge file should be deleted after the merge is finished
		assertFalse(new File(mergeFilePath).exists());

		// But the resource merge file should still be there for the following
		// executions
		assertTrue(new File(MERGE_FILE_INVOICES_OCT_NOV_DEC_PATH).exists());
	}

	/*
	 * RESUME COMMAND TESTS
	 */

	@Test(expected = MissingParameterException.class)
	public void missingJobFileResumeCommand() throws Throwable {
		String[] args = new String[] { "job", "resume" };
		CommandLine cmd = new CommandLine(program, createTestFactory());

		cmd.parseArgs(args);

		MainProgram.ResumeCommand resumeCommand = cmd.getSubcommands().get("job").getSubcommands().get("resume").getCommand();

		// Call the command directly - this will throw MissingParameterException
		resumeCommand.call();
	}

	@Test(expected = FileNotFoundException.class)
	public void resumeCommandWithNonExistingFile() throws Throwable {
		String[] args = new String[] { "job", "resume",
				"src/test/resources/input/unit/other/non-existing-job-progress-file.jpr" };

		CommandLine cmd = new CommandLine(program, createTestFactory());
		cmd.parseArgs(args);

		MainProgram.ResumeCommand resumeCommand = cmd.getSubcommands().get("job").getSubcommands().get("resume").getCommand();

		// Call the command directly - this will throw FileNotFoundException
		resumeCommand.call();
	}

	/*
	 * GENERATE COMMAND TESTS
	 */

	@Test(expected = MissingParameterException.class)
	public void missingInputFileGenerateCommand() throws Throwable {
		String[] args = new String[] { "job", "generate" };
		CommandLine cmd = new CommandLine(program, createTestFactory());

		cmd.parseArgs(args);

		// We shouldn't get here
		fail("Expected exception was not thrown");
	}

	@Test(expected = CommandLine.ParameterException.class)
	public void generateCommandMissingConfig() throws Throwable {
		String[] args = new String[] { "job", "generate", "data.csv" };
		CommandLine cmd = new CommandLine(program, createTestFactory());

		cmd.parseArgs(args);

		MainProgram.GenerateCommand generateCommand = cmd.getSubcommands().get("job").getSubcommands().get("generate").getCommand();

		// Call the command's business logic - this should throw the exception
		generateCommand.call();
	}

	@Test(expected = MissingParameterException.class)
	public void missingArgumentForTestRandomOption() throws Throwable {
		// Test what happens when --testrandom is used without a value
		String[] args = new String[] { "job", "burst", PAYSLIPS_REPORT_PATH, "--testrandom" };
		CommandLine cmd = new CommandLine(program, createTestFactory());

		cmd.parseArgs(args);

		// We shouldn't get here
		fail("Expected exception was not thrown");
	}

	@Test(expected = ParameterException.class)
	public void nonNumericValueForTestRandomOption() throws Throwable {
		// Test what happens when --testrandom has a non-numeric value
		String[] args = new String[] { "job", "burst", PAYSLIPS_REPORT_PATH, "--testrandom=a" };
		CommandLine cmd = new CommandLine(program, createTestFactory());

		cmd.parseArgs(args);

		// We shouldn't get here
		fail("Expected exception was not thrown");
	}

	@Test(expected = ParameterException.class)
	public void negativeValueForTestRandomOption() throws Throwable {
		// Test what happens when --testrandom has a negative value
		String[] args = new String[] { "job", "burst", PAYSLIPS_REPORT_PATH, "--testrandom=-2" };
		CommandLine cmd = new CommandLine(program, createTestFactory());

		cmd.parseArgs(args);

		MainProgram.BurstCommand burstCommand = cmd.getSubcommands().get("job").getSubcommands().get("burst").getCommand();

		// Call the command - this should throw ParameterException due to validation in
		// call() method
		burstCommand.call();

		// We shouldn't get here
		fail("Expected exception was not thrown");
	}
	/*
	 * HELPER METHODS
	 */

	private void assertMergeResults(String fileName) throws Exception {
		String path = TestsUtils.TESTS_OUTPUT_FOLDER + "/output/ValidMergeArguments/" + fileName;

		// Assert output report exists
		File outputReport = new File(path);
		assertTrue(outputReport.exists());

		DocumentTester tester = new DocumentTester(path);

		// Assert number of pages
		tester.assertPageCountEquals(9);

		tester.close();
	}
}