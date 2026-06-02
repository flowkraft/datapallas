package com.sourcekraft.documentburster.unit.further.commandline;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.FileNotFoundException;

import org.junit.Before;
import org.junit.Test;

import com.sourcekraft.documentburster.GlobalContext;
import com.sourcekraft.documentburster.MainProgram;
import com.sourcekraft.documentburster.job.CliJob;

import picocli.CommandLine;
import picocli.CommandLine.UnmatchedArgumentException;

/**
 * Tests for validating error handling in the Picocli command line interface for
 * invalid or incorrect inputs
 */
public class WrongCommandLineArgumentsTest {

	private static final String PAYSLIPS_REPORT_PATH = "src/main/external-resources/template/samples/burst/Payslips.pdf";
	private MainProgram program;

	@Before
	public void setUp() {
		program = new MainProgram();
		GlobalContext global = new GlobalContext();
		program.setGlobal(global);
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
							CliJob job = new CliJob(configFilePath);
							job.setGlobal(program.getGlobal());
							return job;
						}
					};
					return cls.cast(cmd);
				}
				return CommandLine.defaultFactory().create(cls);
			}
		};
	}

	@Test(expected = CommandLine.UnmatchedArgumentException.class)
	public void invalidArgument() throws Throwable {
		// Testing invalid flag - Picocli throws UnmatchedArgumentException for
		// unexpected flags
		String[] args = new String[] { "job", "burst", "-x", PAYSLIPS_REPORT_PATH };

		// This will throw UnmatchedArgumentException because -x is an unknown option
		new CommandLine(program, createTestFactory()).parseArgs(args);
	}

	@Test
	public void invalidBurstInputFile() throws Throwable {
		// Testing nonexistent input file
		String[] args = new String[] { "job", "burst", "C:/inexistent_file.pdf" };

		// Parse arguments but don't execute yet
		CommandLine cmd = new CommandLine(program, createTestFactory());
		cmd.parseArgs(args);

		// Get the burst command instance
		MainProgram.BurstCommand burstCommand = cmd.getSubcommands().get("job").getSubcommands().get("burst").getCommand();

		try {
			// Call the command directly - this should throw FileNotFoundException
			burstCommand.call();
			fail("Should throw FileNotFoundException since the file doesn't exist");
		} catch (FileNotFoundException e) {
			// Now we can properly catch the exception
			assertTrue(e.getMessage().contains("Input file does not exist"));
		}
	}

	@Test
	public void missingRequiredArguments() throws Throwable {
		// Testing missing required parameters
		String[] args = new String[] { "job", "burst" };

		int exitCode = new CommandLine(program, createTestFactory()).execute(args);

		// Picocli returns exit code 2 for user errors (like missing required
		// parameters)
		assertEquals("Should return error exit code for missing parameters", 2, exitCode);
	}

	@Test
	public void invalidFileForFeatureRequest() throws Throwable {
		// Testing feature request with nonexistent file
		String[] args = new String[] { "system", "feature-request", "-f", "C:/nonexistent_feature_request.xml" };

		// Parse arguments
		CommandLine cmd = new CommandLine(program, createTestFactory());
		cmd.parseArgs(args);

		// Get the system command
		CommandLine systemCmd = cmd.getSubcommands().get("system");
		// Get the feature-request command
		CommandLine featureRequestCmd = systemCmd.getSubcommands().get("feature-request");

		// Get the command instance
		MainProgram.SystemCommand.FeatureRequestCommand featureRequestCommand = (MainProgram.SystemCommand.FeatureRequestCommand) featureRequestCmd
				.getCommand();

		try {
			// Call the command directly - this will throw FileNotFoundException
			featureRequestCommand.call();
			fail("Should throw FileNotFoundException since the feature request file doesn't exist");
		} catch (FileNotFoundException e) {
			// Verify the error message
			assertTrue(e.getMessage().contains("Feature request file does not exist"));
		}
	}

}