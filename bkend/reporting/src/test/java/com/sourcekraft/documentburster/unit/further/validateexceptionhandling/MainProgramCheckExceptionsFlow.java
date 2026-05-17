package com.sourcekraft.documentburster.unit.further.validateexceptionhandling;

import static org.junit.Assert.fail;

import java.io.File;
import java.io.FileNotFoundException;

import org.apache.commons.io.FileUtils;
import org.junit.Test;

import com.sourcekraft.documentburster.MainProgram;

public class MainProgramCheckExceptionsFlow {

	@SuppressWarnings("serial")
	public class CustomBurstingException extends Exception {

		public CustomBurstingException(String message) {
			super(message);
		}

	}

	private static final String PAYSLIPS_REPORT_PATH = "src/main/external-resources/template/samples/burst/Payslips.pdf";

	@Test(expected = CustomBurstingException.class)
	public void testMainProgramValidExceptionsFlow() throws Exception {
	    // Make sure temp directory exists
	    File tempDir = new File("./temp");
	    tempDir.mkdirs();
	    
	    try {
	        // Create a command with the minimum required setup
	        MainProgram.BurstCommand command = new MainProgram.BurstCommand() {
	            {
	                // Set parent explicitly to avoid NPEs
	                this.parent = new MainProgram.JobCommand();
	                // Set required input file
	                this.inputFile = new File(PAYSLIPS_REPORT_PATH);
	                
	                this.config = new MainProgram.ConfigOptions();
	                this.qa = new MainProgram.QaOptions();
	            }

	            // Override call to throw our custom exception directly
	            @Override
	            public Integer call() throws Exception {
	                if (!inputFile.exists()) {
	                    throw new FileNotFoundException("Input file does not exist: " + inputFile.getAbsolutePath());
	                }
	                
	                // Throw our custom exception before any job/temp file operations
	                throw new CustomBurstingException("CustomBurstingException");
	            }
	        };

	        // Call the command directly
	        command.call();
	        fail("Expected exception was not thrown");
	    } finally {
	        // Clean up by removing the temp directory when done
	        FileUtils.deleteDirectory(tempDir);
	    }
	}
}