package com.sourcekraft.documentburster.unit.further.commandline;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;

import org.junit.Before;
import org.junit.Test;

import com.sourcekraft.documentburster.MainProgram;
import com.sourcekraft.documentburster.job.CliJob;

import picocli.CommandLine;

/*
 * Arguments are correct. The program environment (paths) is not set up.
 * FileNotFound should be raised for various files: settings.xml, job file etc
 */
public class CommandLineWrongProgramSetUpTest {

    private static final String PAYSLIPS_REPORT_PATH = "src/main/external-resources/template/samples/burst/Payslips.pdf";
    private static final String MERGE_FILE_PATH = "src/test/resources/input/unit/other/merge-file-Invoicec-Oct-Nov-Dec-bCpvjjzdk1.mf";
    
    private MainProgram program;
    
    @Before
    public void setUp() {
        // Create a fresh instance for each test
        program = new MainProgram();
        
        // Make sure the temp directory doesn't exist
        File tempDir = new File("./temp");
        if (tempDir.exists()) {
            tempDir.delete();
        }
    }

    /**
     * Custom CommandLine factory that creates commands that will cause errors
     * when accessing the temp directory
     */
    private CommandLine.IFactory createTestFactory() {
        return new CommandLine.IFactory() {
            @Override
            public <K> K create(Class<K> cls) throws Exception {
                if (cls == MainProgram.BurstCommand.class) {
                    MainProgram.BurstCommand cmd = new MainProgram.BurstCommand() {
                        @Override
                        protected CliJob getJob(String configFilePath) throws Exception {
                            // Create a CliJob that will fail when trying to use the temp directory
                            CliJob job = new CliJob(configFilePath) {
                                @Override
                                public String getTempFolder() {
                                    // Use a folder that doesn't exist and can't be created
                                    return "./temp/";
                                }
                            };
                            job.setGlobal(program.getGlobal());
                            return job;
                        }
                    };
                    return cls.cast(cmd);
                }
                else if (cls == MainProgram.JobCommand.MergeCommand.class) {
                    MainProgram.JobCommand.MergeCommand cmd = new MainProgram.JobCommand.MergeCommand() {
                        @Override
                        protected CliJob getJob(String configFilePath) throws Exception {
                            // Create a CliJob that will fail when trying to use the temp directory
                            CliJob job = new CliJob(configFilePath) {
                                @Override
                                public String getTempFolder() {
                                    // Use a folder that doesn't exist and can't be created
                                    return "./temp/";
                                }
                            };
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

    @Test
    public void testForValidBurstArguments() {
        String[] args = new String[] { "job", "burst", PAYSLIPS_REPORT_PATH };

        try {
            CommandLine cmd = new CommandLine(program, createTestFactory());
            cmd.parseArgs(args);

            MainProgram.BurstCommand burstCommand = cmd.getSubcommands().get("job").getSubcommands().get("burst").getCommand();
            
            // Call directly to allow exceptions to propagate
            burstCommand.call();
            
            // If we get here, the test failed
            fail("It should not come here and it should fail with IOException since the ./temp folder does not exist");
        } catch (Exception e) {
            // Check that the exception chain contains something related to temp directory
            Throwable cause = findCauseWithTempMessage(e);
            assertNotNull("Expected exception with message containing 'temp'", cause);
            assertTrue("Exception should mention temp folder or job file", 
                cause.getMessage().contains("temp") || cause.getMessage().contains(".job"));
        }
    }

    @Test
    public void testForValidMergeArguments1() {
        String[] args = new String[] { "job", "merge", MERGE_FILE_PATH };

        try {
            CommandLine cmd = new CommandLine(program, createTestFactory());
            cmd.parseArgs(args);

            CommandLine mergeCmd = cmd.getSubcommands().get("job").getSubcommands().get("merge");
            MainProgram.JobCommand.MergeCommand command =
                (MainProgram.JobCommand.MergeCommand) mergeCmd.getCommand();
            
            // Call directly to allow exceptions to propagate
            command.call();
            
            // If we get here, the test failed
            fail("It should not come here and it should fail with IOException since the ./temp folder does not exist");
        } catch (Exception e) {
            Throwable cause = findCauseWithTempMessage(e);
            assertNotNull("Expected exception with message containing 'temp'", cause);
            assertTrue("Exception should mention temp folder or job file", 
                cause.getMessage().contains("temp") || cause.getMessage().contains(".job"));
        }
    }

    @Test
    public void testForValidMergeArguments2() {
        String[] args = new String[] { "job", "merge", MERGE_FILE_PATH, "-o", "mergedTest.pdf" };

        try {
            CommandLine cmd = new CommandLine(program, createTestFactory());
            cmd.parseArgs(args);

            CommandLine mergeCmd = cmd.getSubcommands().get("job").getSubcommands().get("merge");
            MainProgram.JobCommand.MergeCommand command =
                (MainProgram.JobCommand.MergeCommand) mergeCmd.getCommand();
            
            // Call directly to allow exceptions to propagate
            command.call();
            
            // If we get here, the test failed
            fail("It should not come here and it should fail with IOException since the ./temp folder does not exist");
        } catch (Exception e) {
            Throwable cause = findCauseWithTempMessage(e);
            assertNotNull("Expected exception with message containing 'temp'", cause);
            assertTrue("Exception should mention temp folder or job file", 
                cause.getMessage().contains("temp") || cause.getMessage().contains(".job"));
        }
    }

    @Test
    public void testForValidMergeArguments3() {
        String[] args = new String[] { "job", "merge", MERGE_FILE_PATH, "-o", "mergedTest.pdf", "-b" };

        try {
            CommandLine cmd = new CommandLine(program, createTestFactory());
            cmd.parseArgs(args);

            CommandLine mergeCmd = cmd.getSubcommands().get("job").getSubcommands().get("merge");
            MainProgram.JobCommand.MergeCommand command =
                (MainProgram.JobCommand.MergeCommand) mergeCmd.getCommand();
            
            // Call directly to allow exceptions to propagate
            command.call();
            
            // If we get here, the test failed
            fail("It should not come here and it should fail with IOException since the ./temp folder does not exist");
        } catch (Exception e) {
            Throwable cause = findCauseWithTempMessage(e);
            assertNotNull("Expected exception with message containing 'temp'", cause);
            assertTrue("Exception should mention temp folder or job file", 
                cause.getMessage().contains("temp") || cause.getMessage().contains(".job"));
        }
    }
    
    /**
     * Helper method to find a cause in the exception chain that has a message containing "temp"
     */
    private Throwable findCauseWithTempMessage(Throwable e) {
        Throwable cause = e;
        while (cause != null) {
            if (cause.getMessage() != null && 
                (cause.getMessage().contains("temp") || cause.getMessage().contains(".job"))) {
                return cause;
            }
            cause = cause.getCause();
        }
        return null;
    }
}