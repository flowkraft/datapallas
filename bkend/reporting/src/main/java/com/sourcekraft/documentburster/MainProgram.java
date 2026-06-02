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

import com.sourcekraft.documentburster.cli.JsonOutputMixin;
import com.sourcekraft.documentburster.common.oauth.OAuthFlowHelper;
import com.sourcekraft.documentburster.common.oauth.OAuthFlowHelper.TokenResult;
import com.sourcekraft.documentburster.common.security.SecretsCipher;
import com.sourcekraft.documentburster.common.settings.Settings;
import com.sourcekraft.documentburster.common.settings.model.DocumentBursterConnectionEmailSettings;
import com.sourcekraft.documentburster.common.ServicesManager;
import com.sourcekraft.documentburster.job.CliJob;
import com.sourcekraft.documentburster.utils.Utils;

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
		MainProgram.SystemCommand.class,
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
			MainProgram.JobCommand.MergeCommand.class,
			MainProgram.JobCommand.StatusCommand.class,
			MainProgram.JobCommand.CancelCommand.class,
			MainProgram.JobCommand.ResumeCommand.class,
			MainProgram.JasperCommand.class })
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

			@Mixin
			JsonOutputMixin jsonOutput;

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

				try {
					CliJob job = getJob(config.configFile);
					String outputMergedFilePath = job.doMerge(filePaths, outputFileName);

					if (burst) {
						job.doBurst(outputMergedFilePath, false, StringUtils.EMPTY, -1);
					}

					FileUtils.deleteQuietly(listFile);
					jsonOutput.emitOk(Map.of("jobType", "merge", "outputFile", outputFileName != null ? outputFileName : ""));
					return 0;
				} catch (Exception e) {
					jsonOutput.emitError(e.getMessage(), Map.of("jobType", "merge"));
					throw e;
				}
			}
		}

		@Command(name = "status", description = "Poll the status of an async job submitted via POST /api/jobs")
		public static class StatusCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			JobCommand jobCommand;

			@Option(names = { "--job-id" }, required = true, description = "Job ID (UUID from POST /api/jobs response)")
			private String jobId;

			@Mixin
			JsonOutputMixin jsonOutput;

			@Override
			protected MainProgram getMainProgram() { return jobCommand.parent; }

			@Override
			public Integer call() throws Exception {
				java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
				java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder()
						.uri(java.net.URI.create("http://localhost:9090/api/jobs/" + jobId))
						.header("Accept", "application/json")
						.GET().build();
				java.net.http.HttpResponse<String> resp = client.send(req,
						java.net.http.HttpResponse.BodyHandlers.ofString());
				if (resp.statusCode() == 404) {
					System.err.println("Job not found: " + jobId);
					return 1;
				}
				if (jsonOutput.json) {
					// resp.body() is already JSON-shaped from the server (JobRecord.toMap())
					System.out.println(resp.body());
				} else {
					// Human-readable 2-line summary parsed from the JSON body
					try {
						com.fasterxml.jackson.databind.JsonNode node =
								new com.fasterxml.jackson.databind.ObjectMapper().readTree(resp.body());
						String status = node.path("status").asText("unknown");
						String startedAt = node.path("startedAt").asText("");
						System.out.println("Job " + jobId);
						System.out.println("  status: " + status + "   started: " + startedAt);
					} catch (Exception parseEx) {
						System.out.println(resp.body());
					}
				}
				return resp.statusCode() == 200 ? 0 : 1;
			}
		}

		/**
		 * In-process resume of a previously paused burst job. Mirrors main's
		 * top-level "resume" command (was moved under "job" with the rest of
		 * the job lifecycle operations during the V2-V6 vocabulary refactor).
		 *
		 * Reads the .progress XML written by AbstractBurster._updateJobProgressAndSaveToFile,
		 * picks up at the next token after lasttokenprocessed, and writes the
		 * progress file as it goes — same mechanism as initial burst.
		 */
		@Command(name = "resume", description = "Resume a previously paused job from its .progress file")
		public static class ResumeCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			JobCommand jobCommand;

			@Parameters(index = "0", description = "Job progress file to resume", arity = "1")
			private File jobProgressFile;

			@Override
			protected MainProgram getMainProgram() { return jobCommand.parent; }

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

		@Command(name = "cancel", description = "Cancel a running job by ID")
		public static class CancelCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			JobCommand jobCommand;

			@Option(names = { "--job-id" }, required = true, description = "Job ID (UUID from POST /api/jobs response)")
			private String jobId;

			@Mixin
			JsonOutputMixin jsonOutput;

			@Override
			protected MainProgram getMainProgram() { return jobCommand.parent; }

			@Override
			public Integer call() throws Exception {
				java.net.http.HttpClient client = java.net.http.HttpClient.newHttpClient();
				java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder()
						.uri(java.net.URI.create("http://localhost:9090/api/jobs/" + jobId))
						.header("Accept", "application/json")
						.DELETE().build();
				java.net.http.HttpResponse<String> resp = client.send(req,
						java.net.http.HttpResponse.BodyHandlers.ofString());
				if (resp.statusCode() == 404) {
					System.err.println("Job not found: " + jobId);
					return 1;
				}
				if (resp.statusCode() == 204) {
					if (jsonOutput.json) {
						jsonOutput.emit(Map.of("status", "ok", "jobId", jobId, "cancelled", true));
					} else {
						System.out.println("Job " + jobId + " cancelled.");
					}
					return 0;
				}
				System.err.println("Unexpected response: " + resp.statusCode());
				return 1;
			}
		}

	}

	@Command(name = "connection", description = "Connection management operations", subcommands = {
			MainProgram.ConnectionCommand.ListCommand.class,
			MainProgram.ConnectionCommand.TestEmailCommand.class,
			MainProgram.ConnectionCommand.TestSmsCommand.class,
			MainProgram.ConnectionCommand.TestDatabaseCommand.class,
			MainProgram.ConnectionCommand.FetchSchemaCommand.class,
			MainProgram.ConnectionCommand.TestQueryCommand.class,
			MainProgram.ConnectionCommand.RunSeedCommand.class,
			MainProgram.ConnectionCommand.RunSqlCommand.class,
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

		@Command(name = "list", description = "List configured connections")
		static class ListCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			ConnectionCommand connectionCommand;

			@Option(names = { "--type" }, description = "Filter by type: email or database (default: all)")
			private String type;

			@Option(names = { "--format" }, description = "Output format: table or json (default: table)")
			private String format = "table";

			@Mixin
			JsonOutputMixin jsonOutput;

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				if (jsonOutput.json) format = "json";
				File connectionsDir = new File(Utils.resolvePathAgainstPortableDir("config/connections"));
				if (!connectionsDir.isDirectory()) {
					System.out.println("No connections directory found.");
					return 0;
				}
				File[] dirs = connectionsDir.listFiles(File::isDirectory);
				if (dirs == null || dirs.length == 0) {
					System.out.println("No connections configured.");
					return 0;
				}
				List<String> ids = new java.util.ArrayList<>();
				for (File d : dirs) {
					String id = d.getName();
					if ("email".equals(type) && !id.startsWith("eml-")) continue;
					if ("database".equals(type) && !id.startsWith("db-")) continue;
					ids.add(id);
				}
				java.util.Collections.sort(ids);
				if ("json".equals(format)) {
					System.out.println("[");
					for (int i = 0; i < ids.size(); i++) {
						String id = ids.get(i);
						String t = id.startsWith("eml-") ? "email" : id.startsWith("db-") ? "database" : "other";
						System.out.printf("  {\"id\":\"%s\",\"type\":\"%s\"}%s%n", id, t, i < ids.size() - 1 ? "," : "");
					}
					System.out.println("]");
				} else {
					System.out.printf("%-40s %-10s%n", "ID", "TYPE");
					System.out.println("-".repeat(52));
					for (String id : ids) {
						String t = id.startsWith("eml-") ? "email" : id.startsWith("db-") ? "database" : "other";
						System.out.printf("%-40s %-10s%n", id, t);
					}
				}
				return 0;
			}
		}

		@Command(name = "run-sql", description = "Execute a SQL query against a database connection")
		static class RunSqlCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			ConnectionCommand connectionCommand;

			@Option(names = { "--id" }, required = true, description = "Database connection ID (e.g. db-northwind)")
			private String connectionId;

			@Option(names = { "-q", "--query" }, required = true, description = "SQL query to execute")
			private String sql;

			@Option(names = { "--out" }, description = "Output file (default: stdout)")
			private File outFile;

			@Option(names = { "--format" }, description = "Output format: table, csv, or json (default: table)")
			private String format = "table";

			@Mixin
			JsonOutputMixin jsonOutput;

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				if (jsonOutput.json) format = "json";
				String filePath = Utils.resolvePathAgainstPortableDir(
						"config/connections/" + connectionId + "/" + connectionId + ".xml");
				CliJob job = getJob(filePath);
				List<Map<String, Object>> rows = job.doRunSql(filePath, sql);
				String output = formatRows(rows, format);
				if (outFile != null) {
					Files.writeString(outFile.toPath(), output);
					System.out.println("Written " + rows.size() + " rows to " + outFile.getAbsolutePath());
				} else {
					System.out.print(output);
				}
				return 0;
			}

			private String formatRows(List<Map<String, Object>> rows, String fmt) throws Exception {
				if (rows.isEmpty()) return "(no rows)\n";
				List<String> cols = new java.util.ArrayList<>(rows.get(0).keySet());
				if ("json".equals(fmt)) {
					return new com.fasterxml.jackson.databind.ObjectMapper()
							.writerWithDefaultPrettyPrinter().writeValueAsString(rows) + "\n";
				}
				if ("csv".equals(fmt)) {
					StringBuilder sb = new StringBuilder();
					sb.append(String.join(",", cols)).append("\n");
					for (Map<String, Object> row : rows) {
						List<String> vals = new java.util.ArrayList<>();
						for (String c : cols) {
							Object v = row.get(c);
							String s = v == null ? "" : v.toString();
							vals.add(s.contains(",") ? "\"" + s.replace("\"", "\"\"") + "\"" : s);
						}
						sb.append(String.join(",", vals)).append("\n");
					}
					return sb.toString();
				}
				// table format
				int[] widths = new int[cols.size()];
				for (int i = 0; i < cols.size(); i++) widths[i] = cols.get(i).length();
				for (Map<String, Object> row : rows) {
					for (int i = 0; i < cols.size(); i++) {
						Object v = row.get(cols.get(i));
						int len = v == null ? 4 : v.toString().length();
						if (len > widths[i]) widths[i] = len;
					}
				}
				StringBuilder sb = new StringBuilder();
				for (int i = 0; i < cols.size(); i++) sb.append(String.format("%-" + widths[i] + "s  ", cols.get(i)));
				sb.append("\n");
				for (int i = 0; i < cols.size(); i++) sb.append("-".repeat(widths[i])).append("  ");
				sb.append("\n");
				for (Map<String, Object> row : rows) {
					for (int i = 0; i < cols.size(); i++) {
						Object v = row.get(cols.get(i));
						sb.append(String.format("%-" + widths[i] + "s  ", v == null ? "NULL" : v.toString()));
					}
					sb.append("\n");
				}
				return sb.toString();
			}
		}

		@Command(name = "test-email", description = "Test an email connection")
		static class TestEmailCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			ConnectionCommand connectionCommand;

			@Option(names = { "--id" }, required = true, description = "Email connection ID (e.g. eml-my-email)")
			private String connectionId;

			@Mixin
			JsonOutputMixin jsonOutput;

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				String filePath = Utils.resolvePathAgainstPortableDir(
						"config/connections/" + connectionId + ".xml");
				try {
					CliJob job = getJob(filePath);
					job.doCheckEmail();
					jsonOutput.emitOk(Map.of("connectionId", connectionId));
					return 0;
				} catch (Exception e) {
					jsonOutput.emitError(e.getMessage(), Map.of("connectionId", connectionId));
					throw e;
				}
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

			@Mixin
			JsonOutputMixin jsonOutput;

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				try {
					CliJob job = getJob(config.configFile);
					job.doCheckTwilio(fromNumber, toNumber);
					jsonOutput.emitOk(Map.of("connectionId", connectionId, "from", fromNumber, "to", toNumber));
					return 0;
				} catch (Exception e) {
					jsonOutput.emitError(e.getMessage(), Map.of("connectionId", connectionId));
					throw e;
				}
			}
		}

		@Command(name = "test-database", description = "Test a database connection")
		static class TestDatabaseCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			ConnectionCommand connectionCommand;

			@Option(names = { "--id" }, required = true,
					description = "Database connection ID (e.g. db-northwind)")
			private String connectionId;

			@Mixin
			JsonOutputMixin jsonOutput;

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				String filePath = Utils.resolvePathAgainstPortableDir(
						"config/connections/" + connectionId + "/" + connectionId + ".xml");
				try {
					CliJob job = getJob(filePath);
					job.doTestAndFetchDatabaseSchema(filePath);
					jsonOutput.emitOk(Map.of("connectionId", connectionId));
					return 0;
				} catch (Exception e) {
					jsonOutput.emitError(e.getMessage(), Map.of("connectionId", connectionId));
					throw e;
				}
			}
		}

		@Command(name = "fetch-schema", description = "Fetch and cache the database schema for a connection")
		static class FetchSchemaCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			ConnectionCommand connectionCommand;

			@Option(names = { "--id" }, required = true,
					description = "Database connection ID (e.g. db-northwind)")
			private String connectionId;

			@Mixin
			JsonOutputMixin jsonOutput;

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				String filePath = Utils.resolvePathAgainstPortableDir(
						"config/connections/" + connectionId + "/" + connectionId + ".xml");
				try {
					CliJob job = getJob(filePath);
					job.doTestAndFetchDatabaseSchema(filePath);
					jsonOutput.emitOk(Map.of("connectionId", connectionId, "schemaFetched", true));
					return 0;
				} catch (Exception e) {
					jsonOutput.emitError(e.getMessage(), Map.of("connectionId", connectionId));
					throw e;
				}
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

			@Mixin
			JsonOutputMixin jsonOutput;

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				try {
					CliJob job = getJob(config.configFile);
					job.doFetchData(parameters, false);
					jsonOutput.emitOk(Map.of("query", sqlQuery));
					return 0;
				} catch (Exception e) {
					jsonOutput.emitError(e.getMessage(), Map.of("query", sqlQuery));
					throw e;
				}
			}
		}

		@Command(name = "run-seed", description = "Execute a Groovy seed script against a database connection")
		static class RunSeedCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			ConnectionCommand connectionCommand;

			@Option(names = { "--id" }, required = true,
					description = "Database connection ID (e.g. db-northwind)")
			private String connectionId;

			@Option(names = { "--script-file" }, required = true,
					description = "Path to the Groovy script file")
			private File scriptFile;

			@Option(names = { "-p", "--param" }, description = "Script parameters as key=value (repeatable)", paramLabel = "KEY=VALUE")
			private Map<String, String> params = new HashMap<>();

			@Mixin
			JsonOutputMixin jsonOutput;

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				String filePath = Utils.resolvePathAgainstPortableDir(
						"config/connections/" + connectionId + "/" + connectionId + ".xml");
				if (!scriptFile.exists())
					throw new FileNotFoundException("Script file not found: " + scriptFile.getAbsolutePath());
				try {
					CliJob job = getJob(filePath);
					job.doRunSeedScript(filePath, scriptFile.getAbsolutePath(), params);
					jsonOutput.emitOk(Map.of("connectionId", connectionId, "scriptFile", scriptFile.getName()));
					return 0;
				} catch (Exception e) {
					jsonOutput.emitError(e.getMessage(), Map.of("connectionId", connectionId, "scriptFile", scriptFile.getName()));
					throw e;
				}
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

			@Mixin
			JsonOutputMixin jsonOutput;

			@Override
			protected MainProgram getMainProgram() { return connectionCommand.parent; }

			@Override
			public Integer call() throws Exception {
				if (!jsonOutput.json) {
					System.out.println("Starting OAuth2 sign-in flow for provider: " + provider);
					System.out.println("Your default browser will open in a moment to complete sign-in.");
				}

				OAuthFlowHelper.TokenResult result = OAuthFlowHelper.runAuthCodeFlow(
						provider, tenantId, clientId, authorizeUrl, tokenUrl, scope);

				if (emailConnectionFile == null) {
					if (jsonOutput.json) {
						jsonOutput.emit(Map.of("status", "ok", "refreshToken", result.refreshToken, "userEmail", result.userEmail));
					} else {
						System.out.println();
						System.out.println("=== OAuth2 sign-in successful ===");
						System.out.println("userEmail:    " + result.userEmail);
						System.out.println("refreshToken: " + result.refreshToken);
					}
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

				if (jsonOutput.json) {
					jsonOutput.emit(Map.of("status", "ok", "userEmail", result.userEmail,
							"savedTo", emailConnectionFile.getAbsolutePath()));
				} else {
					System.out.println("=== OAuth2 sign-in successful ===");
					System.out.println("Signed in as : " + result.userEmail);
					System.out.println("Saved to     : " + emailConnectionFile.getAbsolutePath());
				}
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

		@Mixin
		JsonOutputMixin jsonOutput;

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
			jsonOutput.emitOk(Map.of("jobType", "burst", "input", inputFile != null ? inputFile.getAbsolutePath() : ""));
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

		@Mixin
		JsonOutputMixin jsonOutput;

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

			jsonOutput.emitOk(Map.of("jobType", "generate"));
			return 0;
		}
	}

	@Command(name = "system", description = "System operations", subcommands = {
			MainProgram.SystemCommand.TestSmsCommand.class,
			MainProgram.SystemCommand.LicenseCommand.class,
			MainProgram.SystemCommand.FeatureRequestCommand.class,
			MainProgram.ServiceCommand.class })
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

			@Mixin
			JsonOutputMixin jsonOutput;

			@Override
			protected MainProgram getMainProgram() {
				return systemCommand.parent;
			}

			@Override
			public Integer call() throws Exception {
				try {
					CliJob job = getJob(config.configFile);
					job.doCheckTwilio(fromNumber, toNumber);
					jsonOutput.emitOk(Map.of("from", fromNumber, "to", toNumber));
					return 0;
				} catch (Exception e) {
					jsonOutput.emitError(e.getMessage(), Map.of("from", fromNumber, "to", toNumber));
					throw e;
				}
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
				@Mixin
				JsonOutputMixin jsonOutput;

				@Override
				public Integer call() throws Exception {
					CliJob job = getJob(null);
					job.doActivateLicenseKey();
					jsonOutput.emitOk(Map.of("status", "activated"));
					return 0;
				}
			}

			@Command(name = "deactivate", description = "Deactivate license key")
			public static class DeactivateCommand extends LicenseBaseCommand implements Callable<Integer> {
				@Mixin
				JsonOutputMixin jsonOutput;

				@Override
				public Integer call() throws Exception {
					CliJob job = getJob(null);
					job.doDeactivateLicense();
					jsonOutput.emitOk(Map.of("status", "deactivated"));
					return 0;
				}
			}

			@Command(name = "check", description = "Check license status")
			public static class CheckCommand extends LicenseBaseCommand implements Callable<Integer> {
				@Mixin
				JsonOutputMixin jsonOutput;

				@Override
				public Integer call() throws Exception {
					CliJob job = getJob(null);
					job.doCheckLicense();
					jsonOutput.emitOk(Map.of("licenseChecked", true));
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

			@Mixin
			JsonOutputMixin jsonOutput;

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
				jsonOutput.emitOk(Map.of("status", "ok"));
				return 0;
			}
		}

	}

	@Command(name = "jasper", description = "Compile, fill, and export JasperReports (.jrxml) reports")
	public static class JasperCommand extends BaseCommand implements Callable<Integer> {
		@Spec
		CommandSpec spec;

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
			CommandLine cl = spec.commandLine();
			while (cl.getParent() != null) cl = cl.getParent();
			return (MainProgram) cl.getCommand();
		}

		@Override
		public Integer call() throws Exception {
			CliJob job = getJob(null);
			job.doJasperReport(reportDir, jrxml, format, out, jdbcUrl, jdbcUser, jdbcPass, params);
			return 0;
		}
	}

	@Command(name = "service", description = "Manage services (e.g., databases, queues) via Docker.", mixinStandardHelpOptions = false, customSynopsis = "service <category> <command> [service-name] [args...]", subcommands = {
			MainProgram.ServiceCommand.StatusCommand.class })
	public static class ServiceCommand extends BaseCommand implements Callable<Integer> {

		@ParentCommand
		SystemCommand systemCommand;

		@Override
		protected MainProgram getMainProgram() {
			return systemCommand.parent;
		}

		// Use arity = "1..*" to capture all remaining args
		@Parameters(description = "The full service command string (e.g., 'database start northwind postgresql').", arity = "1..*")
		private List<String> commandAndArgs;

		// Capture unmatched options like --no-cache, --build, --liquibase
		@CommandLine.Unmatched
		private List<String> unmatchedArgs;

		@Mixin
		JsonOutputMixin jsonOutput;

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

			jsonOutput.emitOk(Map.of("service", serviceName, "command", commandLine));
			return 0;
		}

		@Command(name = "status", description = "Show health status of managed services")
		public static class StatusCommand extends BaseCommand implements Callable<Integer> {
			@ParentCommand
			ServiceCommand serviceCommand;

			@Parameters(index = "0", arity = "0..1", description = "Optional service name to filter (e.g. clickhouse, northwind)")
			private String serviceName;

			@Mixin
			JsonOutputMixin jsonOutput;

			@Override
			protected MainProgram getMainProgram() { return serviceCommand.systemCommand.parent; }

			@Override
			public Integer call() throws Exception {
				String cmd = (serviceName != null && !serviceName.isBlank())
						? "database info northwind " + serviceName
						: "database list";
				ServicesManager.Result result = ServicesManager.execute(cmd);
				if (jsonOutput.json) {
					jsonOutput.emit(Map.of("services", result.output != null ? result.output : "",
							"status", result.status != null ? result.status : "unknown"));
				} else {
					System.out.println(result.output);
				}
				return "error".equals(result.status) ? 1 : 0;
			}
		}
	}


}
