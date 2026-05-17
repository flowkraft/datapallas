package com.sourcekraft.documentburster;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;

import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.sourcekraft.documentburster.common.oauth.OAuthFlowHelper;
import com.sourcekraft.documentburster.common.oauth.OAuthFlowHelper.TokenResult;
import com.sourcekraft.documentburster.common.security.SecretsCipher;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionEmailSettings;
import com.sourcekraft.documentburster.job.CliJob;

import jakarta.xml.bind.JAXBContext;
import jakarta.xml.bind.Marshaller;

import picocli.CommandLine;
import picocli.CommandLine.ArgGroup;
import picocli.CommandLine.Command;
import picocli.CommandLine.Mixin;
import picocli.CommandLine.Model.CommandSpec;
import picocli.CommandLine.Option;
import picocli.CommandLine.Parameters;
import picocli.CommandLine.ParentCommand;
import picocli.CommandLine.Spec;

@Command(name = "DataPallas", mixinStandardHelpOptions = true, versionProvider = MainProgram.VersionFromSettings.class, description = "Report bursting and report generation software", subcommands = {
		MainProgram.JobCommand.class,
		MainProgram.ConnectionCommand.class,
		MainProgram.SystemCommand.class, MainProgram.ServiceCommand.class,
		MainProgram.JasperCommand.class })
public class MainProgram implements Callable<Integer> {

	private static Logger log = LoggerFactory.getLogger(MainProgram.class);

	// Job type constants for tagging
	public static final String JOB_TYPE_BURST = "burst";
	public static final String JOB_TYPE_GENERATE = "generate";
	public static final String JOB_TYPE_MERGE = "merge";

	private GlobalContext global = new GlobalContext();

	@Spec
	CommandSpec spec;

	public void setGlobal(GlobalContext global) {
		this.global = global;
	}

	public GlobalContext getGlobal() {
		return this.global;
	}

	@Override
	public Integer call() {
		// Show help when no command is specified
		spec.commandLine().usage(System.out);
		return 0;
	}

	public void execute(String[] args) throws Throwable {
		int exitCode = new CommandLine(this).execute(args);
		if (exitCode != 0) {
			throw new RuntimeException("Command execution failed with exit code: " + exitCode);
		}
	}

	static class VersionFromSettings implements CommandLine.IVersionProvider {
		@Override
		public String[] getVersion() {
			try {
				String settingsPath = System.getProperty("DOCUMENTBURSTER_HOME", ".");
				java.io.File settingsFile = new java.io.File(settingsPath, "config/burst/settings.xml");
				if (settingsFile.exists()) {
					String content = new String(java.nio.file.Files.readAllBytes(settingsFile.toPath()));
					java.util.regex.Matcher m = java.util.regex.Pattern.compile("<version>([^<]+)</version>").matcher(content);
					if (m.find()) {
						return new String[] { "DataPallas " + m.group(1) };
					}
				}
			} catch (Exception e) {
				// fall through
			}
			return new String[] { "DataPallas (version unknown)" };
		}
	}

	// Common options for configuration
	public static class ConfigOptions {
		@Option(names = { "-c", "--config" }, description = "Configuration file path")
		String configFile;
	}

	public static class QaOptions {
		@ArgGroup(exclusive = true, multiplicity = "0..1")
		private TestOptions testOptions = new TestOptions();

		static class TestOptions {
			@Option(names = { "-ta", "--testall" }, description = "Test all entries")
			boolean testAll = false;

			@Option(names = { "-tl", "--testlist" }, description = "Comma separated list of entries to test")
			String testList;

			@Option(names = { "-tr",
					"--testrandom" }, description = "Number of randomly selected entries to test (must be positive)", paramLabel = "<count>")
			Integer randomTests;
		}

		// Accessor methods to maintain compatibility with existing code
		public boolean isTestAll() {
			return testOptions != null && testOptions.testAll;
		}

		public String getTestList() {
			return (testOptions == null || testOptions.testList == null) ? StringUtils.EMPTY : testOptions.testList;
		}

		public int getRandomTestsCount() {
			return (testOptions == null || testOptions.randomTests == null) ? -1 : testOptions.randomTests;
		}
	}

	// Base command with shared functionality
	abstract static class BaseCommand {
		protected CliJob getJob(String configFilePath) throws Exception {
			if (StringUtils.isNotEmpty(configFilePath)) {
				File file = new File(configFilePath);
				if (!file.exists()) {
					throw new FileNotFoundException("Configuration file does not exist: " + configFilePath);
				}
			}

			MainProgram parent = getMainProgram();
			CliJob job = new CliJob(configFilePath);
			job.setGlobal(parent.global);
			return job;
		}

		protected abstract MainProgram getMainProgram();
	}

	@Command(name = "job", description = "Job execution operations", subcommands = {
			MainProgram.BurstCommand.class,
			MainProgram.GenerateCommand.class,
			MainProgram.ResumeCommand.class,
			MainProgram.JobCommand.MergeCommand.class,
			MainProgram.JobCommand.StatsCommand.class,
			MainProgram.JobCommand.GenerateJasperCommand.class })
	public static class JobCommand implements Callable<Integer> {
		@ParentCommand
		MainProgram parent;

		@Spec
		CommandSpec spec;

		@Override
		public Integer call() {
			spec.commandLine().usage(System.out);
			return 0;
		}

		@Command(name = "merge", description = "Merge multiple documents into one")
		public static class MergeCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			JobCommand jobCommand;

			@Parameters(index = "0", description = "File containing list of documents to merge", arity = "1")
			private File listFile;

			@Option(names = { "-o", "--output" }, description = "Output file name")
			private String outputFileName;

			@Option(names = { "-b", "--burst" }, description = "Burst the merged file")
			private boolean burst = false;

			@Mixin
			private ConfigOptions config;

			@Override
			protected MainProgram getMainProgram() {
				return jobCommand.parent;
			}

			@Override
			public Integer call() throws Exception {
				if (!listFile.exists()) {
					throw new FileNotFoundException("List file does not exist: " + listFile.getAbsolutePath());
				}

				List<String> filePaths = Files.readAllLines(listFile.toPath(), StandardCharsets.UTF_8);

				for (String filePath : filePaths) {
					File file = new File(filePath);
					if (!file.exists()) {
						throw new FileNotFoundException("Input file does not exist: " + filePath);
					}
				}

				CliJob job = getJob(config.configFile);
				String outputMergedFilePath = job.doMerge(filePaths, outputFileName);

				if (burst) {
					job.doBurst(outputMergedFilePath, false, StringUtils.EMPTY, -1);
				}

				FileUtils.deleteQuietly(listFile);
				return 0;
			}
		}

		@Command(name = "stats", description = "Show active job statistics")
		public static class StatsCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			JobCommand jobCommand;

			@Override
			protected MainProgram getMainProgram() {
				return jobCommand.parent;
			}

			@Override
			public Integer call() throws Exception {
				System.out.println("Active jobs: use the DataPallas web UI or GET /api/jobs/stats for programmatic access.");
				return 0;
			}
		}

		@Command(name = "generate-jasper", description = "Compile and export a JasperReports template (stub — use top-level 'jasper' command for full options)")
		public static class GenerateJasperCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			JobCommand jobCommand;

			@Override
			protected MainProgram getMainProgram() {
				return jobCommand.parent;
			}

			@Override
			public Integer call() throws Exception {
				System.out.println("Use: DataPallas jasper --report-dir <dir> --jrxml <file> --format <pdf|xlsx|csv|html> --out <output>");
				return 0;
			}
		}
	}

	@Command(name = "connection", description = "Connection management operations", subcommands = {
			MainProgram.ConnectionCommand.TestEmailCommand.class,
			MainProgram.ConnectionCommand.TestSmsCommand.class,
			MainProgram.ConnectionCommand.TestDatabaseCommand.class,
			MainProgram.ConnectionCommand.FetchSchemaCommand.class,
			MainProgram.ConnectionCommand.TestQueryCommand.class,
			MainProgram.ConnectionCommand.RunSeedCommand.class,
			MainProgram.ConnectionCommand.OAuthSignInCommand.class })
	public static class ConnectionCommand implements Callable<Integer> {
		@ParentCommand
		MainProgram parent;

		@Spec
		CommandSpec spec;

		@Override
		public Integer call() {
			spec.commandLine().usage(System.out);
			return 0;
		}

		@Command(name = "test-email", description = "Test an email connection")
		static class TestEmailCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			ConnectionCommand connectionCommand;

			@Option(names = { "--id" }, required = true, description = "Email connection ID (e.g. eml-my-email)")
			private String connectionId;

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				System.out.println("Use the DataPallas web UI or POST /api/connections/" + connectionId + "/test-email");
				return 0;
			}
		}

		@Command(name = "test-sms", description = "Test SMS connection via Twilio")
		static class TestSmsCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			ConnectionCommand connectionCommand;

			@Option(names = { "--id" }, required = true, description = "Connection ID")
			private String connectionId;

			@Option(names = { "--from", "--from-number" }, required = true, description = "From phone number")
			private String fromNumber;

			@Option(names = { "--to", "--to-number" }, required = true, description = "To phone number")
			private String toNumber;

			@Mixin
			private ConfigOptions config;

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				CliJob job = getJob(config.configFile);
				job.doCheckTwilio(fromNumber, toNumber);
				return 0;
			}
		}

		@Command(name = "test-database", description = "Test a database connection")
		static class TestDatabaseCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			ConnectionCommand connectionCommand;

			@Option(names = { "--database-connection-file" }, required = true,
					description = "Path to the database connection XML file")
			private File databaseConnectionFile;

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				if (!databaseConnectionFile.exists())
					throw new FileNotFoundException("Database connection file does not exist: " + databaseConnectionFile.getAbsolutePath());
				CliJob job = getJob(databaseConnectionFile.getAbsolutePath());
				job.doTestAndFetchDatabaseSchema(databaseConnectionFile.getAbsolutePath());
				return 0;
			}
		}

		@Command(name = "fetch-schema", description = "Fetch and cache the database schema for a connection")
		static class FetchSchemaCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			ConnectionCommand connectionCommand;

			@Option(names = { "--database-connection-file" }, required = true,
					description = "Path to the database connection XML file")
			private File databaseConnectionFile;

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				if (!databaseConnectionFile.exists())
					throw new FileNotFoundException("Database connection file does not exist: " + databaseConnectionFile.getAbsolutePath());
				CliJob job = getJob(databaseConnectionFile.getAbsolutePath());
				job.doTestAndFetchDatabaseSchema(databaseConnectionFile.getAbsolutePath());
				return 0;
			}
		}

		@Command(name = "test-query", description = "Test a SQL query against a database connection")
		static class TestQueryCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			ConnectionCommand connectionCommand;

			@Option(names = { "--sql-query" }, required = true, description = "SQL query to test")
			private String sqlQuery;

			@Mixin
			private ConfigOptions config;

			@Option(names = { "-p", "--param" }, description = "Query parameters as key=value (repeatable)", paramLabel = "KEY=VALUE")
			private Map<String, String> parameters = new HashMap<>();

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				CliJob job = getJob(config.configFile);
				job.doFetchData(parameters, false);
				return 0;
			}
		}

		@Command(name = "run-seed", description = "Execute a Groovy seed script against a database connection")
		static class RunSeedCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			ConnectionCommand connectionCommand;

			@Option(names = { "--database-connection-file" }, required = true,
					description = "Path to the database connection XML file")
			private File databaseConnectionFile;

			@Option(names = { "--script-file" }, required = true,
					description = "Path to the Groovy script file")
			private File scriptFile;

			@Option(names = { "-p", "--param" }, description = "Script parameters as key=value (repeatable)", paramLabel = "KEY=VALUE")
			private Map<String, String> params = new HashMap<>();

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				if (!databaseConnectionFile.exists())
					throw new FileNotFoundException("Database connection file not found: " + databaseConnectionFile.getAbsolutePath());
				if (!scriptFile.exists())
					throw new FileNotFoundException("Script file not found: " + scriptFile.getAbsolutePath());
				CliJob job = getJob(databaseConnectionFile.getAbsolutePath());
				job.doRunSeedScript(databaseConnectionFile.getAbsolutePath(), scriptFile.getAbsolutePath(), params);
				return 0;
			}
		}

		@Command(name = "oauth-sign-in",
				description = "Run the interactive OAuth2 PKCE flow for an email connection")
		public static class OAuthSignInCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			ConnectionCommand connectionCommand;

			@Option(names = "--provider", required = true,
					description = "Provider: MICROSOFT | GOOGLE | GENERIC")
			private String provider;

			@Option(names = "--client-id", required = true,
					description = "OAuth2 client ID")
			private String clientId;

			@Option(names = "--tenant-id",
					description = "Azure AD tenant ID (MICROSOFT only)")
			private String tenantId;

			@Option(names = "--authorize-url",
					description = "Authorization endpoint (GENERIC only)")
			private String authorizeUrl;

			@Option(names = "--token-url",
					description = "Token endpoint (GENERIC only)")
			private String tokenUrl;

			@Option(names = "--scope",
					description = "OAuth2 scope (GENERIC only)")
			private String scope;

			@Option(names = "--email-connection-file",
					description = "Optional: path to email connection XML to persist the refresh token")
			private File emailConnectionFile;

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				System.out.println("Starting OAuth2 sign-in flow for provider: " + provider);
				System.out.println("Your default browser will open in a moment to complete sign-in.");

				OAuthFlowHelper.TokenResult result = OAuthFlowHelper.runAuthCodeFlow(
						provider, tenantId, clientId, authorizeUrl, tokenUrl, scope);

				if (emailConnectionFile == null) {
					System.out.println();
					System.out.println("=== OAuth2 sign-in successful ===");
					System.out.println("userEmail:    " + result.userEmail);
					System.out.println("refreshToken: " + result.refreshToken);
					return 0;
				}

				if (!emailConnectionFile.exists())
					throw new FileNotFoundException("Email connection file does not exist: " + emailConnectionFile.getAbsolutePath());

				Settings settings = new Settings(null);
				DocumentBursterConnectionEmailSettings connSettings =
						settings.loadSettingsConnectionEmail(emailConnectionFile.getAbsolutePath());

				connSettings.connection.emailserver.oauth2provider = provider.toUpperCase();
				connSettings.connection.emailserver.oauth2clientid = clientId;
				if (StringUtils.isNotBlank(tenantId))
					connSettings.connection.emailserver.oauth2tenantid = tenantId;
				if (StringUtils.isNotBlank(authorizeUrl))
					connSettings.connection.emailserver.oauth2authorizeurl = authorizeUrl;
				if (StringUtils.isNotBlank(tokenUrl))
					connSettings.connection.emailserver.oauth2tokenurl = tokenUrl;
				if (StringUtils.isNotBlank(scope))
					connSettings.connection.emailserver.oauth2scope = scope;
				connSettings.connection.emailserver.oauth2useremail = result.userEmail;

				SecretsCipher cipher = SecretsCipher.getInstance(Settings.PORTABLE_EXECUTABLE_DIR_PATH);
				connSettings.connection.emailserver.oauth2refreshtoken = cipher.encrypt(result.refreshToken);

				JAXBContext jc = JAXBContext.newInstance(DocumentBursterConnectionEmailSettings.class);
				Marshaller marshaller = jc.createMarshaller();
				marshaller.setProperty(Marshaller.JAXB_FORMATTED_OUTPUT, true);
				try (OutputStream os = new FileOutputStream(emailConnectionFile)) {
					marshaller.marshal(connSettings, os);
				}

				System.out.println("=== OAuth2 sign-in successful ===");
				System.out.println("Signed in as : " + result.userEmail);
				System.out.println("Saved to     : " + emailConnectionFile.getAbsolutePath());
				return 0;
			}
		}
	}

	@Command(name = "burst", description = "Burst a document into multiple documents")
	public static class BurstCommand extends BaseCommand implements Callable<Integer> {
		@ParentCommand
		protected JobCommand parent;

		@Parameters(index = "0", description = "Input file to process", arity = "1")
		protected File inputFile;

		@Mixin
		protected ConfigOptions config;

		@Mixin
		protected QaOptions qa;

		@Override
		protected MainProgram getMainProgram() {
			return parent.parent;
		}

		@Override
		public Integer call() throws Exception {
			if (!inputFile.exists()) {
				throw new FileNotFoundException("Input file does not exist: " + inputFile.getAbsolutePath());
			}

			// Validate random tests parameter if it's provided (not -1)
			int randomTestsCount = qa.getRandomTestsCount();
			if (randomTestsCount != -1 && randomTestsCount <= 0) {
				throw new CommandLine.ParameterException(parent.parent.spec.commandLine(),
						"Number of randomly selected entries to test must be positive");
			}

			CliJob job = getJob(config.configFile);
			job.doBurst(inputFile.getAbsolutePath(), qa.isTestAll(), qa.getTestList(), qa.getRandomTestsCount());
			return 0;
		}
	}

	@Command(name = "generate", description = "Generate reports from input data")
	public static class GenerateCommand extends BaseCommand implements Callable<Integer> {
		@ParentCommand
		JobCommand parent;

		@Parameters(index = "0", description = "Input to process", arity = "1")
		private String input;

		@Mixin
		private ConfigOptions config;

		@Mixin
		private QaOptions qa;

		@Option(names = { "-p",
				"--param" }, description = "Report parameters in key=value format (can be repeated)", paramLabel = "KEY=VALUE")
		private Map<String, String> parameters = new HashMap<>();

		@Override
		protected MainProgram getMainProgram() {
			return parent.parent;
		}

		@Override
		public Integer call() throws Exception {
			// Check config required for all types
			if (config.configFile == null) {
				throw new CommandLine.ParameterException(parent.parent.spec.commandLine(),
						"Configuration file (-c/--config) is required");
			}

			// Validate random tests parameter if provided (must be positive)
			int randomTestsCount = qa.getRandomTestsCount();
			if (randomTestsCount > 0 && randomTestsCount <= 0) {
				throw new CommandLine.ParameterException(parent.parent.spec.commandLine(),
						"Number of random tests must be positive");
			}

			Settings settings = new Settings(config.configFile);
			settings.loadSettings();

			boolean isReportGenerationJob = settings.getCapabilities().reportgenerationmailmerge;

			// Validate and process parameters
			CliJob job = getJob(config.configFile);
			job.setJobType(isReportGenerationJob ? settings.getReportDataSource().type : "burst");

			// // System.out.println("[DEBUG] Parsed parameters: " + parameters);

			job.setParameters(parameters);

			job.doBurst(input, qa.isTestAll(), qa.getTestList(), qa.getRandomTestsCount());

			return 0;
		}
	}

	@Command(name = "resume", description = "Resume a previously paused job")
	public static class ResumeCommand extends BaseCommand implements Callable<Integer> {
		@ParentCommand
		JobCommand parent;

		@Parameters(index = "0", description = "Job progress file to resume", arity = "1")
		private File jobProgressFile;

		@Override
		protected MainProgram getMainProgram() {
			return parent.parent;
		}

		@Override
		public Integer call() throws Exception {
			if (!jobProgressFile.exists()) {
				throw new FileNotFoundException(
						"Job progress file does not exist: " + jobProgressFile.getAbsolutePath());
			}

			CliJob job = getJob(null);
			job.doResume(jobProgressFile.getAbsolutePath());
			return 0;
		}
	}

	@Command(name = "system", description = "System operations", subcommands = {
			MainProgram.SystemCommand.TestEmailCommand.class, MainProgram.SystemCommand.TestSmsCommand.class,
			MainProgram.SystemCommand.LicenseCommand.class, MainProgram.SystemCommand.FeatureRequestCommand.class,
			MainProgram.SystemCommand.TestAndFetchDatabaseSchemaCommand.class,
			MainProgram.SystemCommand.RunSeedScriptCommand.class,
			MainProgram.SystemCommand.OAuth2Command.class })
	public static class SystemCommand implements Callable<Integer> {
		@ParentCommand
		MainProgram parent;

		@Spec
		CommandSpec spec;

		@Override
		public Integer call() {
			spec.commandLine().usage(System.out);
			return 0;
		}

		@Command(name = "test-email", description = "Test email connection")
		static class TestEmailCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			SystemCommand systemCommand;

			// --- START: Modification ---
			// Remove Mixin for ConfigOptions
			// @Mixin
			// private ConfigOptions config;

			// Add specific option for email connection file
			@Option(names = {
					"--email-connection-file" }, required = true, description = "Path to the email connection XML file (e.g., config/connections/eml-my-email.xml)")
			private File emailConnectionFile;
			// --- END: Modification ---

			@Override
			protected MainProgram getMainProgram() {
				return systemCommand.parent;
			}

			@Override
			public Integer call() throws Exception {
				// --- START: Modification ---
				// Validate the new option
				if (!emailConnectionFile.exists()) {
					throw new FileNotFoundException(
							"Email connection file does not exist: " + emailConnectionFile.getAbsolutePath());
				}
				if (!emailConnectionFile.isFile()) {
					throw new IllegalArgumentException("Email connection file path does not point to a file: "
							+ emailConnectionFile.getAbsolutePath());
				}

				// Use the specific file path in getJob
				CliJob job = getJob(emailConnectionFile.getAbsolutePath());
				// --- END: Modification ---
				job.doCheckEmail();
				return 0;
			}
		}

		@Command(name = "test-sms", description = "Test SMS through Twilio")
		static class TestSmsCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			SystemCommand systemCommand;

			@Option(names = { "--from", "--from-number" }, required = true, description = "From phone number")
			private String fromNumber;

			@Option(names = { "--to", "--to-number" }, required = true, description = "To phone number")
			private String toNumber;

			@Mixin
			private ConfigOptions config;

			@Override
			protected MainProgram getMainProgram() {
				return systemCommand.parent;
			}

			@Override
			public Integer call() throws Exception {
				CliJob job = getJob(config.configFile);
				job.doCheckTwilio(fromNumber, toNumber);
				return 0;
			}
		}

		@Command(name = "test-and-fetch-database-schema", description = "Test database connection and fetch schema information")
		static class TestAndFetchDatabaseSchemaCommand extends BaseCommand implements Callable<Integer> {

			@ParentCommand
			SystemCommand systemCommand;

			// --- START: Modification ---
			// Rename option and update description for clarity
			@Option(names = {
					"--database-connection-file" }, required = true, description = "Path to the database connection XML file (e.g., config/connections/db-my-db/db-my-db.xml)")
			private File databaseConnectionFile; // Renamed from connectionFile
			// --- END: Modification ---

			@Override
			protected MainProgram getMainProgram() {
				return systemCommand.parent;
			}

			@Override
			public Integer call() throws Exception {
				log.info("Initiating test-and-fetch-database-schema via CliJob...");

				// Validate file existence
				if (!databaseConnectionFile.exists()) {
					throw new FileNotFoundException(
							"Database connection file does not exist: " + databaseConnectionFile.getAbsolutePath());
				}
				if (!databaseConnectionFile.isFile()) {
					throw new IllegalArgumentException("Database connection file path does not point to a file: "
							+ databaseConnectionFile.getAbsolutePath());
				}

				// instantiate job and execute
				CliJob job = getJob(databaseConnectionFile.getAbsolutePath());
				job.doTestAndFetchDatabaseSchema(databaseConnectionFile.getAbsolutePath());

				log.info("CliJob execution for test-and-fetch-database-schema requested.");
				return 0;
			}
		}

		@Command(name = "run-seed-script", description = "Execute a Groovy seed script against a database connection")
		static class RunSeedScriptCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			SystemCommand systemCommand;

			@Option(names = { "--database-connection-file" }, required = true,
					description = "Path to the database connection XML file")
			private File databaseConnectionFile;

			@Option(names = { "--script-file" }, required = true,
					description = "Path to the Groovy script file to execute")
			private File scriptFile;

			@Option(names = { "-p", "--param" }, description = "Script parameters as key=value (can be repeated)", paramLabel = "KEY=VALUE")
			private Map<String, String> params = new HashMap<>();

			@Override
			protected MainProgram getMainProgram() {
				return systemCommand.parent;
			}

			@Override
			public Integer call() throws Exception {
				if (!databaseConnectionFile.exists())
					throw new FileNotFoundException("Database connection file not found: " + databaseConnectionFile.getAbsolutePath());
				if (!scriptFile.exists())
					throw new FileNotFoundException("Script file not found: " + scriptFile.getAbsolutePath());

				CliJob job = getJob(databaseConnectionFile.getAbsolutePath());
				job.doRunSeedScript(databaseConnectionFile.getAbsolutePath(), scriptFile.getAbsolutePath(), params);
				return 0;
			}
		}

		@Command(name = "test-sql-query", description = "Test SQL query execution")
		static class TestSqlQueryCommand extends BaseCommand implements Callable<Integer> {

			@ParentCommand
			SystemCommand systemCommand;

			@Option(names = { "--sql-query" }, required = true, description = "SQL query to execute")
			private String sqlQuery;

			@Mixin
			protected ConfigOptions config;

			@Option(names = { "-p",
					"--param" }, description = "Query parameters in key=value format (can be repeated)", paramLabel = "KEY=VALUE")
			private Map<String, String> parameters = new HashMap<>();

			@Override
			protected MainProgram getMainProgram() {
				return systemCommand.parent;
			}

			@Override
			public Integer call() throws Exception {
				CliJob job = getJob(config.configFile);
				job.doFetchData(parameters, false);
				return 0;
			}
		}

		@Command(name = "license", description = "License management", subcommands = {
				SystemCommand.LicenseCommand.ActivateCommand.class,
				SystemCommand.LicenseCommand.DeactivateCommand.class, SystemCommand.LicenseCommand.CheckCommand.class })
		public static class LicenseCommand implements Callable<Integer> {
			@ParentCommand
			SystemCommand systemCommand;

			@Spec
			CommandSpec spec;

			@Override
			public Integer call() {
				spec.commandLine().usage(System.out);
				return 0;
			}

			abstract static class LicenseBaseCommand extends BaseCommand {
				@ParentCommand
				LicenseCommand licenseCommand;

				@Override
				protected MainProgram getMainProgram() {
					return licenseCommand.systemCommand.parent;
				}
			}

			@Command(name = "activate", description = "Activate license key")
			public static class ActivateCommand extends LicenseBaseCommand implements Callable<Integer> {
				@Override
				public Integer call() throws Exception {
					CliJob job = getJob(null);
					job.doActivateLicenseKey();
					return 0;
				}
			}

			@Command(name = "deactivate", description = "Deactivate license key")
			public static class DeactivateCommand extends LicenseBaseCommand implements Callable<Integer> {
				@Override
				public Integer call() throws Exception {
					CliJob job = getJob(null);
					job.doDeactivateLicense();
					return 0;
				}
			}

			@Command(name = "check", description = "Check license status")
			public static class CheckCommand extends LicenseBaseCommand implements Callable<Integer> {
				@Override
				public Integer call() throws Exception {
					CliJob job = getJob(null);
					job.doCheckLicense();
					return 0;
				}
			}
		}

		@Command(name = "feature-request", description = "Submit a feature request")
		public static class FeatureRequestCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			SystemCommand systemCommand;

			@Option(names = { "-f", "--file" }, required = true, description = "XML file with feature request details")
			private File featureRequestFile;

			@Override
			protected MainProgram getMainProgram() {
				return systemCommand.parent;
			}

			@Override
			public Integer call() throws Exception {
				if (!featureRequestFile.exists()) {
					throw new FileNotFoundException(
							"Feature request file does not exist: " + featureRequestFile.getAbsolutePath());
				}

				CliJob job = getJob(null);
				job.doSendFeatureRequestEmail(featureRequestFile.getAbsolutePath());
				return 0;
			}
		}

		@Command(name = "oauth2", description = "OAuth2 sign-in for email connections", subcommands = {
				SystemCommand.OAuth2Command.SignInCommand.class })
		public static class OAuth2Command implements Callable<Integer> {
			@ParentCommand
			SystemCommand systemCommand;

			@Spec
			CommandSpec spec;

			@Override
			public Integer call() {
				spec.commandLine().usage(System.out);
				return 0;
			}

			@Command(name = "sign-in",
					description = "Run the interactive OAuth2 PKCE flow against a provider (Microsoft / Google / Generic) "
							+ "and either persist the resulting refresh token onto a defined email connection file "
							+ "(--email-connection-file) or print it to stdout for manual paste.")
			public static class SignInCommand extends BaseCommand implements Callable<Integer> {
				@ParentCommand
				OAuth2Command oauth2Command;

				@Option(names = "--provider", required = true,
						description = "Provider: MICROSOFT | GOOGLE | GENERIC")
				private String provider;

				@Option(names = "--client-id", required = true,
						description = "OAuth2 client ID (Application (client) ID for Microsoft)")
				private String clientId;

				@Option(names = "--tenant-id",
						description = "Azure AD tenant ID (MICROSOFT only; defaults to 'common')")
				private String tenantId;

				@Option(names = "--authorize-url",
						description = "Authorization endpoint (GENERIC only)")
				private String authorizeUrl;

				@Option(names = "--token-url",
						description = "Token endpoint (GENERIC only)")
				private String tokenUrl;

				@Option(names = "--scope",
						description = "OAuth2 scope (GENERIC only; e.g. 'https://outlook.office.com/SMTP.Send offline_access openid email')")
				private String scope;

				@Option(names = "--email-connection-file",
						description = "Optional: path to an email connection XML file (e.g. config/connections/eml-office365.xml). "
								+ "When provided, the refresh token + signed-in mailbox are persisted into that file (refresh token encrypted). "
								+ "When omitted, both values are printed to stdout for manual paste.")
				private File emailConnectionFile;

				@Override
				protected MainProgram getMainProgram() {
					return oauth2Command.systemCommand.parent;
				}

				@Override
				public Integer call() throws Exception {
					System.out.println("Starting OAuth2 sign-in flow for provider: " + provider);
					System.out.println("Your default browser will open in a moment to complete sign-in.");

					TokenResult result = OAuthFlowHelper.runAuthCodeFlow(
							provider, tenantId, clientId, authorizeUrl, tokenUrl, scope);

					if (emailConnectionFile == null) {
						System.out.println();
						System.out.println("=== OAuth2 sign-in successful ===");
						System.out.println("userEmail:    " + result.userEmail);
						System.out.println("refreshToken: " + result.refreshToken);
						System.out.println();
						System.out.println("Paste these into the <oauth2useremail> and <oauth2refreshtoken> elements "
								+ "of your email connection XML. The refresh token will be encrypted on first save "
								+ "by the running DataPallas instance.");
						return 0;
					}

					if (!emailConnectionFile.exists()) {
						throw new FileNotFoundException(
								"Email connection file does not exist: " + emailConnectionFile.getAbsolutePath());
					}

					Settings settings = new Settings(null);
					DocumentBursterConnectionEmailSettings connSettings = settings
							.loadSettingsConnectionEmail(emailConnectionFile.getAbsolutePath());
					if (connSettings == null || connSettings.connection == null
							|| connSettings.connection.emailserver == null) {
						throw new IllegalStateException(
								"Email connection file is malformed (missing <connection><emailserver>): "
										+ emailConnectionFile.getAbsolutePath());
					}

					connSettings.connection.emailserver.oauth2provider = provider.toUpperCase();
					connSettings.connection.emailserver.oauth2clientid = clientId;
					if (StringUtils.isNotBlank(tenantId))
						connSettings.connection.emailserver.oauth2tenantid = tenantId;
					if (StringUtils.isNotBlank(authorizeUrl))
						connSettings.connection.emailserver.oauth2authorizeurl = authorizeUrl;
					if (StringUtils.isNotBlank(tokenUrl))
						connSettings.connection.emailserver.oauth2tokenurl = tokenUrl;
					if (StringUtils.isNotBlank(scope))
						connSettings.connection.emailserver.oauth2scope = scope;
					connSettings.connection.emailserver.oauth2useremail = result.userEmail;

					// Encrypt the refresh token at rest using the same SecretsCipher path the server uses.
					// SecretsCipher.encrypt() already returns the full "ENC(...)" wrapper.
					SecretsCipher cipher = SecretsCipher.getInstance(Settings.PORTABLE_EXECUTABLE_DIR_PATH);
					connSettings.connection.emailserver.oauth2refreshtoken = cipher.encrypt(result.refreshToken);

					JAXBContext jc = JAXBContext.newInstance(DocumentBursterConnectionEmailSettings.class);
					Marshaller marshaller = jc.createMarshaller();
					marshaller.setProperty(Marshaller.JAXB_FORMATTED_OUTPUT, true);
					try (OutputStream os = new FileOutputStream(emailConnectionFile)) {
						marshaller.marshal(connSettings, os);
					}

					System.out.println();
					System.out.println("=== OAuth2 sign-in successful ===");
					System.out.println("Signed in as : " + result.userEmail);
					System.out.println("Saved to     : " + emailConnectionFile.getAbsolutePath());
					System.out.println("Refresh token has been written encrypted (ENC(...)).");
					return 0;
				}
			}
		}
	}

	@Command(name = "jasper", description = "Compile, fill, and export JasperReports (.jrxml) reports")
	public static class JasperCommand extends BaseCommand implements Callable<Integer> {
		@ParentCommand
		MainProgram parent;

		@Option(names = { "--report-dir" }, required = true, description = "Folder containing the .jrxml and its resources")
		private File reportDir;

		@Option(names = { "--jrxml" }, required = true, description = "Main .jrxml template filename")
		private String jrxml;

		@Option(names = { "--jdbc-url" }, description = "JDBC connection URL")
		private String jdbcUrl;

		@Option(names = { "--jdbc-user" }, description = "JDBC username")
		private String jdbcUser;

		@Option(names = { "--jdbc-pass" }, description = "JDBC password", defaultValue = "")
		private String jdbcPass;

		@Option(names = { "-p", "--params" }, description = "Report parameter as key=value (repeatable)")
		private Map<String, String> params;

		@Option(names = { "--format" }, required = true, description = "Output format: pdf, xlsx, csv, html")
		private String format;

		@Option(names = { "--out" }, required = true, description = "Output file path")
		private File out;

		@Override
		protected MainProgram getMainProgram() {
			return parent;
		}

		@Override
		public Integer call() throws Exception {
			CliJob job = getJob(null);
			job.doJasperReport(reportDir, jrxml, format, out, jdbcUrl, jdbcUser, jdbcPass, params);
			return 0;
		}
	}

	@Command(name = "service", description = "Manage services (e.g., databases, queues) via Docker.", mixinStandardHelpOptions = false, customSynopsis = "service <category> <command> [service-name] [args...]")
	public static class ServiceCommand extends BaseCommand implements Callable<Integer> {

		@ParentCommand
		MainProgram parent;

		@Override
		protected MainProgram getMainProgram() {
			return parent;
		}

		// Use arity = "1..*" to capture all remaining args
		@Parameters(description = "The full service command string (e.g., 'database start northwind postgresql').", arity = "1..*")
		private List<String> commandAndArgs;
		
		// Capture unmatched options like --no-cache, --build, --liquibase
		@CommandLine.Unmatched
		private List<String> unmatchedArgs;

		@Override
		public Integer call() throws Exception {
			
			// Enable TestContainers reuse mode for persistent database containers
	        System.setProperty("testcontainers.reuse.enable", "true");
	        
			if (commandAndArgs == null || commandAndArgs.isEmpty()) {
				System.err.println("Error: No service command provided.");
				return 1;
			}

			// Combine commandAndArgs with any unmatched args (flags like --no-cache)
			List<String> allArgs = new ArrayList<>(commandAndArgs);
			if (unmatchedArgs != null) {
				allArgs.addAll(unmatchedArgs);
			}

			String serviceName = allArgs.get(2);
			String commandLine = String.join(" ", allArgs);

			CliJob job = getJob(null);
			job.doService(serviceName, commandLine);

			return 0;
		}
	}


}
